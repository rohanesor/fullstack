from datetime import datetime, timezone
from enum import Enum
from uuid import uuid4
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


def now():
    return datetime.now(timezone.utc)


def uid():
    return str(uuid4())


class Role(str, Enum):
    STUDENT = "STUDENT"
    ADMIN = "ADMIN"
    STAFF = "STAFF"


class Status(str, Enum):
    SUBMITTED = "SUBMITTED"
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"
    REJECTED = "REJECTED"


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    institutional_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), index=True)
    department_id: Mapped[str | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    department = relationship("Department")


class Department(Base):
    __tablename__ = "departments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Category(Base):
    __tablename__ = "categories"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text, default="")
    default_department_id: Mapped[str | None] = mapped_column(ForeignKey("departments.id"))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    default_department = relationship("Department")


class Complaint(Base):
    __tablename__ = "complaints"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    reference_code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(160))
    final_category_id: Mapped[str | None] = mapped_column(ForeignKey("categories.id"), index=True)
    assigned_department_id: Mapped[str | None] = mapped_column(ForeignKey("departments.id"), index=True)
    priority: Mapped[str] = mapped_column(String(20), default="NORMAL")
    confidential: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(30), default=Status.SUBMITTED.value, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    student = relationship("User", foreign_keys=[student_id])
    final_category = relationship("Category")
    assigned_department = relationship("Department")
    predictions = relationship("Prediction", cascade="all, delete-orphan", order_by="Prediction.created_at")
    history = relationship("StatusHistory", cascade="all, delete-orphan", order_by="StatusHistory.changed_at")
    comments = relationship("Comment", cascade="all, delete-orphan", order_by="Comment.created_at")


class Prediction(Base):
    __tablename__ = "predictions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.id"), index=True)
    category_id: Mapped[str | None] = mapped_column(ForeignKey("categories.id"))
    confidence: Mapped[int | None] = mapped_column(Integer)
    model_version: Mapped[str] = mapped_column(String(100))
    prediction_status: Mapped[str] = mapped_column(String(30))
    error_code: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    category = relationship("Category")


class Assignment(Base):
    __tablename__ = "assignments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.id"), index=True)
    department_id: Mapped[str] = mapped_column(ForeignKey("departments.id"))
    assigned_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class StatusHistory(Base):
    __tablename__ = "status_history"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.id"), index=True)
    from_status: Mapped[str | None] = mapped_column(String(30))
    to_status: Mapped[str] = mapped_column(String(30))
    remark: Mapped[str | None] = mapped_column(Text)
    changed_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    actor = relationship("User")


class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.id"), index=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    visibility: Mapped[str] = mapped_column(String(30), default="STUDENT_VISIBLE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    author = relationship("User")


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(80), index=True)
    resource_type: Mapped[str] = mapped_column(String(50))
    resource_id: Mapped[str] = mapped_column(String(36), index=True)
    event_metadata: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
