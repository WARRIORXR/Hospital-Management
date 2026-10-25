"""Shared pytest fixtures for the QueueLess API.

The application reads DATABASE_URL at import time, so the temporary database
must be configured before ``main`` is imported.
"""

import os
import sys
import tempfile
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

_TEMP_DIR = tempfile.mkdtemp(prefix="queueless-tests-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_TEMP_DIR) / 'test.db'}"
os.environ["OTP_DEBUG"] = "true"
# The suite shares one client IP; raise the per-IP OTP ceilings so only the
# dedicated throttle test exercises the limiter.
os.environ["OTP_REQUEST_IP_LIMIT"] = "10000"
os.environ["OTP_VERIFY_IP_LIMIT"] = "10000"

# Hermetic portal credentials: the tests must not depend on a developer's
# local backend/.env values.
os.environ["AUTH_SECRET"] = "queueless-test-secret-0123456789abcdef"
os.environ["ADMIN_CODE"] = "ADM-001"
os.environ["ADMIN_PIN"] = "123456"
os.environ["HOSPITAL_CODE"] = "HOSP-001"
os.environ["HOSPITAL_PIN"] = "123456"
os.environ["STAFF_CODE"] = "DR-101"
os.environ["STAFF_PIN"] = "123456"

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from database import SessionLocal  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(main.app) as test_client:
        # Default every request to the staff portal; tests that need another
        # role pass their own Authorization header per request.
        login = test_client.post(
            "/auth/staff-login",
            json={"employee_code": os.environ["STAFF_CODE"], "pin": os.environ["STAFF_PIN"]},
        )
        assert login.status_code == 200, login.text
        test_client.headers["Authorization"] = f"Bearer {login.json()['access_token']}"
        yield test_client


_PATIENT_TOKENS: dict[str, str] = {}


def patient_token_for(client, phone: str) -> str:
    """OTP-verify a phone once per session and cache its patient token."""
    if phone in _PATIENT_TOKENS:
        return _PATIENT_TOKENS[phone]

    requested = client.post("/auth/request-otp", json={"phone": phone})
    assert requested.status_code == 200, requested.text
    code = requested.json()["dev_code"]

    verified = client.post("/auth/verify-otp", json={"phone": phone, "code": code})
    assert verified.status_code == 200, verified.text
    token = verified.json()["patient_token"]
    _PATIENT_TOKENS[phone] = token
    return token


def patient_headers(client, phone: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {patient_token_for(client, phone)}"}


@pytest.fixture()
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def clear_patients():
    """Keep every test independent by wiping visits between tests."""
    yield
    session = SessionLocal()
    try:
        session.query(main.Patient).delete()
        session.commit()
    finally:
        session.close()


@pytest.fixture()
def registered(client):
    """Create a single waiting patient and return its JSON payload."""

    def _create(**overrides):
        payload = {
            "name": "Asha Verma",
            "age": 34,
            "phone": "9000000001",
            "department": "general",
            "priority": "regular",
        }
        payload.update(overrides)
        response = client.post(
            "/patients",
            json=payload,
            headers=patient_headers(client, payload["phone"]),
        )
        assert response.status_code == 201, response.text
        return response.json()

    return _create
