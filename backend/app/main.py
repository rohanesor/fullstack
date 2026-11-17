"""CampusResolve API (FastAPI). Route handlers validate input, enforce role/ownership and call services."""

import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import get_settings
from .database import SessionLocal, apply_migrations, get_db
from .models import Assignment, Category, Comment, Complaint, Department, Status, StatusHistory, User
from .schemas import (
    AssignmentIn,
    CategoryOut,
    ClassificationIn,
    CommentIn,
    ComplaintCreate,
    ComplaintOut,
    LoginIn,
    LookupOut,
    SummaryOut,
    TokenOut,
    TransitionIn,
    UserOut,
)
from .security import clear_auth_cookies, create_token, csrf_protect, current_user, require, set_auth_cookies, verify_password
from .seed import seed_demo
from .services import add_history, audit, get_visible_complaint, reference_code, run_prediction, serialize, transition

settings = get_settings()
settings.validate_production()


@asynccontextmanager
async def lifespan(_: FastAPI):
    apply_migrations()
    if settings.seed_demo_data:
        with SessionLocal() as db:
            seed_demo(db)
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan, docs_url=None if settings.app_env == "production" else "/api/docs", openapi_url=None if settings.app_env == "production" else "/api/openapi.json")
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.hosts)
app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_credentials=True, allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Referrer-Policy"] = "no-referrer"
    return resp


@app.get("/health")
def load_balancer_health():
    return {"status": "ok"}


api = APIRouter(prefix="/api/v1", dependencies=[Depends(csrf_protect)])
_attempts: dict[str, deque] = defaultdict(deque)


def throttle(key: str, limit: int = 8, window: int = 60):
    q = _attempts[key]
    t = time.monotonic()
    while q and t - q[0] > window:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Too many attempts. Try again in a minute.")
    q.append(t)


@api.get("/health")
def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}


