import json
import os
import re
import secrets
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from threading import Lock

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import func, inspect, text
from sqlalchemy.orm import Session

from database import engine, Base, get_db, SessionLocal
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
    User,
)
from schemas.patient import PatientCreate
from schemas.department import DepartmentCreate, DepartmentOut
from schemas.doctor import DoctorCreate, DoctorOut
from auth import (
    check_login_rate_limit,
    claims_may_access,
    create_token,
    hash_pin,
    optional_access_token,
    record_login_failure,
    reset_login_attempts,
    require_patient_or_role,
    require_patient_token,
    require_role,
    verify_pin,
)


# --------------------------------------------------
# DATABASE SETUP & SEEDING
# --------------------------------------------------

Base.metadata.create_all(bind=engine)


def ensure_schema():
    """Add columns introduced after the first release to existing databases."""
    inspector = inspect(engine)
    if "patients" not in inspector.get_table_names():
        return

    columns = {column["name"] for column in inspector.get_columns("patients")}
    if "created_at" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE patients ADD COLUMN created_at TIMESTAMP"))
            connection.execute(
                text("UPDATE patients SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL")
            )


ensure_schema()


def seed_initial_data():
    """Seeds default departments, doctors, and schedules if empty."""
    db = SessionLocal()
    try:
        if db.query(Department).count() == 0:
            departments_seed = [
                ("cardiology", "Cardiology", "Heart and cardiovascular care", "Dr. Sharma", "Cardiologist", "Room 204", "9 AM - 5 PM"),
                ("general", "General Medicine", "Primary healthcare & diagnostics", "Dr. Singh", "Physician", "Room 101", "9 AM - 6 PM"),
                ("orthopedics", "Orthopedics", "Bone, joint, and trauma care", "Dr. Kapoor", "Orthopedic Surgeon", "Room 302", "10 AM - 5 PM"),
                ("dental", "Dental", "Oral health and dental surgery", "Dr. Mehta", "Dentist", "Room 108", "10 AM - 4 PM"),
                ("neurology", "Neurology", "Brain, spine, and nerve disorders", "Dr. Verma", "Neurologist", "Room 401", "9 AM - 3 PM"),
                ("gastro", "Gastroenterology", "Digestive and liver health", "Dr. Malhotra", "Gastroenterologist", "Room 205", "9 AM - 2 PM"),
            ]

            for code, name, desc, doc_name, spec, room, timing in departments_seed:
                dept = Department(code=code, name=name, description=desc, is_active=True)
                db.add(dept)
                db.flush()

                doc = Doctor(name=doc_name, specialization=spec, room_number=room, is_available=True, department_id=dept.id)
                db.add(doc)
                db.flush()

                schedule = OPDSchedule(department_id=dept.id, doctor_id=doc.id, timing=timing, is_active=True)
                db.add(schedule)

            db.commit()
    finally:
        db.close()


seed_initial_data()


PORTAL_SEEDS = (
    ("admin", "ADMIN", "ADM-001", "System Administrator"),
    ("hospital", "HOSPITAL", "HOSP-001", "Hospital Manager"),
    ("staff", "STAFF", "DR-101", "Duty Doctor"),
)


def seed_portal_users():
    """Create portal logins (admin / hospital / staff) from env or dev defaults.

    Accounts are only created when the employee code does not exist yet, so
    rotating a PIN means changing the row (or recreating it), not a restart.
    """
    db = SessionLocal()
    try:
        for role, prefix, default_code, default_name in PORTAL_SEEDS:
            code = os.getenv(f"{prefix}_CODE", default_code).strip().upper()
            pin = os.getenv(f"{prefix}_PIN", "123456").strip()
            name = os.getenv(f"{prefix}_NAME", default_name).strip()
            if not code or not pin:
                continue
            exists = db.query(User).filter(User.employee_code == code).first()
            if exists:
                continue
            db.add(
                User(
                    employee_code=code,
                    pin_hash=hash_pin(pin),
                    role=role,
                    name=name,
                    is_active=True,
                )
            )
        db.commit()
    finally:
        db.close()


seed_portal_users()


# --------------------------------------------------
# FASTAPI APP
# --------------------------------------------------

app = FastAPI(
    title="QueueLess API",
    description="Intelligent Hospital Queue & Patient Flow System",
    version="1.0.0"
)


# --------------------------------------------------
# CORS
# --------------------------------------------------

frontend_origins = set()
for configured_origin in os.getenv("FRONTEND_ORIGINS", "").split(","):
    origin = configured_origin.strip().rstrip("/")
    if origin:
        if not origin.startswith(("http://", "https://")):
            origin = f"https://{origin}"
        frontend_origins.add(origin)

frontend_origins.update({
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://queueless.pages.dev",
})

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(frontend_origins),
    allow_origin_regex=r"^https://([a-zA-Z0-9-]+\.)?(pages\.dev|vercel\.app)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ApiPrefixMiddleware:
    """Allow FastAPI to seamlessly handle requests whether routed with or without an /api prefix.

    When deployed behind Vercel Services rewrites (e.g. /api/(.*) -> queueless-api),
    incoming requests retain the /api prefix. This middleware normalizes the ASGI path
    so that existing route definitions, docs, and test suites work identically.
    """

    def __init__(self, asgi_app):
        self.asgi_app = asgi_app

    async def __call__(self, scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            path = scope.get("path", "")
            if path == "/api":
                scope["path"] = "/"
            elif path.startswith("/api/"):
                scope["path"] = path[4:]
        await self.asgi_app(scope, receive, send)


app.add_middleware(ApiPrefixMiddleware)


# --------------------------------------------------
# CONSTANTS
# --------------------------------------------------

AVERAGE_CONSULTATION_TIME = 8

PRIORITY_ORDER = {
    "emergency": 1,
    "elderly": 2,
    "pregnant": 2,
    "follow_up": 3,
    "regular": 4
}

HOSPITAL_TIMEZONE = timezone(timedelta(hours=5, minutes=30))  # IST
ACTIVE_STATUSES = ("waiting", "called", "consulting")
TERMINAL_STATUSES = ("completed", "skipped", "cancelled")
PHONE_PATTERN = re.compile(r"^[0-9]{10}$")


def today_start_utc() -> datetime:
    """Naive UTC timestamp for midnight today in the hospital's timezone.

    Patient rows store naive UTC datetimes, so day-scoped queries compare
    against this value instead of relying on the server's local timezone.
    """
    local_now = datetime.now(HOSPITAL_TIMEZONE)
    local_midnight = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    return local_midnight.astimezone(timezone.utc).replace(tzinfo=None)


def get_patient_or_404(db: Session, patient_id: int) -> Patient:
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


def require_status(patient: Patient, allowed: tuple[str, ...], action: str) -> None:
    """Reject state changes that make no sense for the current visit status."""
    if patient.status not in allowed:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot {action} token #{patient.token_number}: "
                f"its status is '{patient.status}'. Allowed: {', '.join(allowed)}."
            ),
        )


