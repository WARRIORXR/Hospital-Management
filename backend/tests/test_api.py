"""End-to-end tests for the QueueLess API."""

import os
from datetime import datetime, timedelta

from fastapi.testclient import TestClient

import main
from conftest import patient_headers

_ROLE_TOKENS: dict[str, str] = {}


def _role_header(client, role: str) -> dict[str, str]:
    """Log in once per portal role and cache its Authorization header."""
    if role not in _ROLE_TOKENS:
        codes = {
            "admin": os.environ.get("ADMIN_CODE", "ADM-001"),
            "hospital": os.environ.get("HOSPITAL_CODE", "HOSP-001"),
            "staff": os.environ.get("STAFF_CODE", "DR-101"),
        }
        pins = {
            "admin": os.environ.get("ADMIN_PIN", "123456"),
            "hospital": os.environ.get("HOSPITAL_PIN", "123456"),
            "staff": os.environ.get("STAFF_PIN", "123456"),
        }
        response = client.post(
            "/auth/staff-login",
            json={"employee_code": codes[role], "pin": pins[role]},
        )
        assert response.status_code == 200, response.text
        _ROLE_TOKENS[role] = response.json()["access_token"]
    return {"Authorization": f"Bearer {_ROLE_TOKENS[role]}"}


def _register(client, phone="9000000001", department="general", priority="regular", **extra):
    payload = {
        "name": "Asha Verma",
        "age": 34,
        "phone": phone,
        "department": department,
        "priority": priority,
    }
    payload.update(extra)
    return client.post(
        "/patients",
        json=payload,
        headers=patient_headers(client, phone),
    )


def test_health_reports_database(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "reachable"}


def test_seeded_departments_are_exposed(client):
    response = client.get("/departments")
    assert response.status_code == 200
    departments = response.json()
    assert len(departments) == 6
    assert {d["code"] for d in departments} >= {"general", "cardiology", "dental"}


def test_otp_request_and_verify(client):
    phone = "9111111111"
    requested = client.post("/auth/request-otp", json={"phone": phone})
    assert requested.status_code == 200
    code = requested.json()["dev_code"]
    assert len(code) == 6

    wrong = client.post("/auth/verify-otp", json={"phone": phone, "code": "000000"})
    assert wrong.status_code == 400
    assert "Incorrect OTP" in wrong.json()["detail"]

    verified = client.post("/auth/verify-otp", json={"phone": phone, "code": code})
    assert verified.status_code == 200
    assert verified.json()["verified"] is True
    assert verified.json()["patient_token"]


def test_otp_requires_a_request_first(client):
    response = client.post(
        "/auth/verify-otp", json={"phone": "9222222222", "code": "123456"}
    )
    assert response.status_code == 400
    assert "Request an OTP" in response.json()["detail"]


def test_otp_resend_is_rate_limited(client):
    phone = "9333333333"
    assert client.post("/auth/request-otp", json={"phone": phone}).status_code == 200
    throttled = client.post("/auth/request-otp", json={"phone": phone})
    assert throttled.status_code == 429
    assert "Retry-After" in throttled.headers


def test_otp_rejects_malformed_phone(client):
    assert client.post("/auth/request-otp", json={"phone": "123"}).status_code == 422


def test_registration_assigns_sequential_tokens(client):
    first = _register(client, phone="9000000001")
    second = _register(client, phone="9000000002")
    assert first.status_code == 201 and second.status_code == 201
    assert first.json()["token_number"] == 1
    assert second.json()["token_number"] == 2
    assert second.json()["status"] == "waiting"
    assert second.json()["created_at"] is not None


def test_registration_rejects_duplicate_active_visit(client):
    first = _register(client, phone="9000000003")
    assert first.status_code == 201

    duplicate = _register(client, phone="9000000003")
    assert duplicate.status_code == 409
    detail = duplicate.json()["detail"]
    assert detail["patient_id"] == first.json()["id"]
    assert "already have token" in detail["message"]


def test_registration_rejects_invalid_age(client):
    assert _register(client, age=0).status_code == 422
    assert _register(client, age=150).status_code == 422


def test_cannot_complete_a_waiting_patient(client):
    patient = _register(client).json()
    response = client.put(f"/patients/{patient['id']}/complete")
    assert response.status_code == 409
    assert "Cannot complete" in response.json()["detail"]


