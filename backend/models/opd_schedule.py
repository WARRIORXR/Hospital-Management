from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


class OPDSchedule(Base):
    __tablename__ = "opd_schedules"

    id = Column(Integer, primary_key=True, index=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=False)
    doctor_id = Column(Integer, ForeignKey("doctors.id"), nullable=False)
    timing = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)

    department = relationship("Department", back_populates="schedules")
    doctor = relationship("Doctor", back_populates="schedules")
