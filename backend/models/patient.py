from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String
from database import Base


def _utc_now_naive():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    phone = Column(String, nullable=False, index=True)
    department = Column(String, nullable=False, index=True)
    token_number = Column(Integer, nullable=False)
    status = Column(String, nullable=True, index=True)
    symptoms = Column(String, nullable=True)
    priority = Column(String, nullable=True)
    created_at = Column(DateTime, default=_utc_now_naive, nullable=True, index=True)