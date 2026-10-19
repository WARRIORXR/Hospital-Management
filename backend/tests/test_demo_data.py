"""Tests for the historical dataset importer and its admin endpoint.

The importer runs against its own throwaway SQLite database so the exact row
counts of the checked-in CSVs can be asserted without disturbing the
operational data the API tests rely on.
"""

import os
from collections import Counter
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import import_demo_data as importer
import main
from conftest import patient_headers
from database import Base
from models import (
    DemoImportMeta,
    DemoVisit,
    Department,
    Doctor,
    OPDSchedule,
    Patient,
    ServiceWeekly,
    StaffMember,
    StaffShift,
)

SERVICES = set(importer.SERVICES)


@pytest.fixture(scope="module")
def imported(tmp_path_factory):
    """Import the CSVs into an isolated database once for the read-only tests."""
    path = tmp_path_factory.mktemp("demo-dataset") / "demo.db"
    engine = create_engine(
        f"sqlite:///{path}", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
    report = importer.import_dataset(session, seed_live=True, per_service=2)
    try:
        yield session, report
    finally:
        session.close()
        engine.dispose()


def test_imports_every_csv_row(imported):
    session, report = imported

    assert report["patients"] == {
        "rows": 1000,
        "valid": 1000,
        "imported_now": 1000,
        "total_stored": 1000,
    }
    assert report["weekly"]["rows"] == 208
    assert report["weekly"]["total_stored"] == 208
    assert report["staff"]["rows"] == 110
    assert report["staff"]["roles"] == {
        "doctor": 18,
        "nurse": 69,
        "nursing_assistant": 23,
    }
    assert report["schedule"]["rows"] == 6552
    assert report["schedule"]["accepted"] == 5720
    assert report["schedule"]["total_stored"] == 5720
    assert report["departments"]["created_now"] == 4
    assert report["doctors"]["imported_now"] == 18

    assert session.query(DemoVisit).count() == 1000
    assert session.query(ServiceWeekly).count() == 208
    assert session.query(StaffMember).count() == 110
    assert session.query(StaffShift).count() == 5720

    stored = session.query(DemoImportMeta).filter_by(key="report").one()
    assert stored.value.startswith("{")


def test_every_service_and_week_is_complete(imported):
    session, _ = imported

    visits_per_service = Counter(v.service for v in session.query(DemoVisit).all())
    assert set(visits_per_service) == SERVICES
    assert sum(visits_per_service.values()) == 1000

    weekly = session.query(ServiceWeekly).all()
    assert {row.week for row in weekly} == set(range(1, 53))
    assert len(weekly) == 52 * len(SERVICES)
    for row in weekly:
        assert row.service in SERVICES
        assert row.patients_request == row.patients_admitted + row.patients_refused
        assert 0 <= row.patients_admitted <= row.available_beds


def test_visit_rows_are_plausible(imported):
    session, _ = imported
    visits = session.query(DemoVisit).all()

    assert {v.patient_ref for v in visits} == {v.patient_ref for v in visits}
    assert len({v.patient_ref for v in visits}) == 1000
    for visit in visits:
        assert visit.departure_date >= visit.arrival_date
        assert 0 <= visit.age <= 120
        assert visit.satisfaction is None or 0 <= visit.satisfaction <= 100


def test_schedule_is_joined_by_name_and_rejects_unknown_staff(imported):
    session, report = imported
    schedule = report["schedule"]

    # 832 rows belong to 16 names that exist in patients.csv, not staff.csv.
    assert schedule["rejected"] == 832
    assert schedule["rejected_name_count"] == 16
    assert schedule["role_service_conflicts"] == 77

    roster_names = {member.name for member in session.query(StaffMember).all()}
    assert not (set(schedule["rejected_names"]) & roster_names)

    patient_names = {visit.name for visit in session.query(DemoVisit).all()}
    assert set(schedule["rejected_names"]) <= patient_names

    # Every accepted shift points at a real roster member, once per week.
    by_id = {member.id: member for member in session.query(StaffMember).all()}
    per_member = Counter()
    for shift in session.query(StaffShift).all():
        assert shift.staff_id in by_id
        assert 1 <= shift.week <= 52
        assert by_id[shift.staff_id].service in SERVICES
        per_member[(shift.staff_id, shift.week)] += 1
    assert set(per_member.values()) == {1}
    assert len(per_member) == 5720
    assert all(by_id[staff_id].name not in schedule["rejected_names"] for staff_id in by_id)


def test_import_is_idempotent(imported):
    session, first = imported
    before = (
        session.query(DemoVisit).count(),
        session.query(ServiceWeekly).count(),
        session.query(StaffMember).count(),
        session.query(StaffShift).count(),
        session.query(Patient).count(),
    )

    second = importer.import_dataset(session, seed_live=True, per_service=2)

    assert second["patients"]["imported_now"] == 0
    assert second["weekly"]["imported_now"] == 0
    assert second["staff"]["imported_now"] == 0
    assert second["schedule"]["imported_now"] == 0
    assert second["doctors"]["imported_now"] == 0
    assert second["departments"]["created_now"] == 0
    assert second["schedule"]["total_stored"] == first["schedule"]["total_stored"]

    after = (
        session.query(DemoVisit).count(),
        session.query(ServiceWeekly).count(),
        session.query(StaffMember).count(),
        session.query(StaffShift).count(),
        session.query(Patient).count(),
    )
    assert after == before


def test_importer_adds_departments_and_doctors_for_each_service(imported):
    session, _ = imported

    departments = {
        department.code: department
        for department in session.query(Department)
        .filter(Department.code.in_(SERVICES))
        .all()
    }
    assert set(departments) == SERVICES

    for code, department in departments.items():
        doctors = (
            session.query(Doctor)
            .filter(Doctor.department_id == department.id)
            .all()
        )
        assert doctors, code
        for doctor in doctors:
            assert doctor.room_number.startswith(importer.DEMO_ROOM_PREFIX)
            schedule = (
                session.query(OPDSchedule)
                .filter(OPDSchedule.doctor_id == doctor.id)
                .one()
            )
            assert schedule.department_id == department.id


def test_live_queue_seed_creates_todays_tokens(imported):
    session, report = imported
    seeded = (
        session.query(Patient)
        .filter(Patient.phone.like(f"{importer.LIVE_PHONE_PREFIX}%"))
        .all()
    )

    assert report["live_queue"] == {"queued_now": 8, "per_service": 2}
    assert len(seeded) == 8
    assert {patient.department for patient in seeded} == SERVICES
    assert {patient.status for patient in seeded} == {"waiting"}
    assert len({patient.phone for patient in seeded}) == 8
    per_department = Counter(patient.department for patient in seeded)
    assert set(per_department.values()) == {2}


@pytest.fixture()
def demo_rows(db):
    """Add a couple of historical rows to the app database, then clean up."""
    db.query(StaffShift).delete()
    db.query(StaffMember).delete()
    db.query(ServiceWeekly).delete()
    db.query(DemoVisit).delete()
    db.query(DemoImportMeta).delete()
    db.commit()

    visit = DemoVisit(
        patient_ref="PAT-test-1",
        name="Demo Visit",
        age=40,
        arrival_date=date(2025, 3, 1),
        departure_date=date(2025, 3, 5),
        service="emergency",
        satisfaction=80,
    )
    staff = StaffMember(
        staff_ref="STF-test-1", name="Demo Nurse", role="nurse", service="emergency"
    )
    db.add_all([visit, staff])
    db.commit()

    db.add_all(
        [
            StaffShift(staff_id=staff.id, week=1, present=True),
            StaffShift(staff_id=staff.id, week=2, present=False),
            ServiceWeekly(
                week=1,
                month=1,
                service="emergency",
                available_beds=10,
                patients_request=12,
                patients_admitted=10,
                patients_refused=2,
                patient_satisfaction=70,
                staff_morale=60,
                event="none",
            ),
        ]
    )
    db.commit()

    yield

    db.query(StaffShift).delete()
    db.query(StaffMember).delete()
    db.query(ServiceWeekly).delete()
    db.query(DemoVisit).delete()
    db.query(DemoImportMeta).delete()
    db.commit()


def _header(client, role: str) -> dict[str, str]:
    codes = {
        "admin": ("ADMIN_CODE", "ADM-001"),
        "hospital": ("HOSPITAL_CODE", "HOSP-001"),
        "staff": ("STAFF_CODE", "DR-101"),
    }
    pins = {
        "admin": ("ADMIN_PIN", "123456"),
        "hospital": ("HOSPITAL_PIN", "123456"),
        "staff": ("STAFF_PIN", "123456"),
    }
    code_env, code_default = codes[role]
    pin_env, pin_default = pins[role]
    response = client.post(
        "/auth/staff-login",
        json={
            "employee_code": os.environ.get(code_env, code_default),
            "pin": os.environ.get(pin_env, pin_default),
        },
    )
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_demo_overview_requires_admin(client, demo_rows):
    # The shared client carries a staff token, so use a clean one for the
    # unauthenticated check.
    with TestClient(main.app) as anonymous:
        assert anonymous.get("/demo/overview").status_code == 401
    assert client.get("/demo/overview", headers=_header(client, "staff")).status_code == 403
    assert client.get("/demo/overview", headers=_header(client, "hospital")).status_code == 403
    assert (
        client.get("/demo/overview", headers=patient_headers(client, "9000000123")).status_code
        == 401
    )


def test_demo_overview_aggregates_the_dataset(client, demo_rows):
    response = client.get("/demo/overview", headers=_header(client, "admin"))
    assert response.status_code == 200, response.text
    data = response.json()

    assert data["available"] is True
    assert data["dataset"] == {
        "visits": 1,
        "staff": 1,
        "weeks": 1,
        "services": 1,
        "shifts": 2,
        "avg_length_of_stay": 4.0,
        "avg_satisfaction": 80.0,
    }

    service = data["services"][0]
    assert service == {
        "service": "emergency",
        "visits": 1,
        "avg_length_of_stay": 4.0,
        "avg_satisfaction": 80.0,
        "staff": 1,
        "attendance_pct": 50.0,
    }

    assert data["weekly"] == [
        {
            "week": 1,
            "requested": 12,
            "admitted": 10,
            "refused": 2,
            "satisfaction": 70.0,
            "morale": 60.0,
        }
    ]
    assert data["staff_attendance"] == [
        {
            "name": "Demo Nurse",
            "role": "nurse",
            "service": "emergency",
            "present": 1,
            "total": 2,
            "attendance_pct": 50.0,
        }
    ]


def test_demo_overview_reports_missing_dataset(client, db):
    db.query(StaffShift).delete()
    db.query(StaffMember).delete()
    db.query(ServiceWeekly).delete()
    db.query(DemoVisit).delete()
    db.commit()

    response = client.get("/demo/overview", headers=_header(client, "admin"))
    assert response.status_code == 200
    assert response.json() == {
        "available": False,
        "dataset": None,
        "services": [],
        "weekly": [],
        "staff_attendance": [],
        "data_quality": None,
    }


def test_patient_registration_accepts_imported_services(imported):
    """Every imported service is a department patients can register into."""
    from pydantic import ValidationError

    from schemas.patient import PatientCreate

    for service in SERVICES:
        payload = PatientCreate(
            name="Demo Patient",
            age=35,
            phone="9000000000",
            department=service,
            priority="regular",
        )
        assert payload.department.value == service

    with pytest.raises(ValidationError):
        PatientCreate(
            name="Demo Patient",
            age=35,
            phone="9000000000",
            department="not_a_department",
            priority="regular",
        )


def test_registration_works_for_an_imported_department(client, db):
    """A patient can take a token in a department the importer created."""
    department = Department(
        code="icu",
        name="Intensive Care Unit",
        description="Critical care",
        is_active=True,
    )
    db.add(department)
    db.commit()

    try:
        response = client.post(
            "/patients",
            json={
                "name": "Demo Patient",
                "age": 40,
                "phone": "9222222222",
                "department": "icu",
                "priority": "regular",
            },
            headers=patient_headers(client, "9222222222"),
        )
        assert response.status_code == 201, response.text
        assert response.json()["department"] == "icu"
        assert response.json()["token_number"] == 1
    finally:
        db.query(Patient).filter(Patient.department == "icu").delete()
        db.query(Department).filter(Department.code == "icu").delete()
        db.commit()


def test_registration_rejects_a_department_that_is_not_imported(client):
    response = client.post(
        "/patients",
        json={
            "name": "Demo Patient",
            "age": 40,
            "phone": "9222222223",
            "department": "surgery",
            "priority": "regular",
        },
        headers=patient_headers(client, "9222222223"),
    )
    assert response.status_code == 422
    assert "not available" in response.json()["detail"]