def save(db: Session, patient: Patient) -> Patient:
    db.commit()
    db.refresh(patient)
    return patient


# --------------------------------------------------
# OTP VERIFICATION
# --------------------------------------------------

OTP_TTL_MINUTES = 5
OTP_RESEND_SECONDS = 30
OTP_MAX_ATTEMPTS = 5

# The prototype has no SMS provider wired up, so the generated code is also
# returned to the caller. Set OTP_DEBUG=false once a real SMS gateway exists.
OTP_DEBUG = os.getenv("OTP_DEBUG", "true").strip().lower() not in {"false", "0", "no"}


class OtpStore:
    """In-memory one-time-password store with expiry, resend and attempt limits."""

    def __init__(self) -> None:
        self._entries: dict[str, dict] = {}
        self._lock = Lock()

    def issue(self, phone: str) -> tuple[str | None, int]:
        """Return (code, retry_after_seconds). Code is None while rate limited."""
        now = datetime.now(timezone.utc)
        with self._lock:
            entry = self._entries.get(phone)
            if entry and (now - entry["issued_at"]).total_seconds() < OTP_RESEND_SECONDS:
                retry_after = OTP_RESEND_SECONDS - int((now - entry["issued_at"]).total_seconds())
                return None, max(retry_after, 1)

            code = f"{secrets.randbelow(900000) + 100000}"
            self._entries[phone] = {
                "code": code,
                "issued_at": now,
                "expires_at": now + timedelta(minutes=OTP_TTL_MINUTES),
                "attempts": 0,
            }
            return code, 0

    def verify(self, phone: str, code: str) -> None:
        """Raise HTTPException unless the code matches and is still valid."""
        now = datetime.now(timezone.utc)
        with self._lock:
            entry = self._entries.get(phone)
            if not entry:
                raise HTTPException(status_code=400, detail="Request an OTP before verifying.")
            if now > entry["expires_at"]:
                self._entries.pop(phone, None)
                raise HTTPException(status_code=400, detail="This OTP has expired. Request a new one.")
            if entry["attempts"] >= OTP_MAX_ATTEMPTS:
                self._entries.pop(phone, None)
                raise HTTPException(
                    status_code=429,
                    detail="Too many incorrect attempts. Request a new OTP.",
                )
            if entry["code"] != code:
                entry["attempts"] += 1
                remaining = OTP_MAX_ATTEMPTS - entry["attempts"]
                raise HTTPException(
                    status_code=400,
                    detail=f"Incorrect OTP. {remaining} attempt(s) remaining.",
                )
            self._entries.pop(phone, None)


OTP_STORE = OtpStore()


class OtpRequest(BaseModel):
    phone: str = Field(..., pattern=r"^[0-9]{10}$")


class OtpVerify(BaseModel):
    phone: str = Field(..., pattern=r"^[0-9]{10}$")
    code: str = Field(..., pattern=r"^[0-9]{6}$")



# --------------------------------------------------
# HOME
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "message": "QueueLess API is running",
        "status": "success"
    }


@app.get("/health")
def health(db: Session = Depends(get_db)):
    """Readiness probe: verifies the API and its database connection."""
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "reachable"}


# --------------------------------------------------
# MOBILE OTP VERIFICATION
# --------------------------------------------------

@app.post("/auth/request-otp")
def request_otp(payload: OtpRequest):
    code, retry_after = OTP_STORE.issue(payload.phone)

    if code is None:
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {retry_after}s before requesting another OTP.",
            headers={"Retry-After": str(retry_after)},
        )

    return {
        "message": "OTP sent successfully.",
        "expires_in_seconds": OTP_TTL_MINUTES * 60,
        "dev_code": code if OTP_DEBUG else None,
    }


@app.post("/auth/verify-otp")
def verify_otp(payload: OtpVerify):
    OTP_STORE.verify(payload.phone, payload.code)
    # This token is the patient's session: it unlocks registration, queue
    # lookups, and self-service cancellation for this mobile number only.
    patient_token = create_token(
        kind="patient", subject=payload.phone, phone=payload.phone
    )
    return {
        "verified": True,
        "phone": payload.phone,
        "patient_token": patient_token,
    }


class StaffLoginRequest(BaseModel):
    employee_code: str = Field(..., min_length=4, max_length=40)
    pin: str = Field(..., pattern=r"^[0-9]{4,8}$")


@app.post("/auth/staff-login")
def staff_login(payload: StaffLoginRequest, db: Session = Depends(get_db)):
    """Employee-code + PIN login for the admin, hospital and staff portals."""
    code = payload.employee_code.strip().upper()
    check_login_rate_limit(code)

    user = (
        db.query(User)
        .filter(User.employee_code == code, User.is_active == True)
        .first()
    )

    if not user or not verify_pin(payload.pin, user.pin_hash):
        record_login_failure(code)
        raise HTTPException(status_code=401, detail="Invalid employee code or PIN.")

    reset_login_attempts(code)
    token = create_token(
        kind="staff", subject=str(user.id), role=user.role, name=user.name
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user.role,
        "name": user.name,
        "employee_code": user.employee_code,
    }


# --------------------------------------------------
# DEPARTMENTS & DOCTORS
# --------------------------------------------------

@app.get("/departments", response_model=list[DepartmentOut])
def get_departments(db: Session = Depends(get_db)):
    return db.query(Department).filter(Department.is_active == True).all()


