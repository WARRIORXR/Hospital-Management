"""Import the historical hospital dataset into QueueLess.

The CSVs in ``backend/demo_data`` describe 1,000 completed visits, 52 weeks of
service load, a 110-person staff roster and a weekly attendance schedule.

What this does:

* adds the four dataset services as departments (Emergency, Surgery,
  General Medicine Ward, ICU), keeping the six demo OPDs;
* imports every CSV doctor into the clinical ``doctors`` table with an OPD
  schedule, so the new departments appear in the public and staff consoles;
* stores the historical visits, weekly stats and staff roster in dedicated
  ``demo_*`` tables (they are history, not live tokens);
* seeds a small "today" queue from the dataset so the live screens have data;
* records a data-quality report that the admin dashboard displays.

The staff schedule file is not joinable by id: none of its 126 ids exist in
``staff.csv``, 16 of its names are actually patients, and 77 matched names
contradict the roster on role/service. The roster is authoritative: shifts are
joined by name, schedule role/service values are ignored, and unmatched names
are rejected and reported.

Usage::

    python import_demo_data.py                 # import missing rows, refresh demo queue
    python import_demo_data.py --reset         # wipe the imported dataset first
    python import_demo_data.py --no-live-queue # history only
    python import_demo_data.py --live-per-service 10
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable

from sqlalchemy.orm import Session

from database import Base, SessionLocal, engine
from models import (
    Department,
    DemoImportMeta,
    DemoVisit,
    Doctor,
    OPDSchedule,
    Patient,
    ServiceWeekly,
    StaffMember,
    StaffShift,
)

DEMO_DATA_DIR = Path(__file__).resolve().parent / "demo_data"

# Live queue rows created by this importer are tagged with this phone prefix so
# they can be refreshed without touching real registrations.
LIVE_PHONE_PREFIX = "90000009"
DEMO_ROOM_PREFIX = "DEMO-"

ALLOWED_ROLES = {"doctor", "nurse", "nursing_assistant"}

SERVICES = {
    "emergency": {
        "name": "Emergency",
        "description": "24x7 emergency and trauma care",
        "timing": "24x7",
    },
    "surgery": {
        "name": "Surgery",
        "description": "Surgical admissions and procedures",
        "timing": "8 AM - 8 PM",
    },
    "general_medicine": {
        "name": "General Medicine Ward",
        "description": "Inpatient general medicine",
        "timing": "9 AM - 6 PM",
    },
    "icu": {
        "name": "Intensive Care Unit",
        "description": "Critical care and intensive monitoring",
        "timing": "24x7",
    },
}

HOSPITAL_TIMEZONE = timezone(timedelta(hours=5, minutes=30))


class DemoDataError(RuntimeError):
    """Raised when a CSV cannot be imported safely."""


# ---------------------------------------------------------------------------
# LOADING & VALIDATION
# ---------------------------------------------------------------------------

def _load_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        raise DemoDataError(f"Missing dataset file: {path}")
    with path.open(newline="", encoding="utf-8-sig") as handle:
        return list(csv.DictReader(handle))


def _require_int(value: str | None, field: str, context: str) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        raise DemoDataError(f"{context}: {field} is not an integer ({value!r})")


def _normalize_service(value: str | None) -> str | None:
    """Map CSV service labels (``ICU``, ``general_medicine``) to internal codes."""
    code = (value or "").strip().lower().replace(" ", "_")
    return code if code in SERVICES else None


def _parse_date(value: str | None, field: str, context: str) -> date:
    try:
        return date.fromisoformat(str(value).strip())
    except (TypeError, ValueError):
        raise DemoDataError(f"{context}: {field} is not an ISO date ({value!r})")


def validate_patients(rows: Iterable[dict[str, str]]) -> list[dict]:
    """Return cleaned visit dicts; raise on duplicate ids or impossible dates."""
    visits: list[dict] = []
    seen_refs: set[str] = set()
    problems: list[str] = []

    for index, row in enumerate(rows, start=2):
        context = f"patients.csv line {index}"
        patient_ref = (row.get("patient_id") or "").strip()
        if not patient_ref:
            problems.append(f"{context}: missing patient_id")
            continue
        if patient_ref in seen_refs:
            problems.append(f"{context}: duplicate patient_id {patient_ref}")
            continue

        name = (row.get("name") or "").strip()
        service = _normalize_service(row.get("service"))
        if not name:
            problems.append(f"{context}: missing name")
            continue
        if service is None:
            problems.append(f"{context}: unknown service {row.get('service')!r}")
            continue

        age = _require_int(row.get("age"), "age", context)
        if not 0 <= age <= 120:
            problems.append(f"{context}: age {age} out of range")
            continue

        arrival = _parse_date(row.get("arrival_date"), "arrival_date", context)
        departure = _parse_date(row.get("departure_date"), "departure_date", context)
        if departure < arrival:
            problems.append(f"{context}: departure before arrival")
            continue

        satisfaction_raw = (row.get("satisfaction") or "").strip()
        satisfaction = int(satisfaction_raw) if satisfaction_raw else None
        if satisfaction is not None and not 0 <= satisfaction <= 100:
            problems.append(f"{context}: satisfaction {satisfaction} out of range")
            continue

        seen_refs.add(patient_ref)
        visits.append(
            {
                "patient_ref": patient_ref,
                "name": name,
                "age": age,
                "arrival_date": arrival,
                "departure_date": departure,
                "service": service,
                "satisfaction": satisfaction,
            }
        )

    if problems:
        raise DemoDataError("Patient dataset failed validation:\n" + "\n".join(problems[:20]))
    return visits


def validate_weekly(rows: Iterable[dict[str, str]]) -> list[dict]:
    """Validate weekly service load; every row must balance."""
    records: list[dict] = []
    seen: set[tuple[int, str]] = set()
    problems: list[str] = []

    for index, row in enumerate(rows, start=2):
        context = f"services_weekly.csv line {index}"
        service = _normalize_service(row.get("service"))
        if service is None:
            problems.append(f"{context}: unknown service {row.get('service')!r}")
            continue

        week = _require_int(row.get("week"), "week", context)
        month = _require_int(row.get("month"), "month", context)
        if (week, service) in seen:
            problems.append(f"{context}: duplicate week {week} for {service}")
            continue
        if not 1 <= month <= 12:
            problems.append(f"{context}: month {month} out of range")
            continue

        beds = _require_int(row.get("available_beds"), "available_beds", context)
        requested = _require_int(row.get("patients_request"), "patients_request", context)
        admitted = _require_int(row.get("patients_admitted"), "patients_admitted", context)
        refused = _require_int(row.get("patients_refused"), "patients_refused", context)
        satisfaction = _require_int(row.get("patient_satisfaction"), "patient_satisfaction", context)
        morale = _require_int(row.get("staff_morale"), "staff_morale", context)

        if min(beds, requested, admitted, refused) < 0:
            problems.append(f"{context}: negative volume")
            continue
        if admitted + refused != requested:
            problems.append(f"{context}: admitted + refused != requested")
            continue
        if admitted > beds:
            problems.append(f"{context}: admitted {admitted} exceeds beds {beds}")
            continue
        if not 0 <= satisfaction <= 100 or not 0 <= morale <= 100:
            problems.append(f"{context}: satisfaction/morale out of range")
            continue

        seen.add((week, service))
        records.append(
            {
                "week": week,
                "month": month,
                "service": service,
                "available_beds": beds,
                "patients_request": requested,
                "patients_admitted": admitted,
                "patients_refused": refused,
                "patient_satisfaction": satisfaction,
                "staff_morale": morale,
                "event": (row.get("event") or "none").strip(),
            }
        )

    if problems:
        raise DemoDataError("Weekly dataset failed validation:\n" + "\n".join(problems[:20]))
    return records


def validate_staff(rows: Iterable[dict[str, str]]) -> list[dict]:
    staff: list[dict] = []
    seen: set[str] = set()
    problems: list[str] = []

    for index, row in enumerate(rows, start=2):
        context = f"staff.csv line {index}"
        staff_ref = (row.get("staff_id") or "").strip()
        name = (row.get("staff_name") or "").strip()
        role = (row.get("role") or "").strip()
        service = _normalize_service(row.get("service"))

        if not staff_ref or staff_ref in seen:
            problems.append(f"{context}: missing or duplicate staff_id {staff_ref!r}")
            continue
        if not name:
            problems.append(f"{context}: missing staff_name")
            continue
        if role not in ALLOWED_ROLES:
            problems.append(f"{context}: unknown role {role!r}")
            continue
        if service is None:
            problems.append(f"{context}: unknown service {row.get('service')!r}")
            continue

        seen.add(staff_ref)
        staff.append(
            {"staff_ref": staff_ref, "name": name, "role": role, "service": service}
        )

    if problems:
        raise DemoDataError("Staff dataset failed validation:\n" + "\n".join(problems[:20]))
    return staff


def resolve_schedule(
    rows: Iterable[dict[str, str]], staff: list[dict]
) -> tuple[list[dict], dict]:
    """Join shifts to the roster by name; reject unknown names.

    The schedule file's own ids never match the roster and its role/service
    columns contradict it for most people, so only name + week + present are
    trusted. The roster supplies identity, role and service.
    """
    roster_by_name: dict[str, list[dict]] = {}
    for member in staff:
        roster_by_name.setdefault(member["name"], []).append(member)

    accepted: list[dict] = []
    rejected_names: Counter[str] = Counter()
    rejected_rows = 0
    conflict_names: set[str] = set()

    for row in rows:
        name = (row.get("staff_name") or "").strip()
        week = _require_int(row.get("week"), "week", f"staff_schedule.csv ({name})")
        present_raw = (row.get("present") or "").strip()
        if present_raw not in {"0", "1"}:
            raise DemoDataError(
                f"staff_schedule.csv: present must be 0 or 1 for {name} week {week}"
            )

        roster_rows = roster_by_name.get(name)
        if not roster_rows:
            rejected_names[name] += 1
            rejected_rows += 1
            continue

        schedule_role = (row.get("role") or "").strip()
        schedule_service = _normalize_service(row.get("service")) or ""

        # Prefer the roster row the schedule claims, but never adopt its values.
        member = next(
            (
                candidate
                for candidate in roster_rows
                if candidate["role"] == schedule_role
                and candidate["service"] == schedule_service
            ),
            roster_rows[0],
        )
        if (member["role"], member["service"]) != (schedule_role, schedule_service):
            conflict_names.add(name)

        accepted.append(
            {
                "name": name,
                "staff_ref": member["staff_ref"],
                "week": week,
                "present": present_raw == "1",
            }
        )

    report = {
        "rows": len(accepted) + rejected_rows,
        "accepted": len(accepted),
        "rejected": rejected_rows,
        "rejected_names": sorted(rejected_names),
        "rejected_name_count": len(rejected_names),
        "role_service_conflicts": len(conflict_names),
    }
    return accepted, report


# ---------------------------------------------------------------------------
# IMPORT STEPS
# ---------------------------------------------------------------------------

def _ensure_departments(db: Session) -> dict[str, Department]:
    departments: dict[str, Department] = {}
    created = 0

    for code, meta in SERVICES.items():
        department = db.query(Department).filter(Department.code == code).first()
        if department is None:
            department = Department(
                code=code,
                name=meta["name"],
                description=meta["description"],
                is_active=True,
            )
            db.add(department)
            db.flush()
            created += 1
        departments[code] = department

    return {"departments": departments, "created": created}


def _import_doctors(db: Session, staff: list[dict], departments: dict[str, Department]) -> int:
    """Import roster doctors as clinical staff with one OPD schedule each."""
    doctors = [member for member in staff if member["role"] == "doctor"]
    existing = {
        (doctor.name, doctor.department_id)
        for doctor in db.query(Doctor)
        .filter(Doctor.room_number.like(f"{DEMO_ROOM_PREFIX}%"))
        .all()
    }

    per_service_counter: Counter[str] = Counter()
    imported = 0

    for member in doctors:
        service = member["service"]
        department = departments[service]
        per_service_counter[service] += 1

        key = (member["name"], department.id)
        if key in existing:
            continue

        doctor = Doctor(
            name=member["name"],
            specialization=SERVICES[service]["name"],
            room_number=f"{DEMO_ROOM_PREFIX}{service}-{per_service_counter[service]:02d}",
            is_available=True,
            department_id=department.id,
        )
        db.add(doctor)
        db.flush()

        db.add(
            OPDSchedule(
                department_id=department.id,
                doctor_id=doctor.id,
                timing=SERVICES[service]["timing"],
                is_active=True,
            )
        )
        imported += 1

    return imported


def _import_visits(db: Session, visits: list[dict]) -> int:
    existing = {ref for (ref,) in db.query(DemoVisit.patient_ref).all()}
    added = 0

    for visit in visits:
        if visit["patient_ref"] in existing:
            continue
        db.add(DemoVisit(**visit))
        added += 1

    return added


def _import_weekly(db: Session, weekly: list[dict]) -> int:
    existing = {(week, service) for week, service in db.query(ServiceWeekly.week, ServiceWeekly.service).all()}
    added = 0

    for record in weekly:
        if (record["week"], record["service"]) in existing:
            continue
        db.add(ServiceWeekly(**record))
        added += 1

    return added


def _import_staff(
    db: Session, staff: list[dict], departments: dict[str, Department]
) -> tuple[dict[str, StaffMember], int]:
    existing = {member.staff_ref: member for member in db.query(StaffMember).all()}
    added = 0

    for member in staff:
        if member["staff_ref"] in existing:
            continue
        row = StaffMember(
            staff_ref=member["staff_ref"],
            name=member["name"],
            role=member["role"],
            service=member["service"],
            department_id=departments[member["service"]].id,
        )
        db.add(row)
        db.flush()
        existing[member["staff_ref"]] = row
        added += 1

    return existing, added


def _import_shifts(db: Session, accepted: list[dict], staff_by_ref: dict[str, StaffMember]) -> int:
    existing = {
        (staff_id, week)
        for staff_id, week in db.query(StaffShift.staff_id, StaffShift.week).all()
    }
    added = 0

    for shift in accepted:
        member = staff_by_ref.get(shift["staff_ref"])
        if member is None:
            continue
        key = (member.id, shift["week"])
        if key in existing:
            continue
        db.add(StaffShift(staff_id=member.id, week=shift["week"], present=shift["present"]))
        existing.add(key)
        added += 1

    return added


def _today_start_utc() -> datetime:
    local_now = datetime.now(HOSPITAL_TIMEZONE)
    local_midnight = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    return local_midnight.astimezone(timezone.utc).replace(tzinfo=None)


def _priority_for(service: str, age: int) -> str:
    if service == "icu":
        return "emergency"
    if service == "emergency" and age >= 60:
        return "emergency"
    if age >= 65:
        return "elderly"
    return "regular"


def seed_live_queue(db: Session, per_service: int = 6) -> int:
    """Replace the demo live queue with a fresh set of today's waiting tokens."""
    db.query(Patient).filter(Patient.phone.like(f"{LIVE_PHONE_PREFIX}%")).delete(
        synchronize_session=False
    )
    db.flush()

    start_of_day = _today_start_utc()
    serial = 0

    for code in SERVICES:
        candidates = (
            db.query(DemoVisit)
            .filter(DemoVisit.service == code)
            .order_by(DemoVisit.arrival_date.desc())
            .limit(200)
            .all()
        )

        chosen = []
        seen_names: set[str] = set()
        for visit in candidates:
            if visit.name in seen_names:
                continue
            seen_names.add(visit.name)
            chosen.append(visit)
            if len(chosen) == per_service:
                break

        token = (
            db.query(Patient.token_number)
            .filter(
                Patient.department == code,
                Patient.created_at >= start_of_day,
            )
            .order_by(Patient.token_number.desc())
            .first()
        )
        next_token = (token[0] if token else 0) + 1

        for offset, visit in enumerate(chosen):
            serial += 1
            db.add(
                Patient(
                    name=visit.name,
                    age=visit.age,
                    phone=f"{LIVE_PHONE_PREFIX}{serial:02d}",
                    department=code,
                    token_number=next_token + offset,
                    status="waiting",
                    symptoms=f"{SERVICES[code]['name']} demo visit",
                    priority=_priority_for(code, visit.age),
                    created_at=datetime.now(timezone.utc).replace(tzinfo=None),
                )
            )

    db.flush()
    return serial


