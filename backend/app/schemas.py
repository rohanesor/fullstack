from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    institutional_id: str
    name: str
    email: str
    role: str
    department_id: str | None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class LookupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    code: str
    name: str


class CategoryOut(LookupOut):
    description: str
    default_department_id: str | None


class ComplaintCreate(BaseModel):
    title: str = Field(min_length=4, max_length=160)
    description: str = Field(min_length=15, max_length=10000)
    location: str | None = Field(default=None, max_length=160)
    confidential: bool = False


class ClassificationIn(BaseModel):
    category_id: str
    priority: str = Field(default="NORMAL", pattern="^(NORMAL|HIGH|URGENT)$")


class AssignmentIn(BaseModel):
    department_id: str
    remark: str | None = Field(default=None, max_length=2000)


class TransitionIn(BaseModel):
    to_status: str
    remark: str = Field(min_length=3, max_length=2000)


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=4000)
    visibility: str = Field(default="STUDENT_VISIBLE", pattern="^(STUDENT_VISIBLE|INTERNAL)$")


class PredictionOut(BaseModel):
    id: str
    category_id: str | None
    category_name: str | None
    confidence: int | None
    model_version: str
    prediction_status: str
    created_at: datetime


class HistoryOut(BaseModel):
    id: str
    from_status: str | None
    to_status: str
    remark: str | None
    actor_name: str
    changed_at: datetime


class CommentOut(BaseModel):
    id: str
    author_name: str
    body: str
    visibility: str
    created_at: datetime


class ComplaintOut(BaseModel):
    id: str
    reference_code: str
    student_id: str
    student_name: str
    title: str
    description: str
    location: str | None
    final_category_id: str | None
    final_category_name: str | None
    assigned_department_id: str | None
    assigned_department_name: str | None
    priority: str
    confidential: bool
    status: str
    version: int
    created_at: datetime
    updated_at: datetime
    predictions: list[PredictionOut] = []
    history: list[HistoryOut] = []
    comments: list[CommentOut] = []


class SummaryOut(BaseModel):
    total: int
    by_status: dict[str, int]
    by_category: dict[str, int]
