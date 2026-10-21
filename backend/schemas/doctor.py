from pydantic import BaseModel, ConfigDict


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
    model_config = ConfigDict(from_attributes=True)