def reset_demo_dataset(db: Session) -> None:
    """Remove imported demo rows without touching operational real data."""
    demo_departments = (
        db.query(Department).filter(Department.code.in_(list(SERVICES))).all()
    )
    department_ids = [department.id for department in demo_departments]

    db.query(Patient).filter(Patient.phone.like(f"{LIVE_PHONE_PREFIX}%")).delete(
        synchronize_session=False
    )

    if department_ids:
        demo_doctor_ids = [
            doctor.id
            for doctor in db.query(Doctor)
            .filter(Doctor.department_id.in_(department_ids))
            .all()
        ]
        db.query(OPDSchedule).filter(
            OPDSchedule.department_id.in_(department_ids)
        ).delete(synchronize_session=False)
        if demo_doctor_ids:
            db.query(Doctor).filter(Doctor.id.in_(demo_doctor_ids)).delete(
                synchronize_session=False
            )
        db.query(Department).filter(Department.id.in_(department_ids)).delete(
            synchronize_session=False
        )

    db.query(StaffShift).delete(synchronize_session=False)
    db.query(StaffMember).delete(synchronize_session=False)
    db.query(ServiceWeekly).delete(synchronize_session=False)
    db.query(DemoVisit).delete(synchronize_session=False)
    db.query(DemoImportMeta).delete(synchronize_session=False)
    db.commit()


