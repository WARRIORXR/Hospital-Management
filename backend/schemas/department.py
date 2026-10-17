from pydantic import BaseModel


class DepartmentBase(BaseModel):
    code: str
    name: str
    description: str | None = None
    is_active: bool = True


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentOut(DepartmentBase):
    id: int

    class Config:
        from_attributes = True
