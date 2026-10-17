from pydantic import BaseModel, Field

from enum import Enum


class Department(str, Enum):
    dental = "dental"
    cardiology = "cardiology"
    gastro = "gastro"
    orthopedics = "orthopedics"
    neurology = "neurology"
    general = "general"

class Priority(str, Enum):
    emergency = "emergency"
    elderly = "elderly"
    pregnant = "pregnant"
    follow_up = "follow_up"
    regular = "regular"

class PatientCreate(BaseModel):
    name: str
    age: int
    phone: str = Field(..., pattern=r"^[0-9]{10}$")
    department: Department
    symptoms: str | None = None
    priority: Priority | None = None