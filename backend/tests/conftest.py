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

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from database import SessionLocal  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(main.app) as test_client:
        yield test_client


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
        response = client.post("/patients", json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    return _create