def test_full_visit_flow(client):
    patient = _register(client).json()
    patient_id = patient["id"]

    called = client.put(f"/patients/{patient_id}/call")
    assert called.status_code == 200
    assert called.json()["status"] == "called"

    consulting = client.put(f"/patients/{patient_id}/consult")
    assert consulting.status_code == 200
    assert consulting.json()["status"] == "consulting"

    completed = client.put(f"/patients/{patient_id}/complete")
    assert completed.status_code == 200
    assert completed.json()["status"] == "completed"

    status = client.get(f"/patients/{patient_id}/queue-status").json()
    assert status["status"] == "completed"
    assert status["queue_position"] is None


def test_call_next_prefers_higher_priority(client):
    regular = _register(client, phone="9000000010", priority="regular").json()
    emergency = _register(client, phone="9000000011", priority="emergency").json()

    called = client.put("/patients/call-next", params={"department": "general"})
    assert called.status_code == 200
    assert called.json()["id"] == emergency["id"]
    assert called.json()["id"] != regular["id"]


def test_call_next_reports_empty_queue(client):
    response = client.put("/patients/call-next", params={"department": "neurology"})
    assert response.status_code == 200
    assert response.json() == {"message": "No waiting patients"}


def test_only_one_patient_can_occupy_the_room(client):
    first = _register(client, phone="9000000020").json()
    _register(client, phone="9000000021")

    assert client.put("/patients/call-next", params={"department": "general"}).status_code == 200

    blocked = client.put("/patients/call-next", params={"department": "general"})
    assert blocked.status_code == 409
    assert f"Token #{first['token_number']}" in blocked.json()["detail"]

    client.put(f"/patients/{first['id']}/complete")
    assert client.put("/patients/call-next", params={"department": "general"}).status_code == 200


def test_calling_a_second_patient_is_rejected(client):
    first = _register(client, phone="9000000030").json()
    second = _register(client, phone="9000000031").json()

    assert client.put(f"/patients/{first['id']}/call").status_code == 200
    conflict = client.put(f"/patients/{second['id']}/call")
    assert conflict.status_code == 409
    assert "still in the room" in conflict.json()["detail"]


def test_skipped_patient_can_be_requeued(client):
    patient = _register(client).json()
    client.put(f"/patients/{patient['id']}/call")
    assert client.put(f"/patients/{patient['id']}/skip").status_code == 200

    requeued = client.put(f"/patients/{patient['id']}/requeue")
    assert requeued.status_code == 200
    assert requeued.json()["status"] == "waiting"

    assert client.put(f"/patients/{patient['id']}/requeue").status_code == 409


def test_by_phone_prefers_the_active_visit(client):
    phone = "9000000040"
    first = _register(client, phone=phone).json()
    client.put(f"/patients/{first['id']}/call")
    client.put(f"/patients/{first['id']}/complete")

    second = _register(client, phone=phone).json()
    found = client.get(f"/patients/by-phone/{phone}")
    assert found.status_code == 200
    assert found.json()["id"] == second["id"]


def test_by_phone_unknown_number(client):
    assert client.get("/patients/by-phone/9000009999").status_code == 404


def test_tokens_restart_each_hospital_day(client, db):
    _register(client, phone="9000000050")

    yesterday = datetime.utcnow() - timedelta(days=1)
    for row in db.query(main.Patient).all():
        row.created_at = yesterday
    db.commit()

    fresh = _register(client, phone="9000000051")
    assert fresh.status_code == 201
    assert fresh.json()["token_number"] == 1


def test_queue_status_for_waiting_patient(client):
    first = _register(client, phone="9000000060").json()
    _register(client, phone="9000000061")

    status = client.get(f"/patients/{first['id']}/queue-status").json()
    assert status["status"] == "waiting"
    assert status["queue_position"] == 1
    assert status["patients_ahead"] == 0
    assert status["estimated_wait_minutes"] == 0


def test_admin_overview_counts_only_today(client):
    _register(client, phone="9000000070")
    overview = client.get("/admin/overview", headers=_role_header(client, "admin")).json()
    assert overview["total_patients"] == 1
    assert overview["waiting_patients"] == 1
    assert overview["total_doctors"] == 6


def test_admin_analytics_shape(client):
    _register(client, phone="9000000080", priority="elderly")
    analytics = client.get("/admin/analytics", headers=_role_header(client, "admin")).json()

    assert len(analytics["department_workload"]) == 6
    assert len(analytics["priority_distribution"]) == 5
    assert len(analytics["hourly_patient_flow"]) == 10
    assert len(analytics["doctor_utilization"]) == 6

    elderly = next(
        row for row in analytics["priority_distribution"] if row["priority"] == "Elderly"
    )
    assert elderly["count"] == 1