def import_dataset(
    db: Session,
    data_dir: Path | str = DEMO_DATA_DIR,
    *,
    seed_live: bool = True,
    per_service: int = 6,
    reset: bool = False,
) -> dict:
    """Import the dataset and return a machine-readable report."""
    data_dir = Path(data_dir)

    patient_rows = _load_rows(data_dir / "patients.csv")
    weekly_rows = _load_rows(data_dir / "services_weekly.csv")
    staff_rows = _load_rows(data_dir / "staff.csv")
    schedule_rows = _load_rows(data_dir / "staff_schedule.csv")

    visits = validate_patients(patient_rows)
    weekly = validate_weekly(weekly_rows)
    staff = validate_staff(staff_rows)
    accepted_shifts, schedule_report = resolve_schedule(schedule_rows, staff)

    if reset:
        reset_demo_dataset(db)
        db.flush()

    departments_info = _ensure_departments(db)
    departments = departments_info["departments"]

    doctors_imported = _import_doctors(db, staff, departments)
    visits_added = _import_visits(db, visits)
    weekly_added = _import_weekly(db, weekly)
    staff_by_ref, staff_added = _import_staff(db, staff, departments)
    shifts_added = _import_shifts(db, accepted_shifts, staff_by_ref)

    live_queued = seed_live_queue(db, per_service=per_service) if seed_live else 0

    total_visits = db.query(DemoVisit).count()
    total_weekly = db.query(ServiceWeekly).count()
    total_staff = db.query(StaffMember).count()
    total_shifts = db.query(StaffShift).count()

    lengths = [
        (visit["departure_date"] - visit["arrival_date"]).days for visit in visits
    ]
    satisfactions = [
        visit["satisfaction"] for visit in visits if visit["satisfaction"] is not None
    ]

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source_dir": str(data_dir),
        "patients": {
            "rows": len(patient_rows),
            "valid": len(visits),
            "imported_now": visits_added,
            "total_stored": total_visits,
        },
        "weekly": {
            "rows": len(weekly_rows),
            "valid": len(weekly),
            "imported_now": weekly_added,
            "total_stored": total_weekly,
        },
        "staff": {
            "rows": len(staff_rows),
            "valid": len(staff),
            "imported_now": staff_added,
            "total_stored": total_staff,
            "roles": dict(Counter(member["role"] for member in staff)),
        },
        "schedule": {
            **{key: value for key, value in schedule_report.items() if key != "rejected_names"},
            "rejected_names": schedule_report["rejected_names"][:20],
            "imported_now": shifts_added,
            "total_stored": total_shifts,
        },
        "departments": {
            "created_now": departments_info["created"],
            "codes": list(SERVICES),
        },
        "doctors": {"imported_now": doctors_imported},
        "live_queue": {"queued_now": live_queued, "per_service": per_service},
        "averages": {
            "length_of_stay_days": round(sum(lengths) / len(lengths), 2) if lengths else 0,
            "satisfaction": round(sum(satisfactions) / len(satisfactions), 2)
            if satisfactions
            else 0,
        },
    }

    meta = db.query(DemoImportMeta).filter(DemoImportMeta.key == "report").first()
    if meta is None:
        db.add(DemoImportMeta(key="report", value=json.dumps(report, ensure_ascii=False)))
    else:
        meta.value = json.dumps(report, ensure_ascii=False)

    db.commit()
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Import the QueueLess demo dataset.")
    parser.add_argument("--reset", action="store_true", help="wipe imported demo data first")
    parser.add_argument(
        "--no-live-queue",
        action="store_true",
        help="import history only; leave the live queue untouched",
    )
    parser.add_argument(
        "--live-per-service",
        type=int,
        default=6,
        help="waiting tokens to create per service for today (default: 6)",
    )
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)

    session = SessionLocal()
    try:
        report = import_dataset(
            session,
            seed_live=not args.no_live_queue,
            per_service=max(0, args.live_per_service),
            reset=args.reset,
        )
    finally:
        session.close()

    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
