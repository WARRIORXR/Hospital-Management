from pydantic import BaseModel, ConfigDict


class DepartmentBase(BaseModel):
    code: str
    name: str
    description: str | None = None
    is_active: bool = True


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentOut(DepartmentBase):
    id: int
    model_config = ConfigDict(from_attributes=True)