def test_department_load_marks_break_as_bottleneck(client):
    doctor = client.get("/doctors").json()[0]
    client.put(f"/doctors/{doctor['id']}/toggle-availability")
    _register(client, phone="9000000090", department=doctor["department_code"])

    load = client.get("/admin/department-load", headers=_role_header(client, "admin")).json()
    row = next(item for item in load if item["department_id"] == doctor["department_id"])
    assert row["is_available"] is False
    assert row["load_level"] == "Critical"
    assert row["bottleneck_alert"] is True

    client.put(f"/doctors/{doctor['id']}/toggle-availability")


def test_opd_status_reflects_doctor_availability(client):
    doctors = client.get("/doctors").json()
    doctor = doctors[0]
    client.put(f"/doctors/{doctor['id']}/toggle-availability")

    opds = client.get("/opds").json()
    row = next(item for item in opds if item["code"] == doctor["department_code"])
    assert row["status"] == "Doctor on Break"

    client.put(f"/doctors/{doctor['id']}/toggle-availability")
    opds = client.get("/opds").json()
    row = next(item for item in opds if item["code"] == doctor["department_code"])
    assert row["status"] in {"Available", "Busy"}


# --------------------------------------------------
# PORTAL AUTHENTICATION
# --------------------------------------------------


def test_staff_login_and_role_matrix(client):
    admin_login = client.post(
        "/auth/staff-login",
        json={
            "employee_code": os.environ.get("ADMIN_CODE", "ADM-001"),
            "pin": os.environ.get("ADMIN_PIN", "123456"),
        },
    )
    assert admin_login.status_code == 200, admin_login.text
    assert admin_login.json()["role"] == "admin"
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    wrong_pin = client.post(
        "/auth/staff-login",
        json={"employee_code": os.environ.get("ADMIN_CODE", "ADM-001"), "pin": "000000"},
    )
    assert wrong_pin.status_code == 401

    unknown = client.post(
        "/auth/staff-login",
        json={"employee_code": "NOPE-999", "pin": "123456"},
    )
    assert unknown.status_code == 401

    # Staff credentials cannot open the admin section...
    staff_denied = client.get("/admin/overview", headers=_role_header(client, "staff"))
    assert staff_denied.status_code == 403

    # ...but the admin role can.
    assert client.get("/admin/overview", headers=admin_headers).status_code == 200

    # Unauthenticated callers get 401, not 403 (and not data).
    anon = TestClient(main.app)
    assert anon.get("/admin/overview").status_code == 401
    assert anon.get("/admin/analytics").status_code == 401
    assert anon.put("/patients/call-next", params={"department": "general"}).status_code == 401


def test_staff_login_is_rate_limited(client):
    code = "RATE-TEST"
    statuses = []
    for _ in range(9):
        response = client.post(
            "/auth/staff-login",
            json={"employee_code": code, "pin": "1234"},
        )
        statuses.append(response.status_code)

    assert statuses[:8] == [401] * 8
    assert statuses[8] == 429


def test_patient_registration_requires_otp_session(client):
    anon = TestClient(main.app)
    payload = {
        "name": "No Token",
        "age": 30,
        "phone": "9000000701",
        "department": "general",
        "priority": "regular",
    }

    # Anonymous callers cannot register at all.
    assert anon.post("/patients", json=payload).status_code == 401

    # A staff portal token is not a patient OTP session either.
    staff_only = client.post("/patients", json=payload)
    assert staff_only.status_code == 401

    # An OTP session for one number cannot register a different number.
    other_phone = dict(payload, phone="9000000702")
    mismatch = client.post(
        "/patients",
        json=other_phone,
        headers=patient_headers(client, "9000000703"),
    )
    assert mismatch.status_code == 403

    # The right session works.
    ok = client.post("/patients", json=payload, headers=patient_headers(client, "9000000701"))
    assert ok.status_code == 201


def test_by_phone_hides_details_without_verification(client):
    phone = "9000000704"
    created = _register(client, phone=phone).json()

    anon = TestClient(main.app)
    response = anon.get(f"/patients/by-phone/{phone}")
    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "id": created["id"],
        "requires_verification": True,
        "phone": phone,
    }

    # The owner's OTP session sees the full record.
    owner = client.get(f"/patients/by-phone/{phone}", headers=patient_headers(client, phone))
    assert owner.json()["name"] == "Asha Verma"


