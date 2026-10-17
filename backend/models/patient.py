from sqlalchemy import Column, Integer, String
from database import Base


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    phone = Column(String, nullable=False)
    department = Column(String, nullable=False)
    token_number = Column(Integer, nullable=False)
    status = Column(String, nullable=True)
    symptoms = Column(String, nullable=True)
    priority = Column(String, nullable=True)