@app.get("/doctors")
def get_doctors(db: Session = Depends(get_db)):
    doctors = db.query(Doctor).all()
    result = []
    for doc in doctors:
        dept = db.query(Department).filter(Department.id == doc.department_id).first()
        result.append({
            "id": doc.id,
            "name": doc.name,
            "specialization": doc.specialization,
            "room_number": doc.room_number,
            "is_available": doc.is_available,
            "department_id": doc.department_id,
            "department_name": dept.name if dept else None,
            "department_code": dept.code if dept else None
        })
    return result


@app.put("/doctors/{doctor_id}/toggle-availability", dependencies=[Depends(require_role("staff", "hospital", "admin"))])
def toggle_doctor_availability(doctor_id: int, db: Session = Depends(get_db)):
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    doctor.is_available = not doctor.is_available
    db.commit()
    db.refresh(doctor)
    return doctor


# --------------------------------------------------
# CREATE PATIENT
# --------------------------------------------------

@app.post("/patients", status_code=201)
def create_patient(
    patient: PatientCreate,
    claims: dict = Depends(require_patient_token),
    db: Session = Depends(get_db)
):
    if claims.get("phone") != patient.phone:
        raise HTTPException(
            status_code=403,
            detail="This OTP session belongs to a different mobile number.",
        )
    dept_code = patient.department.value.lower() if hasattr(patient.department, "value") else str(patient.department).lower()

    department = (
        db.query(Department)
        .filter(Department.code == dept_code, Department.is_active == True)
        .first()
    )
    if department is None:
        raise HTTPException(
            status_code=422,
            detail=f"Department '{dept_code}' is not available for registration.",
        )

    name = patient.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Patient name cannot be empty.")
    if not 1 <= patient.age <= 120:
        raise HTTPException(status_code=422, detail="Age must be between 1 and 120.")

    # A patient may only hold one live token at a time. Visits from previous
    # hospital days are historical — they must never block today's registration.
    active_visit = (
        db.query(Patient)
        .filter(
            Patient.phone == patient.phone,
            Patient.status.in_(ACTIVE_STATUSES),
            Patient.created_at >= today_start_utc(),
        )
        .order_by(Patient.id.desc())
        .first()
    )

    if active_visit:
        raise HTTPException(
            status_code=409,
            detail={
                "message": (
                    f"You already have token #{active_visit.token_number} for "
                    f"{active_visit.department} ({active_visit.status})."
                ),
                "patient_id": active_visit.id,
            },
        )

    # Tokens restart at #1 every hospital day, per department.
    last_patient = (
        db.query(Patient)
        .filter(
            Patient.department == dept_code,
            Patient.created_at >= today_start_utc()
        )
        .order_by(Patient.token_number.desc())
        .first()
    )

    next_token = last_patient.token_number + 1 if last_patient else 1

    new_patient = Patient(
        name=name,
        age=patient.age,
        phone=patient.phone,
        department=dept_code,
        token_number=next_token,
        status="waiting",
        symptoms=(patient.symptoms or "").strip() or None,
        priority=(patient.priority.value if hasattr(patient.priority, "value") else patient.priority) or "regular",
        created_at=datetime.now(timezone.utc).replace(tzinfo=None)
    )

    db.add(new_patient)
    db.commit()
    db.refresh(new_patient)

    return new_patient


# --------------------------------------------------
# PUBLIC OPD STATUS (FROM DATABASE)
# --------------------------------------------------

@app.get("/opds")
def get_opd_status(db: Session = Depends(get_db)):
    """Public OPD snapshot.

    Every patient client polls this endpoint, so it issues a fixed handful of
    aggregate queries instead of four queries per department.
    """
    active_departments = (
        db.query(Department)
        .filter(Department.is_active == True)
        .order_by(Department.id.asc())
        .all()
    )

    if not active_departments:
        return []

    dept_codes = [dept.code.lower() for dept in active_departments]
    dept_ids = [dept.id for dept in active_departments]
    start_of_day = today_start_utc()

    waiting_by_dept = dict(
        db.query(Patient.department, func.count(Patient.id))
        .filter(
            Patient.department.in_(dept_codes),
            Patient.status == "waiting",
            Patient.created_at >= start_of_day
        )
        .group_by(Patient.department)
        .all()
    )

    # "consulting" sorts after "called", so desc() surfaces the patient in the
    # room ahead of one who has only been announced.
    active_by_dept: dict[str, int] = {}
    for dept_code, token_number in (
        db.query(Patient.department, Patient.token_number)
        .filter(
            Patient.department.in_(dept_codes),
            Patient.status.in_(["called", "consulting"]),
            Patient.created_at >= start_of_day
        )
        .order_by(Patient.status.desc(), Patient.token_number.desc())
        .all()
    ):
        active_by_dept.setdefault(dept_code, token_number)

    doctors_by_id = {
        doctor.id: doctor
        for doctor in db.query(Doctor)
        .filter(Doctor.department_id.in_(dept_ids))
        .all()
    }

    schedules_by_dept = {
        schedule.department_id: schedule
        for schedule in db.query(OPDSchedule)
        .filter(
            OPDSchedule.department_id.in_(dept_ids),
            OPDSchedule.is_active == True
        )
        .all()
    }

    status_labels = {
        "break": "Doctor on Break",
        "busy": "Busy",
        "available": "Available"
    }

    result = []

    for dept in active_departments:
        dept_code = dept.code.lower()

        schedule = schedules_by_dept.get(dept.id)
        doctor = doctors_by_id.get(schedule.doctor_id) if schedule else None
        if doctor is None:
            doctor = next(
                (doc for doc in doctors_by_id.values() if doc.department_id == dept.id),
                None
            )

        waiting_count = waiting_by_dept.get(dept_code, 0)
        current_token = active_by_dept.get(dept_code)
        estimated_wait = waiting_count * AVERAGE_CONSULTATION_TIME

        if doctor and not doctor.is_available:
            status_code = "break"
        elif waiting_count >= 15:
            status_code = "busy"
        else:
            status_code = "available"

        result.append({
            "department": dept.name,
            "code": dept.code,
            "doctor": doctor.name if doctor else "Attending Specialist",
            "room": doctor.room_number if doctor else "OPD",
            "timing": schedule.timing if schedule else "9 AM - 5 PM",
            "status": status_labels[status_code],
            "status_code": status_code,
            "waiting": waiting_count,
            "wait_time": "No wait" if estimated_wait == 0 else f"{estimated_wait} min",
            "wait_minutes": estimated_wait,
            "current_token": current_token
        })

    return result


