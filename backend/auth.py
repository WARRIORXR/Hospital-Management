"""Role-based authentication for the QueueLess portals.

- Admin / Hospital / Staff log in with an employee code + numeric PIN.
  PINs are stored as salted PBKDF2-HMAC-SHA256 digests (stdlib only).
- Patients receive a short-lived patient token after OTP verification; that
  token is what unlocks registration, queue lookups, and self-service cancel.
- JWTs are signed with AUTH_SECRET. In development a random per-process
  secret is generated, so sessions simply expire on restart until a real
  secret is configured.
"""

import hashlib
import hmac
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from threading import Lock

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from models.user import User  # noqa: F401  (ensures the table is registered)

ALGORITHM = "HS256"
PBKDF2_ITERATIONS = 260_000

STAFF_TOKEN_TTL_MINUTES = 12 * 60
PATIENT_TOKEN_TTL_MINUTES = 12 * 60

LOGIN_MAX_ATTEMPTS = 8
LOGIN_WINDOW_SECONDS = 60

PORTAL_ROLES = ("admin", "hospital", "staff")

_configured_secret = os.getenv("AUTH_SECRET", "").strip().strip('"').strip("'")
# Dev fallback: an ephemeral secret keeps prod honest (set AUTH_SECRET) while
# still signing correctly within this process.
_SECRET = _configured_secret or secrets.token_hex(32)

_bearer = HTTPBearer(auto_error=False)


# --------------------------------------------------
# PIN HASHING (PBKDF2, stdlib)
# --------------------------------------------------

def hash_pin(pin: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", pin.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ITERATIONS
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_pin(pin: str, stored: str) -> bool:
    try:
        algorithm, iterations, salt, expected = stored.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        candidate = hashlib.pbkdf2_hmac(
            "sha256", pin.encode("utf-8"), bytes.fromhex(salt), int(iterations)
        )
        return hmac.compare_digest(candidate.hex(), expected)
    except (ValueError, TypeError):
        return False


# --------------------------------------------------
# TOKENS
# --------------------------------------------------

def create_token(
    *,
    kind: str,
    subject: str,
    role: str | None = None,
    name: str | None = None,
    phone: str | None = None,
    minutes: int | None = None,
) -> str:
    if minutes is None:
        minutes = (
            STAFF_TOKEN_TTL_MINUTES if kind == "staff" else PATIENT_TOKEN_TTL_MINUTES
        )
    now = datetime.now(timezone.utc)
    payload: dict = {
        "kind": kind,
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(minutes=minutes),
    }
    if role is not None:
        payload["role"] = role
    if name is not None:
        payload["name"] = name
    if phone is not None:
        payload["phone"] = phone
    return jwt.encode(payload, _SECRET, algorithm=ALGORITHM)


def decode_token(token: str, expected_kind: str) -> dict:
    """Decode a JWT, raising 401 unless it is valid and of the right kind."""
    try:
        claims = jwt.decode(token, _SECRET, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session token.")

    if claims.get("kind") != expected_kind:
        raise HTTPException(status_code=401, detail="Invalid session token.")
    return claims


# --------------------------------------------------
# FASTAPI DEPENDENCIES
# --------------------------------------------------


def require_role(*roles: str):
    """Staff-portal dependency: valid employee token whose role is allowed."""

    def dependency(
        credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    ) -> dict:
        if credentials is None:
            raise HTTPException(
                status_code=401,
                detail="Sign in to access this section.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        claims = decode_token(credentials.credentials, "staff")
        if claims.get("role") not in roles:
            raise HTTPException(
                status_code=403,
                detail=f"This section requires the {' or '.join(roles)} role.",
            )
        return claims

    return dependency


def require_patient_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """Patient dependency: token must come from a completed OTP verification."""
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Verify your mobile number to continue.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return decode_token(credentials.credentials, "patient")


def optional_access_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict | None:
    """Any valid token (staff or patient), or None when unauthenticated."""
    if credentials is None:
        return None
    try:
        decoded = jwt.decode(credentials.credentials, _SECRET, algorithms=[ALGORITHM])
    except jwt.InvalidTokenError:
        return None
    if decoded.get("kind") not in {"staff", "patient"}:
        return None
    if decoded.get("kind") == "staff" and decoded.get("role") not in PORTAL_ROLES:
        return None
    return decoded


def require_patient_or_role(*roles: str):
    """Either a staff token with one of the given roles, or a patient token.

    Endpoints using this must additionally verify that a patient token's
    phone matches the resource it is allowed to touch.
    """

    def dependency(
        credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    ) -> dict:
        if credentials is None:
            raise HTTPException(
                status_code=401,
                detail="Sign in to continue.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        try:
            claims = jwt.decode(credentials.credentials, _SECRET, algorithms=[ALGORITHM])
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Your session has expired. Please sign in again.")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=401, detail="Invalid session token.")

        if claims.get("kind") == "patient":
            return claims
        if claims.get("kind") == "staff" and claims.get("role") in roles:
            return claims
        raise HTTPException(status_code=403, detail="You do not have access to this record.")

    return dependency


def claims_may_access(claims: dict, patient) -> bool:
    """True when a token is allowed to read/modify a specific patient row."""
    if claims is None:
        return False
    if claims.get("kind") == "patient":
        return claims.get("phone") == patient.phone
    return claims.get("role") in ("staff", "admin")


# --------------------------------------------------
# LOGIN RATE LIMITING
# --------------------------------------------------

_login_attempts: dict[str, list[float]] = {}
_login_lock = Lock()


def check_login_rate_limit(employee_code: str) -> None:
    now = time.monotonic()
    with _login_lock:
        attempts = [
            stamp
            for stamp in _login_attempts.get(employee_code, [])
            if now - stamp < LOGIN_WINDOW_SECONDS
        ]
        _login_attempts[employee_code] = attempts
        if len(attempts) >= LOGIN_MAX_ATTEMPTS:
            raise HTTPException(
                status_code=429,
                detail="Too many attempts. Wait a minute and try again.",
            )


def record_login_failure(employee_code: str) -> None:
    with _login_lock:
        _login_attempts.setdefault(employee_code, []).append(time.monotonic())


def reset_login_attempts(employee_code: str) -> None:
    with _login_lock:
        _login_attempts.pop(employee_code, None)