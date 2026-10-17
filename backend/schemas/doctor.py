from pydantic import BaseModel


class DoctorBase(BaseModel):
    name: str
    specialization: str | None = None
    room_number: str
    is_available: bool = True
    department_id: int


class DoctorCreate(DoctorBase):
    pass


class DoctorOut(DoctorBase):
    id: int

    class Config:
        from_attributes = True
