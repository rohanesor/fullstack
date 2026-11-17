"""Demo data for local development and end-to-end tests. Never enable SEED_DEMO_DATA in production."""

from sqlalchemy import select
from sqlalchemy.orm import Session
from .models import Category, Department, User
from .security import hash_password

DEMO_PASSWORD = "Campus@2026"
DEPTS = [
    ("ACAD", "Academic Affairs"),
    ("INFRA", "Estate & Infrastructure"),
    ("HOSTEL", "Hostel Office"),
    ("TRANSPORT", "Transport Office"),
    ("ADMIN", "Administrative Office"),
]
CATS = [
    ("ACADEMICS", "Academics", "Classes, faculty, exams, results, timetable", "ACAD"),
    ("INFRASTRUCTURE", "Infrastructure", "Buildings, classrooms, labs, Wi-Fi, electricity, water", "INFRA"),
    ("HOSTEL", "Hostel", "Rooms, mess, hygiene, wardens, hostel facilities", "HOSTEL"),
    ("TRANSPORT", "Transport", "College buses, routes, timings, drivers", "TRANSPORT"),
    ("ADMINISTRATION", "Administration", "Fees, certificates, ID cards, office services", "ADMIN"),
]
USERS = [
    ("STU001", "Aditi Sharma", "student@campus.edu", "STUDENT", None),
    ("STU002", "Rahul Verma", "student2@campus.edu", "STUDENT", None),
    ("ADM001", "Dr. Meena Iyer", "admin@campus.edu", "ADMIN", None),
    ("TCH001", "Prof. Arjun Rao", "teacher@campus.edu", "ADMIN", None),
    ("STF001", "Karthik Raj", "infra.staff@campus.edu", "STAFF", "INFRA"),
    ("STF002", "Priya Nair", "hostel.staff@campus.edu", "STAFF", "HOSTEL"),
    ("STF003", "Suresh Kumar", "transport.staff@campus.edu", "STAFF", "TRANSPORT"),
    ("STF004", "Anita Das", "academic.staff@campus.edu", "STAFF", "ACAD"),
    ("STF005", "Farhan Ali", "office.staff@campus.edu", "STAFF", "ADMIN"),
]


def seed_demo(db: Session):
    if db.scalar(select(User.id).limit(1)):
        return
    depts = {code: Department(code=code, name=name) for code, name in DEPTS}
    db.add_all(depts.values())
    db.flush()
    db.add_all(Category(code=c, name=n, description=d, default_department_id=depts[dep].id) for c, n, d, dep in CATS)
    pw = hash_password(DEMO_PASSWORD)
    db.add_all(
        User(institutional_id=i, name=n, email=e, password_hash=pw, role=r, department_id=depts[d].id if d else None)
        for i, n, e, r, d in USERS
    )
    db.commit()