# --------------------------------------------------
# GET ALL PATIENTS
# --------------------------------------------------

@app.get("/patients", dependencies=[Depends(require_role("staff", "admin"))])
def get_patients(
    department: str | None = None,
    status: str | None = None,
    today: bool = False,
    db: Session = Depends(get_db)
):

    query = db.query(Patient)

    if today:
        query = query.filter(Patient.created_at >= today_start_utc())

    if department:
        query = query.filter(
            Patient.department == department.lower()
        )

    if status:
        query = query.filter(
            Patient.status == status
        )

    patients = query.all()

    # If filtering for waiting patients, sort priority-aware
    if status == "waiting":
        patients.sort(
            key=lambda p: (
                PRIORITY_ORDER.get(p.priority, 4),
                p.token_number
            )
        )
    else:
        patients.sort(key=lambda p: p.token_number)

    return patients


# --------------------------------------------------
# FIND PATIENT BY PHONE
# --------------------------------------------------

@app.get("/patients/by-phone/{phone}")
def get_patient_by_phone(
    phone: str,
    claims: dict | None = Depends(optional_access_token),
    db: Session = Depends(get_db)
):

    # Prefer a visit that is still live over historical records. "Live" means
    # today's hospital day — a stuck waiting/called row from a previous day
    # must not hijack the patient's session or block a new registration.
    patient = (
        db.query(Patient)
        .filter(
            Patient.phone == phone,
            Patient.status.in_(ACTIVE_STATUSES),
            Patient.created_at >= today_start_utc(),
        )
        .order_by(Patient.id.desc())
        .first()
    )

    if not patient:
        patient = (
            db.query(Patient)
            .filter(Patient.phone == phone)
            .order_by(Patient.id.desc())
            .first()
        )

    if not patient:
        raise HTTPException(
            status_code=404,
            detail="No patient found with this mobile number"
        )

    # Full records require an OTP-verified session for this number (or staff
    # credentials); anonymous callers only learn that a record exists.
    if claims_may_access(claims, patient):
        return patient

    return {"id": patient.id, "requires_verification": True, "phone": phone}


# --------------------------------------------------
# GET SINGLE PATIENT
# --------------------------------------------------

@app.get("/patients/{patient_id}")
def get_patient(
    patient_id: int,
    claims: dict = Depends(require_patient_or_role("staff", "admin")),
    db: Session = Depends(get_db)
):

    patient = (
        db.query(Patient)
        .filter(Patient.id == patient_id)
        .first()
    )

    if not patient:
        raise HTTPException(
            status_code=404,
            detail="Patient not found"
        )

    if not claims_may_access(claims, patient):
        raise HTTPException(status_code=403, detail="This record belongs to a different patient.")

    return patient


# --------------------------------------------------
# CALL SPECIFIC PATIENT
# --------------------------------------------------

@app.put("/patients/{patient_id}/call", dependencies=[Depends(require_role("staff", "admin"))])
def call_patient(
    patient_id: int,
    db: Session = Depends(get_db)
):

    patient = get_patient_or_404(db, patient_id)
    require_status(patient, ("waiting", "called"), "call")

    # Only one patient may occupy the consultation room at a time. Room state
    # is day-scoped: a stuck called/consulting row from a previous hospital
    # day is historical and must not block today's queue.
    room_owner = (
        db.query(Patient)
        .filter(
            Patient.department == patient.department,
            Patient.status.in_(("called", "consulting")),
            Patient.created_at >= today_start_utc(),
            Patient.id != patient.id
        )
        .first()
    )

    if room_owner:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Token #{room_owner.token_number} is still in the room. "
                "Complete or skip that visit first."
            )
        )

    patient.status = "called"

    return save(db, patient)


# --------------------------------------------------
# START CONSULTATION
# --------------------------------------------------

@app.put("/patients/{patient_id}/consult", dependencies=[Depends(require_role("staff", "admin"))])
def consult_patient(
    patient_id: int,
    db: Session = Depends(get_db)
):

    patient = get_patient_or_404(db, patient_id)
    require_status(patient, ("called", "consulting"), "start a consultation for")

    patient.status = "consulting"

    return save(db, patient)


# --------------------------------------------------
# COMPLETE CONSULTATION
# --------------------------------------------------

@app.put("/patients/{patient_id}/complete", dependencies=[Depends(require_role("staff", "admin"))])
def complete_patient(
    patient_id: int,
    db: Session = Depends(get_db)
):

    patient = get_patient_or_404(db, patient_id)
    require_status(patient, ("called", "consulting"), "complete")

    patient.status = "completed"

    return save(db, patient)


# --------------------------------------------------
# SKIP PATIENT
# --------------------------------------------------

@app.put("/patients/{patient_id}/skip", dependencies=[Depends(require_role("staff", "admin"))])
def skip_patient(
    patient_id: int,
    db: Session = Depends(get_db)
):

    patient = get_patient_or_404(db, patient_id)
    require_status(patient, ("waiting", "called", "consulting"), "skip")

    patient.status = "skipped"

    return save(db, patient)


# --------------------------------------------------
# CANCEL PATIENT VISIT
# --------------------------------------------------

@app.put("/patients/{patient_id}/cancel")
def cancel_patient(
    patient_id: int,
    claims: dict = Depends(require_patient_or_role("staff", "admin")),
    db: Session = Depends(get_db)
):

    patient = get_patient_or_404(db, patient_id)
    if not claims_may_access(claims, patient):
        raise HTTPException(status_code=403, detail="This record belongs to a different patient.")
    require_status(patient, ("waiting", "called"), "cancel")

    patient.status = "cancelled"

    return save(db, patient)


# --------------------------------------------------
# REQUEUE A SKIPPED / CANCELLED VISIT
# --------------------------------------------------