def test_patient_records_are_scoped_to_the_owner(client):
    patient = _register(client, phone="9000000705").json()
    owner = patient_headers(client, "9000000705")
    stranger = patient_headers(client, "9000000706")
    anon = TestClient(main.app)

    assert client.get(f"/patients/{patient['id']}", headers=owner).status_code == 200
    assert client.get(f"/patients/{patient['id']}", headers=stranger).status_code == 403
    assert client.get(f"/patients/{patient['id']}").status_code == 200  # staff console may read
    assert anon.get(f"/patients/{patient['id']}").status_code == 401

    assert client.get(f"/patients/{patient['id']}/queue-status", headers=owner).status_code == 200
    assert (
        client.get(f"/patients/{patient['id']}/queue-status", headers=stranger).status_code
        == 403
    )

    # Cancel: stranger rejected, anonymous rejected, owner succeeds.
    assert client.put(f"/patients/{patient['id']}/cancel", headers=stranger).status_code == 403
    assert anon.put(f"/patients/{patient['id']}/cancel").status_code == 401
    cancelled = client.put(f"/patients/{patient['id']}/cancel", headers=owner)
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"


def test_hospital_portal_manages_departments_and_doctors(client, db):
    staff = _role_header(client, "staff")
    hospital = _role_header(client, "hospital")
    admin = _role_header(client, "admin")
    dept_id = None

    try:
        # Staff may not manage hospital configuration.
        denied = client.post(
            "/hospital/departments",
            json={"code": "ent-test", "name": "ENT"},
            headers=staff,
        )
        assert denied.status_code == 403

        created = client.post(
            "/hospital/departments",
            json={"code": "ent-test", "name": "ENT (test)", "description": "test dept"},
            headers=hospital,
        )
        assert created.status_code == 201, created.text
        dept_id = created.json()["id"]

        duplicate = client.post(
            "/hospital/departments",
            json={"code": "ent-test", "name": "Duplicate"},
            headers=hospital,
        )
        assert duplicate.status_code == 409

        # Timing cannot be set before the department has a doctor.
        early = client.put(
            f"/hospital/departments/{dept_id}/schedule",
            json={"timing": "9 AM - 1 PM"},
            headers=hospital,
        )
        assert early.status_code == 409

        doctor = client.post(
            "/hospital/doctors",
            json={
                "name": "Dr. Test",
                "specialization": "ENT",
                "room_number": "T-01",
                "department_id": dept_id,
            },
            headers=hospital,
        )
        assert doctor.status_code == 201, doctor.text

        timing = client.put(
            f"/hospital/departments/{dept_id}/schedule",
            json={"timing": "9 AM - 1 PM"},
            headers=hospital,
        )
        assert timing.status_code == 200
        assert timing.json()["timing"] == "9 AM - 1 PM"

        updated = client.put(
            f"/hospital/departments/{dept_id}",
            json={"name": "ENT Wing"},
            headers=hospital,
        )
        assert updated.status_code == 200
        assert updated.json()["name"] == "ENT Wing"

        # Overview: hospital + admin yes, staff no.
        overview = client.get("/hospital/overview", headers=hospital)
        assert overview.status_code == 200
        mine = next(row for row in overview.json() if row["id"] == dept_id)
        assert mine["timing"] == "9 AM - 1 PM"
        assert len(mine["doctors"]) == 1

        assert client.get("/hospital/overview", headers=admin).status_code == 200
        assert client.get("/hospital/overview", headers=staff).status_code == 403
        assert TestClient(main.app).get("/hospital/overview").status_code == 401
    finally:
        # Keep later/ordering-sensitive assertions (six departments) intact.
        if dept_id is not None:
            db.query(main.OPDSchedule).filter(
                main.OPDSchedule.department_id == dept_id
            ).delete(synchronize_session=False)
            db.query(main.Doctor).filter(
                main.Doctor.department_id == dept_id
            ).delete(synchronize_session=False)
            db.query(main.Department).filter(
                main.Department.id == dept_id
            ).delete(synchronize_session=False)
            db.commit()


def test_api_prefix_routing(client):
    """Ensure routes match with or without the /api prefix for Vercel Services rewrites."""
    # Health checks
    direct_health = client.get("/health")
    assert direct_health.status_code == 200
    assert direct_health.json()["status"] == "ok"

    prefixed_health = client.get("/api/health")
    assert prefixed_health.status_code == 200
    assert prefixed_health.json()["status"] == "ok"

    # Public endpoint /departments
    direct_depts = client.get("/departments")
    assert direct_depts.status_code == 200

    prefixed_depts = client.get("/api/departments")
    assert prefixed_depts.status_code == 200
    assert len(prefixed_depts.json()) == len(direct_depts.json())

