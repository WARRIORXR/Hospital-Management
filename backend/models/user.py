from sqlalchemy import Boolean, Column, Integer, String
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    employee_code = Column(String, unique=True, index=True, nullable=False)
    pin_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # admin | hospital | staff
    name = Column(String, nullable=False)
    department_id = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True)