@app.put("/patients/{patient_id}/requeue", dependencies=[Depends(require_role("staff", "admin"))])
def requeue_patient(
    patient_id: int,
    db: Session = Depends(get_db)
):

    patient = get_patient_or_404(db, patient_id)
    require_status(patient, ("skipped", "cancelled"), "requeue")

    room_owner = (
        db.query(Patient)
        .filter(
            Patient.department == patient.department,
            Patient.status.in_(("called", "consulting")),
            Patient.id != patient.id
        )
        .first()
    )

    if room_owner:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Token #{room_owner.token_number} is still in the room. "
                "Complete or skip that visit first."
            )
        )

    patient.status = "waiting"

    return save(db, patient)


# --------------------------------------------------
# CALL NEXT PATIENT (PRIORITY-AWARE)
# --------------------------------------------------

@app.put("/patients/call-next", dependencies=[Depends(require_role("staff", "admin"))])
def call_next_patient(
    department: str,
    db: Session = Depends(get_db)
):
    dept = department.lower()
    today_start = today_start_utc()

    # Room occupancy is day-scoped: a called/consulting row left over from a
    # previous hospital day is historical and must not block today's queue
    # (it is also invisible in the today-scoped staff console, so a blocking
    # ghost could otherwise never be cleared).
    room_owner = (
        db.query(Patient)
        .filter(
            Patient.department == dept,
            Patient.status.in_(("called", "consulting")),
            Patient.created_at >= today_start,
        )
        .order_by(Patient.id.desc())
        .first()
    )

    if room_owner:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Token #{room_owner.token_number} ({room_owner.name}) is still in the room. "
                "Complete or skip that visit before calling the next patient."
            )
        )

    patients = (
        db.query(Patient)
        .filter(
            Patient.department == dept,
            Patient.status == "waiting",
            Patient.created_at >= today_start,
        )
        .all()
    )

    if not patients:
        return {
            "message": "No waiting patients"
        }

    patients.sort(
        key=lambda patient: (
            PRIORITY_ORDER.get(
                patient.priority,
                4
            ),
            patient.token_number
        )
    )

    patient = patients[0]

    patient.status = "called"

    db.commit()
    db.refresh(patient)

    return patient


# --------------------------------------------------
# QUEUE STATUS
# --------------------------------------------------

@app.get("/patients/{patient_id}/queue-status")
def get_queue_status(
    patient_id: int,
    claims: dict = Depends(require_patient_or_role("staff", "admin")),
    db: Session = Depends(get_db)
):

    patient = (
        db.query(Patient)
        .filter(Patient.id == patient_id)
        .first()
    )

    if not patient:
        raise HTTPException(
            status_code=404,
            detail="Patient not found"
        )

    if not claims_may_access(claims, patient):
        raise HTTPException(status_code=403, detail="This record belongs to a different patient.")

    # Find patient currently being served. Day-scoped so stale called/
    # consulting rows from previous hospital days don't bleed into today's
    # wait estimates.
    current_patient = (
        db.query(Patient)
        .filter(
            Patient.department == patient.department,
            Patient.status.in_(["consulting", "called"]),
            Patient.created_at >= today_start_utc(),
        )
        .order_by(
            Patient.status.desc(),
            Patient.token_number.desc()
        )
        .first()
    )

    current_token = (
        current_patient.token_number
        if current_patient
        else None
    )

    # Handle already called or consulting
    if patient.status in ["called", "consulting"]:
        return {
            "patient_id": patient.id,
            "your_token": patient.token_number,
            "department": patient.department,
            "status": patient.status,
            "priority": patient.priority,
            "queue_position": 1,
            "patients_ahead": 0,
            "current_token": current_token,
            "estimated_wait_minutes": 0,
            "message": "It's your turn! Please proceed to the consultation room."
        }

    # Handle inactive states
    if patient.status in ["completed", "cancelled", "skipped"]:
        return {
            "patient_id": patient.id,
            "your_token": patient.token_number,
            "department": patient.department,
            "status": patient.status,
            "priority": patient.priority,
            "queue_position": None,
            "patients_ahead": 0,
            "current_token": current_token,
            "estimated_wait_minutes": 0,
            "message": f"Your visit is currently {patient.status}."
        }

    # If waiting, calculate position. Day-scoped: only today's waiting visits
    # participate in today's queue ordering.
    waiting_patients = (
        db.query(Patient)
        .filter(
            Patient.department == patient.department,
            Patient.status == "waiting",
            Patient.created_at >= today_start_utc(),
        )
        .all()
    )

    waiting_patients.sort(
        key=lambda p: (
            PRIORITY_ORDER.get(
                p.priority,
                4
            ),
            p.token_number
        )
    )

    position = None

    for index, p in enumerate(waiting_patients):
        if p.id == patient.id:
            position = index + 1
            break

    if position is not None:
        patients_ahead = position - 1
    else:
        patients_ahead = 0

    estimated_wait = (
        patients_ahead *
        AVERAGE_CONSULTATION_TIME
    )

    return {
        "patient_id": patient.id,
        "your_token": patient.token_number,
        "department": patient.department,
        "status": patient.status,
        "priority": patient.priority,
        "queue_position": position,
        "patients_ahead": patients_ahead,
        "current_token": current_token,
        "estimated_wait_minutes": estimated_wait,
        "message": f"You are #{position} in line for {patient.department}." if position else "Waiting in queue."
    }


# --------------------------------------------------
# HOSPITAL ADMIN & ANALYTICS
# --------------------------------------------------

