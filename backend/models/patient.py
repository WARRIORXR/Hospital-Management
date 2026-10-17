from datetime import datetime

from sqlalchemy import Column, DateTime, Integer, String
from database import Base


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
    created_at = Column(DateTime, default=datetime.utcnow, nullable=True, index=True)