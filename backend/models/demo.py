"""Tables for the imported historical hospital dataset.

These are separate from the operational OPD queue: the CSV dataset describes
completed visits and weekly service load for 2025, while ``patients`` holds the
live tokens for today.
"""

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from database import Base


class DemoVisit(Base):
    __tablename__ = "demo_visits"

    id = Column(Integer, primary_key=True, index=True)
    patient_ref = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    arrival_date = Column(Date, nullable=False, index=True)
    departure_date = Column(Date, nullable=False)
    service = Column(String, nullable=False, index=True)
    satisfaction = Column(Integer, nullable=True)


class ServiceWeekly(Base):
    __tablename__ = "demo_service_weekly"
    __table_args__ = (
        UniqueConstraint("week", "service", name="uq_demo_service_week"),
    )

    id = Column(Integer, primary_key=True, index=True)
    week = Column(Integer, nullable=False, index=True)
    month = Column(Integer, nullable=False)
    service = Column(String, nullable=False, index=True)
    available_beds = Column(Integer, nullable=False)
    patients_request = Column(Integer, nullable=False)
    patients_admitted = Column(Integer, nullable=False)
    patients_refused = Column(Integer, nullable=False)
    patient_satisfaction = Column(Integer, nullable=True)
    staff_morale = Column(Integer, nullable=True)
    event = Column(String, nullable=True)


class StaffMember(Base):
    __tablename__ = "demo_staff"

    id = Column(Integer, primary_key=True, index=True)
    staff_ref = Column(String, nullable=False, unique=True, index=True)
    name = Column(String, nullable=False, index=True)
    role = Column(String, nullable=False)
    service = Column(String, nullable=False, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)


class StaffShift(Base):
    __tablename__ = "demo_staff_shifts"
    __table_args__ = (
        UniqueConstraint("staff_id", "week", name="uq_demo_staff_week"),
    )

    id = Column(Integer, primary_key=True, index=True)
    staff_id = Column(Integer, ForeignKey("demo_staff.id"), nullable=False, index=True)
    week = Column(Integer, nullable=False, index=True)
    present = Column(Boolean, nullable=False)


class DemoImportMeta(Base):
    __tablename__ = "demo_import_meta"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, nullable=False, unique=True, index=True)
    value = Column(Text, nullable=False)