@app.get("/admin/overview", dependencies=[Depends(require_role("admin"))])
def get_admin_overview(db: Session = Depends(get_db)):
    """Operational counters for the current hospital day."""
    start_of_day = today_start_utc()
    todays_filter = Patient.created_at >= start_of_day

    # Single grouped query instead of one count per status.
    status_counts = dict(
        db.query(Patient.status, func.count(Patient.id))
        .filter(todays_filter)
        .group_by(Patient.status)
        .all()
    )

    total_patients = sum(status_counts.values())
    waiting_patients = status_counts.get("waiting", 0)
    consulting_patients = status_counts.get("called", 0) + status_counts.get("consulting", 0)
    completed_patients = status_counts.get("completed", 0)
    skipped_patients = status_counts.get("skipped", 0)
    cancelled_patients = status_counts.get("cancelled", 0)
    emergency_cases = (
        db.query(func.count(Patient.id))
        .filter(
            todays_filter,
            Patient.priority.in_(["emergency", "elderly", "pregnant"])
        )
        .scalar()
        or 0
    )

    total_doctors = db.query(func.count(Doctor.id)).scalar() or 0
    active_doctors = (
        db.query(func.count(Doctor.id)).filter(Doctor.is_available == True).scalar() or 0
    )
    open_opds = (
        db.query(func.count(Department.id))
        .filter(Department.is_active == True)
        .scalar()
        or 0
    )

    avg_wait = (
        round((waiting_patients * AVERAGE_CONSULTATION_TIME) / (open_opds or 1))
        if waiting_patients > 0
        else 0
    )

    return {
        "total_patients": total_patients,
        "waiting_patients": waiting_patients,
        "consulting_patients": consulting_patients,
        "completed_patients": completed_patients,
        "skipped_patients": skipped_patients,
        "cancelled_patients": cancelled_patients,
        "emergency_cases": emergency_cases,
        "total_doctors": total_doctors,
        "active_doctors": active_doctors,
        "open_opds": open_opds,
        "avg_wait_minutes": avg_wait,
        "avg_consultation_time": AVERAGE_CONSULTATION_TIME,
        "day_start_utc": start_of_day.isoformat()
    }


@app.get("/admin/department-load", dependencies=[Depends(require_role("admin"))])
def get_department_load(db: Session = Depends(get_db)):
    departments = db.query(Department).filter(Department.is_active == True).all()
    start_of_day = today_start_utc()

    if not departments:
        return []

    dept_ids = [dept.id for dept in departments]
    dept_codes = [dept.code.lower() for dept in departments]

    doctors_by_dept = {
        doctor.department_id: doctor
        for doctor in db.query(Doctor)
        .filter(Doctor.department_id.in_(dept_ids))
        .all()
    }

    schedules_by_dept = {
        schedule.department_id: schedule
        for schedule in db.query(OPDSchedule)
        .filter(OPDSchedule.department_id.in_(dept_ids))
        .all()
    }

    # One grouped query replaces four count queries per department.
    counts: dict[str, dict[str, int]] = {}
    for dept_code, status, visit_count in (
        db.query(Patient.department, Patient.status, func.count(Patient.id))
        .filter(
            Patient.department.in_(dept_codes),
            Patient.created_at >= start_of_day
        )
        .group_by(Patient.department, Patient.status)
        .all()
    ):
        counts.setdefault(dept_code, {})[status or "unknown"] = visit_count

    active_by_dept: dict[str, int] = {}
    for dept_code, token_number in (
        db.query(Patient.department, Patient.token_number)
        .filter(
            Patient.department.in_(dept_codes),
            Patient.status.in_(["called", "consulting"]),
            Patient.created_at >= start_of_day
        )
        .order_by(Patient.status.desc(), Patient.token_number.desc())
        .all()
    ):
        active_by_dept.setdefault(dept_code, token_number)

    results = []

    for dept in departments:
        dept_code = dept.code.lower()
        doctor = doctors_by_dept.get(dept.id)
        schedule = schedules_by_dept.get(dept.id)

        dept_counts = counts.get(dept_code, {})
        waiting = dept_counts.get("waiting", 0)
        consulting = dept_counts.get("called", 0) + dept_counts.get("consulting", 0)
        completed = dept_counts.get("completed", 0)
        total = sum(dept_counts.values())

        est_wait = waiting * AVERAGE_CONSULTATION_TIME

        # Bottleneck & Load Detection
        is_available = doctor.is_available if doctor else True
        if not is_available and waiting > 0:
            load_level = "Critical"
            bottleneck_alert = True
            suggestion = f"Doctor is on break while {waiting} patient(s) are queued. Reassign urgent cases or activate backup specialist."
        elif waiting >= 12:
            load_level = "Critical"
            bottleneck_alert = True
            suggestion = f"Severe queue congestion ({waiting} waiting, est {est_wait}m). Consider activating another doctor for {dept.name}."
        elif waiting >= 6:
            load_level = "Elevated"
            bottleneck_alert = True
            suggestion = f"Queue load elevated above average. Monitor intake velocity."
        else:
            load_level = "Normal"
            bottleneck_alert = False
            suggestion = "Operating within nominal queue capacity."

        results.append({
            "department_id": dept.id,
            "department_name": dept.name,
            "department_code": dept.code,
            "doctor_name": doctor.name if doctor else "Attending Doctor",
            "room_number": doctor.room_number if doctor else "OPD",
            "is_available": is_available,
            "timing": schedule.timing if schedule else "9 AM - 5 PM",
            "waiting": waiting,
            "consulting": consulting,
            "completed": completed,
            "total_registered": total,
            "avg_wait_minutes": est_wait,
            "current_token": active_by_dept.get(dept_code),
            "load_level": load_level,
            "bottleneck_alert": bottleneck_alert,
            "suggestion": suggestion
        })

    return results


