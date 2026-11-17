import secrets
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import AuditEvent, Category, Complaint, Prediction, Status, StatusHistory, User
from .predictor import predictor


def reference_code() -> str:
    return f"CR-{datetime.now(timezone.utc).year}-{secrets.token_hex(3).upper()}"


def audit(db: Session, actor: User, action: str, resource_id: str, metadata: dict | None = None):
    db.add(AuditEvent(actor_id=actor.id, action=action, resource_type="complaint", resource_id=resource_id, event_metadata=metadata or {}))


def add_history(db: Session, complaint: Complaint, actor: User, to_status: str, remark: str | None = None):
    old = complaint.status
    complaint.status = to_status
    complaint.version += 1
    if to_status == Status.RESOLVED.value:
        complaint.resolved_at = datetime.now(timezone.utc)
    if to_status == Status.CLOSED.value:
        complaint.closed_at = datetime.now(timezone.utc)
    db.add(StatusHistory(complaint_id=complaint.id, from_status=old, to_status=to_status, remark=remark, changed_by=actor.id))
    audit(db, actor, "STATUS_CHANGED", complaint.id, {"from": old, "to": to_status})


def run_prediction(db: Session, complaint: Complaint):
    result = predictor.predict(f"{complaint.title}\n{complaint.description}")
    category = db.scalar(select(Category).where(Category.code == result.category_code)) if result.category_code else None
    db.add(Prediction(complaint_id=complaint.id, category_id=category.id if category else None, confidence=result.confidence, model_version=result.model_version, prediction_status=result.status, error_code=result.error_code))


def can_view(user: User, complaint: Complaint) -> bool:
    if user.role == "ADMIN":
        return True
    if user.role == "STUDENT":
        return complaint.student_id == user.id
    # department staff see only complaints currently assigned to their department; confidential cases stay with administrators
    return (not complaint.confidential and complaint.assigned_department_id is not None
            and complaint.assigned_department_id == user.department_id)


def get_visible_complaint(db: Session, complaint_id: str, user: User) -> Complaint:
    complaint = db.get(Complaint, complaint_id)
    if not complaint:
        raise HTTPException(404, "Complaint not found")
    if not can_view(user, complaint):
        raise HTTPException(404, "Complaint not found")
    return complaint


def serialize(complaint: Complaint, viewer: User) -> dict:
    comments = complaint.comments if viewer.role != "STUDENT" else [c for c in complaint.comments if c.visibility == "STUDENT_VISIBLE"]
    return {
        "id": complaint.id, "reference_code": complaint.reference_code,
        "student_id": complaint.student_id, "student_name": complaint.student.name,
        "title": complaint.title, "description": complaint.description, "location": complaint.location,
        "final_category_id": complaint.final_category_id,
        "final_category_name": complaint.final_category.name if complaint.final_category else None,
        "assigned_department_id": complaint.assigned_department_id,
        "assigned_department_name": complaint.assigned_department.name if complaint.assigned_department else None,
        "priority": complaint.priority, "confidential": complaint.confidential,
        "status": complaint.status, "version": complaint.version,
        "created_at": complaint.created_at, "updated_at": complaint.updated_at,
        "predictions": [{"id": p.id, "category_id": p.category_id, "category_name": p.category.name if p.category else None, "confidence": p.confidence, "model_version": p.model_version, "prediction_status": p.prediction_status, "created_at": p.created_at} for p in complaint.predictions],
        "history": [{"id": h.id, "from_status": h.from_status, "to_status": h.to_status, "remark": h.remark, "actor_name": h.actor.name, "changed_at": h.changed_at} for h in complaint.history],
        "comments": [{"id": c.id, "author_name": c.author.name, "body": c.body, "visibility": c.visibility, "created_at": c.created_at} for c in comments],
    }


TRANSITIONS = {
    # Administrators handle confidential complaints directly because they are intentionally hidden from department staff.
    "ADMIN": {"SUBMITTED": {"REJECTED"}, "ASSIGNED": {"IN_PROGRESS", "RESOLVED"}, "IN_PROGRESS": {"RESOLVED"}, "RESOLVED": {"CLOSED", "IN_PROGRESS"}, "CLOSED": {"IN_PROGRESS"}, "REJECTED": {"SUBMITTED"}},
    "STAFF": {"ASSIGNED": {"IN_PROGRESS"}, "IN_PROGRESS": {"RESOLVED"}},
    "STUDENT": {"RESOLVED": {"IN_PROGRESS"}},
}


def transition(db: Session, complaint: Complaint, actor: User, target: str, remark: str):
    allowed = TRANSITIONS.get(actor.role, {}).get(complaint.status, set())
    if target not in allowed:
        raise HTTPException(409, f"Transition {complaint.status} to {target} is not allowed for {actor.role}")
    add_history(db, complaint, actor, target, remark)
    db.commit()
    db.refresh(complaint)