# ---------------------------------------------------------------- auth
@api.post("/auth/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    throttle(f"login:{body.email.lower()}:{request.client.host if request.client else ''}", limit=settings.login_attempts_per_minute)
    user = db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if not user or not user.active or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect")
    token = create_token(user)
    set_auth_cookies(response, token)
    # access_token is retained for scripted API clients; the browser deliberately ignores it.
    return {"access_token": token, "user": user}


@api.post("/auth/logout", status_code=204)
def logout(response: Response):
    clear_auth_cookies(response)


@api.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@api.get("/lookups/categories", response_model=list[CategoryOut])
def categories(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return db.scalars(select(Category).where(Category.active).order_by(Category.name)).all()


@api.get("/lookups/departments", response_model=list[LookupOut])
def departments(db: Session = Depends(get_db), _: User = Depends(current_user)):
    return db.scalars(select(Department).where(Department.active).order_by(Department.name)).all()


# ---------------------------------------------------------------- student
@api.post("/complaints", response_model=ComplaintOut, status_code=201)
def create_complaint(body: ComplaintCreate, db: Session = Depends(get_db), user: User = Depends(require("STUDENT"))):
    throttle(f"submit:{user.id}", limit=10, window=600)
    c = Complaint(
        reference_code=reference_code(),
        student_id=user.id,
        title=body.title.strip(),
        description=body.description.strip(),
        location=(body.location or "").strip() or None,
        confidential=body.confidential,
        status=Status.SUBMITTED.value,
    )
    db.add(c)
    db.flush()
    db.add(
        StatusHistory(
            complaint_id=c.id, from_status=None, to_status=Status.SUBMITTED.value, remark="Complaint submitted", changed_by=user.id
        )
    )
    audit(db, user, "COMPLAINT_CREATED", c.id)
    db.commit()  # committed before ML is attempted
    try:
        run_prediction(db, c)
        db.commit()
    except Exception:
        db.rollback()  # prediction must never lose or block a complaint
    db.refresh(c)
    return serialize(c, user)


@api.get("/complaints", response_model=list[ComplaintOut])
def my_complaints(db: Session = Depends(get_db), user: User = Depends(require("STUDENT"))):
    rows = db.scalars(select(Complaint).where(Complaint.student_id == user.id).order_by(Complaint.created_at.desc())).all()
    return [serialize(c, user) for c in rows]


@api.get("/complaints/{complaint_id}", response_model=ComplaintOut)
def complaint_detail(complaint_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    return serialize(get_visible_complaint(db, complaint_id, user), user)


def _comment(db: Session, c: Complaint, user: User, body: CommentIn):
    vis = "STUDENT_VISIBLE" if user.role == "STUDENT" else body.visibility
    db.add(Comment(complaint_id=c.id, author_id=user.id, body=body.body.strip(), visibility=vis))
    audit(db, user, "COMMENT_ADDED", c.id, {"visibility": vis})
    db.commit()
    db.refresh(c)
    return serialize(c, user)


@api.post("/complaints/{complaint_id}/comments", response_model=ComplaintOut)
def student_comment(complaint_id: str, body: CommentIn, db: Session = Depends(get_db), user: User = Depends(require("STUDENT"))):
    throttle(f"comment:{user.id}", limit=20, window=600)
    return _comment(db, get_visible_complaint(db, complaint_id, user), user, body)


@api.post("/complaints/{complaint_id}/reopen", response_model=ComplaintOut)
def reopen(complaint_id: str, body: TransitionIn, db: Session = Depends(get_db), user: User = Depends(require("STUDENT"))):
    c = get_visible_complaint(db, complaint_id, user)
    transition(db, c, user, Status.IN_PROGRESS.value, body.remark)
    return serialize(c, user)


# ---------------------------------------------------------------- admin
@api.get("/admin/complaints", response_model=list[ComplaintOut])
def admin_queue(
    status: str | None = None,
    category: str | None = None,
    department: str | None = None,
    q: str | None = Query(default=None, max_length=100),
    db: Session = Depends(get_db),
    user: User = Depends(require("ADMIN")),
):
    stmt = select(Complaint).order_by(Complaint.created_at.desc())
    if status:
        stmt = stmt.where(Complaint.status == status)
    if category:
        stmt = stmt.where(Complaint.final_category_id == category)
    if department:
        stmt = stmt.where(Complaint.assigned_department_id == department)
    if q:
        stmt = stmt.where((Complaint.title.ilike(f"%{q}%")) | (Complaint.reference_code.ilike(f"%{q}%")))
    return [serialize(c, user) for c in db.scalars(stmt.limit(500)).all()]


@api.put("/admin/complaints/{complaint_id}/classification", response_model=ComplaintOut)
def classify(complaint_id: str, body: ClassificationIn, db: Session = Depends(get_db), user: User = Depends(require("ADMIN"))):
    c = get_visible_complaint(db, complaint_id, user)
    cat = db.get(Category, body.category_id)
    if not cat or not cat.active:
        raise HTTPException(422, "Unknown category")
    old = c.final_category_id
    c.final_category_id = cat.id
    c.priority = body.priority
    c.version += 1
    audit(db, user, "CATEGORY_CONFIRMED", c.id, {"from": old, "to": cat.id, "priority": body.priority})
    db.commit()
    db.refresh(c)
    return serialize(c, user)


@api.post("/admin/complaints/{complaint_id}/assignments", response_model=ComplaintOut)
def assign(complaint_id: str, body: AssignmentIn, db: Session = Depends(get_db), user: User = Depends(require("ADMIN"))):
    c = get_visible_complaint(db, complaint_id, user)
    if not c.final_category_id:
        raise HTTPException(409, "Confirm the category before assigning")
    if c.status not in (Status.SUBMITTED.value, Status.ASSIGNED.value, Status.IN_PROGRESS.value):
        raise HTTPException(409, f"Cannot assign a {c.status} complaint")
    dept = db.get(Department, body.department_id)
    if not dept or not dept.active:
        raise HTTPException(422, "Unknown department")
    now = datetime.now(timezone.utc)
    for a in db.scalars(select(Assignment).where(Assignment.complaint_id == c.id, Assignment.ended_at.is_(None))):
        a.ended_at = now
    db.add(Assignment(complaint_id=c.id, department_id=dept.id, assigned_by=user.id))
    c.assigned_department_id = dept.id
    audit(db, user, "ASSIGNED", c.id, {"department": dept.code})
    if c.status == Status.SUBMITTED.value:
        add_history(db, c, user, Status.ASSIGNED.value, body.remark or f"Assigned to {dept.name}")
    else:
        c.version += 1
    db.commit()
    db.refresh(c)
    return serialize(c, user)


@api.post("/admin/complaints/{complaint_id}/transitions", response_model=ComplaintOut)
def admin_transition(complaint_id: str, body: TransitionIn, db: Session = Depends(get_db), user: User = Depends(require("ADMIN"))):
    c = get_visible_complaint(db, complaint_id, user)
    transition(db, c, user, body.to_status, body.remark)
    return serialize(c, user)


@api.post("/admin/complaints/{complaint_id}/comments", response_model=ComplaintOut)
def admin_comment(complaint_id: str, body: CommentIn, db: Session = Depends(get_db), user: User = Depends(require("ADMIN"))):
    return _comment(db, get_visible_complaint(db, complaint_id, user), user, body)


@api.get("/admin/reports/summary", response_model=SummaryOut)
def summary(db: Session = Depends(get_db), _: User = Depends(require("ADMIN"))):
    by_status = dict(db.execute(select(Complaint.status, func.count()).group_by(Complaint.status)).all())
    by_cat = {
        (name or "Unclassified"): n
        for name, n in db.execute(
            select(Category.name, func.count(Complaint.id))
            .select_from(Complaint)
            .outerjoin(Category, Complaint.final_category_id == Category.id)
            .group_by(Category.name)
        ).all()
    }
    return {"total": sum(by_status.values()), "by_status": by_status, "by_category": by_cat}


# ---------------------------------------------------------------- department staff
@api.get("/staff/complaints", response_model=list[ComplaintOut])
def staff_queue(db: Session = Depends(get_db), user: User = Depends(require("STAFF"))):
    if not user.department_id:
        return []
    rows = db.scalars(
        select(Complaint)
        .where(Complaint.assigned_department_id == user.department_id, Complaint.confidential.is_(False))
        .order_by(Complaint.created_at.desc())
    ).all()
    return [serialize(c, user) for c in rows]


@api.post("/staff/complaints/{complaint_id}/transitions", response_model=ComplaintOut)
def staff_transition(complaint_id: str, body: TransitionIn, db: Session = Depends(get_db), user: User = Depends(require("STAFF"))):
    c = get_visible_complaint(db, complaint_id, user)
    transition(db, c, user, body.to_status, body.remark)
    return serialize(c, user)


@api.post("/staff/complaints/{complaint_id}/comments", response_model=ComplaintOut)
def staff_comment(complaint_id: str, body: CommentIn, db: Session = Depends(get_db), user: User = Depends(require("STAFF"))):
    return _comment(db, get_visible_complaint(db, complaint_id, user), user, body)


app.include_router(api)