@app.get("/admin/analytics", dependencies=[Depends(require_role("admin"))])
def get_admin_analytics(db: Session = Depends(get_db)):
    departments = db.query(Department).filter(Department.is_active == True).all()
    start_of_day = today_start_utc()

    dept_codes = [dept.code.lower() for dept in departments]

    # One grouped query feeds both the department breakdown and doctor utilization.
    counts: dict[str, dict[str, int]] = {}
    if dept_codes:
        for dept_code, status, visit_count in (
            db.query(Patient.department, Patient.status, func.count(Patient.id))
            .filter(
                Patient.department.in_(dept_codes),
                Patient.created_at >= start_of_day
            )
            .group_by(Patient.department, Patient.status)
            .all()
        ):
            counts.setdefault(dept_code, {})[status or "unknown"] = visit_count

    # Department breakdown
    dept_stats = []
    for dept in departments:
        dept_counts = counts.get(dept.code.lower(), {})
        dept_stats.append({
            "name": dept.name,
            "code": dept.code,
            "waiting": dept_counts.get("waiting", 0),
            "completed": dept_counts.get("completed", 0),
            "total": sum(dept_counts.values())
        })

    # Priority distribution for today (one grouped query instead of five)
    priorities = ["emergency", "elderly", "pregnant", "follow_up", "regular"]
    priority_totals = dict(
        db.query(Patient.priority, func.count(Patient.id))
        .filter(Patient.created_at >= start_of_day)
        .group_by(Patient.priority)
        .all()
    )
    priority_counts = [
        {
            "priority": prio.replace("_", " ").title(),
            "count": priority_totals.get(prio, 0)
        }
        for prio in priorities
    ]

    # Hourly volume distribution, bucketed from real registration timestamps
    hours = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"]
    buckets = {hour: 0 for hour in hours}
    registrations = (
        db.query(Patient.created_at)
        .filter(Patient.created_at >= start_of_day)
        .all()
    )
    for (created_at,) in registrations:
        if created_at is None:
            continue
        local_hour = created_at.replace(tzinfo=timezone.utc).astimezone(HOSPITAL_TIMEZONE).hour
        label = f"{local_hour:02d}:00"
        if label in buckets:
            buckets[label] += 1

    hourly_flow = [
        {"hour": hour, "patients": buckets[hour], "capacity": 15}
        for hour in hours
    ]

    # Doctor utilization, based on today's completions versus remaining queue
    doctors = db.query(Doctor).all()
    department_names = {dept.id: dept.name for dept in departments}
    department_codes = {dept.id: dept.code.lower() for dept in departments}
    doctor_utilization = []
    for doc in doctors:
        dept_counts = counts.get(department_codes.get(doc.department_id, ""), {})
        completed_by_dept = dept_counts.get("completed", 0)
        waiting_for_dept = dept_counts.get("waiting", 0)

        handled = completed_by_dept + waiting_for_dept
        util_rate = round(completed_by_dept / handled * 100) if handled else 0
        if not doc.is_available:
            util_rate = 0

        doctor_utilization.append({
            "id": doc.id,
            "doctor": doc.name,
            "department": department_names.get(doc.department_id, "General"),
            "room": doc.room_number,
            "is_available": doc.is_available,
            "patients_served": completed_by_dept,
            "pending_queue": waiting_for_dept,
            "utilization_pct": util_rate
        })

    return {
        "department_workload": dept_stats,
        "priority_distribution": priority_counts,
        "hourly_patient_flow": hourly_flow,
        "doctor_utilization": doctor_utilization
    }


# --------------------------------------------------
# HISTORICAL DEMO DATASET (admin analytics)
# --------------------------------------------------

@app.get("/demo/overview", dependencies=[Depends(require_role("admin"))])
def get_demo_overview(db: Session = Depends(get_db)):
    """Aggregated view of the imported historical hospital dataset."""
    visits = db.query(DemoVisit).all()
    weekly_rows = db.query(ServiceWeekly).order_by(ServiceWeekly.week.asc()).all()
    staff = db.query(StaffMember).all()
    shifts = db.query(StaffShift).all()

    meta = db.query(DemoImportMeta).filter(DemoImportMeta.key == "report").first()
    quality = None
    if meta is not None:
        try:
            quality = json.loads(meta.value)
        except (TypeError, ValueError):
            quality = None

    if not visits and not weekly_rows and not staff:
        return {
            "available": False,
            "dataset": None,
            "services": [],
            "weekly": [],
            "staff_attendance": [],
            "data_quality": quality,
        }

    # ---- per-service visit totals -------------------------------------
    service_stats: dict[str, dict] = defaultdict(
        lambda: {"visits": 0, "los_days": 0, "satisfaction_sum": 0, "satisfaction_count": 0}
    )
    for visit in visits:
        stats = service_stats[visit.service]
        stats["visits"] += 1
        stats["los_days"] += (visit.departure_date - visit.arrival_date).days
        if visit.satisfaction is not None:
            stats["satisfaction_sum"] += visit.satisfaction
            stats["satisfaction_count"] += 1

    # ---- attendance per staff member ---------------------------------
    attendance: dict[int, list[int]] = defaultdict(lambda: [0, 0])
    for shift in shifts:
        bucket = attendance[shift.staff_id]
        bucket[1] += 1
        if shift.present:
            bucket[0] += 1

    staff_by_service: dict[str, int] = defaultdict(int)
    attendance_by_service: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    staff_payload = []

    for member in staff:
        staff_by_service[member.service] += 1
        present, total = attendance.get(member.id, [0, 0])
        attendance_by_service[member.service][0] += present
        attendance_by_service[member.service][1] += total
        staff_payload.append(
            {
                "name": member.name,
                "role": member.role,
                "service": member.service,
                "present": present,
                "total": total,
                "attendance_pct": round(present * 100 / total, 1) if total else 0.0,
            }
        )

    staff_payload.sort(key=lambda row: (-row["attendance_pct"], row["name"]))

    # ---- weekly trend (summed over the four services) ------------------
    weekly_trend: dict[int, dict] = defaultdict(
        lambda: {"requested": 0, "admitted": 0, "refused": 0, "satisfaction_sum": 0, "morale_sum": 0, "rows": 0}
    )
    for row in weekly_rows:
        bucket = weekly_trend[row.week]
        bucket["requested"] += row.patients_request
        bucket["admitted"] += row.patients_admitted
        bucket["refused"] += row.patients_refused
        bucket["satisfaction_sum"] += row.patient_satisfaction or 0
        bucket["morale_sum"] += row.staff_morale or 0
        bucket["rows"] += 1

    weekly_payload = [
        {
            "week": week,
            "requested": bucket["requested"],
            "admitted": bucket["admitted"],
            "refused": bucket["refused"],
            "satisfaction": round(bucket["satisfaction_sum"] / bucket["rows"], 1)
            if bucket["rows"]
            else 0,
            "morale": round(bucket["morale_sum"] / bucket["rows"], 1)
            if bucket["rows"]
            else 0,
        }
        for week, bucket in sorted(weekly_trend.items())
    ]

    # ---- service payload ----------------------------------------------
    services_payload = []
    for code, stats in sorted(service_stats.items()):
        present, total = attendance_by_service.get(code, [0, 0])
        services_payload.append(
            {
                "service": code,
                "visits": stats["visits"],
                "avg_length_of_stay": round(stats["los_days"] / stats["visits"], 1)
                if stats["visits"]
                else 0,
                "avg_satisfaction": round(
                    stats["satisfaction_sum"] / stats["satisfaction_count"], 1
                )
                if stats["satisfaction_count"]
                else 0,
                "staff": staff_by_service.get(code, 0),
                "attendance_pct": round(present * 100 / total, 1) if total else 0.0,
            }
        )

    total_satisfaction = sum((v.satisfaction or 0) for v in visits if v.satisfaction is not None)
    satisfaction_count = sum(1 for v in visits if v.satisfaction is not None)
    total_los = sum((v.departure_date - v.arrival_date).days for v in visits)

    return {
        "available": True,
        "dataset": {
            "visits": len(visits),
            "staff": len(staff),
            "weeks": len(weekly_trend),
            "services": len(service_stats),
            "shifts": len(shifts),
            "avg_length_of_stay": round(total_los / len(visits), 1) if visits else 0,
            "avg_satisfaction": round(total_satisfaction / satisfaction_count, 1)
            if satisfaction_count
            else 0,
        },
        "services": services_payload,
        "weekly": weekly_payload,
        "staff_attendance": staff_payload,
        "data_quality": quality,
    }


