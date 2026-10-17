import os

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import engine, Base, get_db, SessionLocal
from models import Patient, Department, Doctor, OPDSchedule
from schemas.patient import PatientCreate
from schemas.department import DepartmentCreate, DepartmentOut
from schemas.doctor import DoctorCreate, DoctorOut


# --------------------------------------------------
# DATABASE SETUP & SEEDING
# --------------------------------------------------

Base.metadata.create_all(bind=engine)


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
})

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(frontend_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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


# --------------------------------------------------
# HOME
# --------------------------------------------------

@app.get("/")
def home():
    return {
        "message": "QueueLess API is running",
        "status": "success"
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


@app.put("/doctors/{doctor_id}/toggle-availability")
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

@app.post("/patients")
def create_patient(
    patient: PatientCreate,
    db: Session = Depends(get_db)
):
    dept_code = patient.department.value.lower() if hasattr(patient.department, "value") else str(patient.department).lower()

    last_patient = (
        db.query(Patient)
        .filter(Patient.department == dept_code)
        .order_by(Patient.token_number.desc())
        .first()
    )

    if last_patient:
        next_token = last_patient.token_number + 1
    else:
        next_token = 1

    new_patient = Patient(
        name=patient.name,
        age=patient.age,
        phone=patient.phone,
        department=dept_code,
        token_number=next_token,
        status="waiting",
        symptoms=patient.symptoms,
        priority=patient.priority
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
    # Source of truth: PostgreSQL Department & Doctor tables
    active_departments = (
        db.query(Department)
        .filter(Department.is_active == True)
        .order_by(Department.id.asc())
        .all()
    )

    result = []

    for dept in active_departments:
        dept_code = dept.code.lower()

        # Find assigned doctor and schedule
        schedule = (
            db.query(OPDSchedule)
            .filter(
                OPDSchedule.department_id == dept.id,
                OPDSchedule.is_active == True
            )
            .first()
        )

        doctor = (
            db.query(Doctor)
            .filter(Doctor.id == schedule.doctor_id)
            .first()
            if schedule
            else (
                db.query(Doctor)
                .filter(Doctor.department_id == dept.id)
                .first()
            )
        )

        # Find waiting patients
        waiting_patients = (
            db.query(Patient)
            .filter(
                Patient.department == dept_code,
                Patient.status == "waiting"
            )
            .all()
        )
        waiting_count = len(waiting_patients)

        # Find active serving patient
        current_patient = (
            db.query(Patient)
            .filter(
                Patient.department == dept_code,
                Patient.status.in_(["consulting", "called"])
            )
            .order_by(
                Patient.status.desc(),
                Patient.token_number.desc()
            )
            .first()
        )

        current_token = current_patient.token_number if current_patient else None

        # Estimated wait time
        estimated_wait = waiting_count * AVERAGE_CONSULTATION_TIME
        wait_time = "No wait" if estimated_wait == 0 else f"{estimated_wait} min"

        # Determine OPD status dynamically
        if doctor and not doctor.is_available:
            status = "Doctor on Break"
        elif waiting_count >= 15:
            status = "Busy"
        else:
            status = "Available"

        result.append({
            "department": dept.name,
            "code": dept.code,
            "doctor": doctor.name if doctor else "Attending Specialist",
            "room": doctor.room_number if doctor else "OPD",
            "timing": schedule.timing if schedule else "9 AM - 5 PM",
            "status": status,
            "waiting": waiting_count,
            "wait_time": wait_time,
            "current_token": current_token
        })

    return result


# --------------------------------------------------
# GET ALL PATIENTS
# --------------------------------------------------

@app.get("/patients")
def get_patients(
    department: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db)
):

    query = db.query(Patient)

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
    db: Session = Depends(get_db)
):

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

    return patient


# --------------------------------------------------
# GET SINGLE PATIENT
# --------------------------------------------------

@app.get("/patients/{patient_id}")
def get_patient(
    patient_id: int,
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

    return patient


# --------------------------------------------------
# CALL SPECIFIC PATIENT
# --------------------------------------------------

@app.put("/patients/{patient_id}/call")
def call_patient(
    patient_id: int,
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

    patient.status = "called"

    db.commit()
    db.refresh(patient)

    return patient


# --------------------------------------------------
# START CONSULTATION
# --------------------------------------------------

@app.put("/patients/{patient_id}/consult")
def consult_patient(
    patient_id: int,
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

    patient.status = "consulting"

    db.commit()
    db.refresh(patient)

    return patient


# --------------------------------------------------
# COMPLETE CONSULTATION
# --------------------------------------------------

@app.put("/patients/{patient_id}/complete")
def complete_patient(
    patient_id: int,
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

    patient.status = "completed"

    db.commit()
    db.refresh(patient)

    return patient


# --------------------------------------------------
# SKIP PATIENT
# --------------------------------------------------

@app.put("/patients/{patient_id}/skip")
def skip_patient(
    patient_id: int,
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

    patient.status = "skipped"

    db.commit()
    db.refresh(patient)

    return patient


# --------------------------------------------------
# CANCEL PATIENT VISIT
# --------------------------------------------------

@app.put("/patients/{patient_id}/cancel")
def cancel_patient(
    patient_id: int,
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

    patient.status = "cancelled"

    db.commit()
    db.refresh(patient)

    return patient


# --------------------------------------------------
# CALL NEXT PATIENT (PRIORITY-AWARE)
# --------------------------------------------------

@app.put("/patients/call-next")
def call_next_patient(
    department: str,
    db: Session = Depends(get_db)
):
    dept = department.lower()

    patients = (
        db.query(Patient)
        .filter(
            Patient.department == dept,
            Patient.status == "waiting"
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

    # Find patient currently being served
    current_patient = (
        db.query(Patient)
        .filter(
            Patient.department == patient.department,
            Patient.status.in_(["consulting", "called"])
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

    # If waiting, calculate position
    waiting_patients = (
        db.query(Patient)
        .filter(
            Patient.department == patient.department,
            Patient.status == "waiting"
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

@app.get("/admin/overview")
def get_admin_overview(db: Session = Depends(get_db)):
    total_patients = db.query(Patient).count()
    waiting_patients = db.query(Patient).filter(Patient.status == "waiting").count()
    consulting_patients = db.query(Patient).filter(Patient.status == "consulting").count()
    completed_patients = db.query(Patient).filter(Patient.status == "completed").count()
    skipped_patients = db.query(Patient).filter(Patient.status == "skipped").count()
    emergency_cases = db.query(Patient).filter(Patient.priority.in_(["emergency", "elderly", "pregnant"])).count()

    total_doctors = db.query(Doctor).count()
    active_doctors = db.query(Doctor).filter(Doctor.is_available == True).count()
    open_opds = db.query(Department).filter(Department.is_active == True).count()

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
        "emergency_cases": emergency_cases,
        "total_doctors": total_doctors,
        "active_doctors": active_doctors,
        "open_opds": open_opds,
        "avg_wait_minutes": avg_wait,
        "avg_consultation_time": AVERAGE_CONSULTATION_TIME
    }


@app.get("/admin/department-load")
def get_department_load(db: Session = Depends(get_db)):
    departments = db.query(Department).filter(Department.is_active == True).all()
    results = []

    for dept in departments:
        dept_code = dept.code.lower()
        doctor = db.query(Doctor).filter(Doctor.department_id == dept.id).first()
        schedule = db.query(OPDSchedule).filter(OPDSchedule.department_id == dept.id).first()

        waiting = db.query(Patient).filter(Patient.department == dept_code, Patient.status == "waiting").count()
        consulting = db.query(Patient).filter(Patient.department == dept_code, Patient.status.in_(["called", "consulting"])).count()
        completed = db.query(Patient).filter(Patient.department == dept_code, Patient.status == "completed").count()
        total = db.query(Patient).filter(Patient.department == dept_code).count()

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

        # Active serving token
        active_patient = (
            db.query(Patient)
            .filter(Patient.department == dept_code, Patient.status.in_(["consulting", "called"]))
            .order_by(Patient.status.desc(), Patient.token_number.desc())
            .first()
        )

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
            "current_token": active_patient.token_number if active_patient else None,
            "load_level": load_level,
            "bottleneck_alert": bottleneck_alert,
            "suggestion": suggestion
        })

    return results


@app.get("/admin/analytics")
def get_admin_analytics(db: Session = Depends(get_db)):
    departments = db.query(Department).filter(Department.is_active == True).all()

    # Department breakdown
    dept_stats = []
    for dept in departments:
        dept_code = dept.code.lower()
        w = db.query(Patient).filter(Patient.department == dept_code, Patient.status == "waiting").count()
        c = db.query(Patient).filter(Patient.department == dept_code, Patient.status == "completed").count()
        tot = db.query(Patient).filter(Patient.department == dept_code).count()
        dept_stats.append({
            "name": dept.name,
            "code": dept.code,
            "waiting": w,
            "completed": c,
            "total": tot
        })

    # Priority distribution
    priorities = ["emergency", "elderly", "pregnant", "follow_up", "regular"]
    priority_counts = []
    for prio in priorities:
        cnt = db.query(Patient).filter(Patient.priority == prio).count()
        priority_counts.append({
            "priority": prio.replace("_", " ").title(),
            "count": cnt
        })

    # Hourly volume distribution (simulated realistic operational curve based on actual total)
    total_patients = db.query(Patient).count()
    hours = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"]
    # Distribution curve weights peaking around 10am-12pm
    weights = [0.05, 0.12, 0.22, 0.20, 0.14, 0.08, 0.07, 0.06, 0.04, 0.02]
    hourly_flow = []
    for h, w in zip(hours, weights):
        volume = max(1, round(total_patients * w)) if total_patients > 0 else 0
        hourly_flow.append({
            "hour": h,
            "patients": volume,
            "capacity": 15
        })

    # Doctor utilization
    doctors = db.query(Doctor).all()
    doctor_utilization = []
    for doc in doctors:
        dept = db.query(Department).filter(Department.id == doc.department_id).first()
        dept_code = dept.code.lower() if dept else ""
        completed_by_dept = db.query(Patient).filter(Patient.department == dept_code, Patient.status == "completed").count()
        waiting_for_dept = db.query(Patient).filter(Patient.department == dept_code, Patient.status == "waiting").count()

        util_rate = min(100, max(20, (completed_by_dept + (1 if not doc.is_available else 0)) * 25)) if doc.is_available else 10

        doctor_utilization.append({
            "id": doc.id,
            "doctor": doc.name,
            "department": dept.name if dept else "General",
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