# --------------------------------------------------
# HOSPITAL MANAGEMENT (hospital-manager portal)
# --------------------------------------------------

class DepartmentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class ScheduleUpdate(BaseModel):
    timing: str = Field(..., min_length=3, max_length=60)


class DoctorUpdate(BaseModel):
    name: str | None = None
    specialization: str | None = None
    room_number: str | None = None
    department_id: int | None = None
    is_available: bool | None = None


@app.get("/hospital/overview", dependencies=[Depends(require_role("hospital", "admin"))])
def get_hospital_overview(db: Session = Depends(get_db)):
    """Everything the hospital manager edits: departments, hours, doctors."""
    departments = db.query(Department).order_by(Department.id.asc()).all()

    timing_by_dept: dict[int, str] = {}
    for schedule in (
        db.query(OPDSchedule).filter(OPDSchedule.is_active == True).all()
    ):
        timing_by_dept.setdefault(schedule.department_id, schedule.timing)

    doctors_by_dept: dict[int, list] = {}
    for doc in db.query(Doctor).order_by(Doctor.id.asc()).all():
        doctors_by_dept.setdefault(doc.department_id, []).append(
            {
                "id": doc.id,
                "name": doc.name,
                "specialization": doc.specialization,
                "room_number": doc.room_number,
                "is_available": doc.is_available,
            }
        )

    return [
        {
            "id": dept.id,
            "code": dept.code,
            "name": dept.name,
            "description": dept.description,
            "is_active": dept.is_active,
            "timing": timing_by_dept.get(dept.id),
            "doctors": doctors_by_dept.get(dept.id, []),
        }
        for dept in departments
    ]


@app.post(
    "/hospital/departments",
    status_code=201,
    dependencies=[Depends(require_role("hospital", "admin"))],
)
def create_hospital_department(payload: DepartmentCreate, db: Session = Depends(get_db)):
    code = payload.code.strip().lower()
    if db.query(Department).filter(Department.code == code).first():
        raise HTTPException(status_code=409, detail=f"Department code '{code}' already exists.")

    dept = Department(
        code=code,
        name=payload.name.strip(),
        description=payload.description,
        is_active=True,
    )
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


@app.put(
    "/hospital/departments/{department_id}",
    dependencies=[Depends(require_role("hospital", "admin"))],
)
def update_hospital_department(
    department_id: int,
    payload: DepartmentUpdate,
    db: Session = Depends(get_db),
):
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    if payload.name is not None:
        dept.name = payload.name.strip()
    if payload.description is not None:
        dept.description = payload.description.strip() or None
    if payload.is_active is not None:
        dept.is_active = payload.is_active

    db.commit()
    db.refresh(dept)
    return dept


@app.put(
    "/hospital/departments/{department_id}/schedule",
    dependencies=[Depends(require_role("hospital", "admin"))],
)
def update_hospital_schedule(
    department_id: int,
    payload: ScheduleUpdate,
    db: Session = Depends(get_db),
):
    dept = db.query(Department).filter(Department.id == department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    schedule = (
        db.query(OPDSchedule)
        .filter(OPDSchedule.department_id == department_id, OPDSchedule.is_active == True)
        .first()
    )

    if schedule:
        schedule.timing = payload.timing.strip()
    else:
        doctor = (
            db.query(Doctor)
            .filter(Doctor.department_id == department_id)
            .order_by(Doctor.id.asc())
            .first()
        )
        if not doctor:
            raise HTTPException(
                status_code=409,
                detail="Add a doctor to this department before setting OPD hours.",
            )
        schedule = OPDSchedule(
            department_id=department_id,
            doctor_id=doctor.id,
            timing=payload.timing.strip(),
            is_active=True,
        )
        db.add(schedule)

    db.commit()
    return {"department_id": department_id, "timing": schedule.timing}


@app.post(
    "/hospital/doctors",
    status_code=201,
    dependencies=[Depends(require_role("hospital", "admin"))],
)
def create_hospital_doctor(payload: DoctorCreate, db: Session = Depends(get_db)):
    dept = db.query(Department).filter(Department.id == payload.department_id).first()
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    doctor = Doctor(
        name=payload.name.strip(),
        specialization=(payload.specialization or "").strip() or None,
        room_number=payload.room_number.strip(),
        is_available=True,
        department_id=dept.id,
    )
    db.add(doctor)
    db.commit()
    db.refresh(doctor)
    return doctor


@app.put(
    "/hospital/doctors/{doctor_id}",
    dependencies=[Depends(require_role("hospital", "admin"))],
)
def update_hospital_doctor(
    doctor_id: int,
    payload: DoctorUpdate,
    db: Session = Depends(get_db),
):
    doctor = db.query(Doctor).filter(Doctor.id == doctor_id).first()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    if payload.department_id is not None:
        dept = db.query(Department).filter(Department.id == payload.department_id).first()
        if not dept:
            raise HTTPException(status_code=404, detail="Department not found")
        doctor.department_id = dept.id
    if payload.name is not None:
        doctor.name = payload.name.strip()
    if payload.specialization is not None:
        doctor.specialization = payload.specialization.strip() or None
    if payload.room_number is not None:
        doctor.room_number = payload.room_number.strip()
    if payload.is_available is not None:
        doctor.is_available = payload.is_available

    db.commit()
    db.refresh(doctor)
    return doctor