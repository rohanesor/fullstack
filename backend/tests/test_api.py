import os
import tempfile

os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["SEED_DEMO_DATA"] = "true"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import DEMO_PASSWORD  # noqa: E402


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def login(client, email):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": DEMO_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_login_rejects_bad_password(client):
    r = client.post("/api/v1/auth/login", json={"email": "student@campus.edu", "password": "wrong-password"})
    assert r.status_code == 401


def test_full_workflow_and_access_rules(client):
    stu, stu2, adm = login(client, "student@campus.edu"), login(client, "student2@campus.edu"), login(client, "admin@campus.edu")
    infra, hostel = login(client, "infra.staff@campus.edu"), login(client, "hostel.staff@campus.edu")
    r = client.post("/api/v1/complaints", headers=stu, json={"title": "Projector broken", "description": "The projector in room B204 has not worked for a week.", "location": "B204"})
    assert r.status_code == 201
    c = r.json()
    assert c["reference_code"].startswith("CR-") and c["status"] == "SUBMITTED"
    assert c["predictions"][0]["prediction_status"] == "NOT_CONFIGURED"  # no model: complaint still accepted
    cid = c["id"]
    assert client.get(f"/api/v1/complaints/{cid}", headers=stu2).status_code == 404  # other student
    assert client.get(f"/api/v1/complaints/{cid}", headers=infra).status_code == 404  # not yet assigned
    assert client.post(f"/api/v1/admin/complaints/{cid}/assignments", headers=adm, json={"department_id": "x"}).status_code == 409
    cats = {x["code"]: x for x in client.get("/api/v1/lookups/categories", headers=adm).json()}
    r = client.put(f"/api/v1/admin/complaints/{cid}/classification", headers=adm, json={"category_id": cats["INFRASTRUCTURE"]["id"], "priority": "HIGH"})
    assert r.status_code == 200
    r = client.post(f"/api/v1/admin/complaints/{cid}/assignments", headers=adm, json={"department_id": cats["INFRASTRUCTURE"]["default_department_id"]})
    assert r.json()["status"] == "ASSIGNED"
    assert client.get(f"/api/v1/complaints/{cid}", headers=hostel).status_code == 404  # other department
    assert any(x["id"] == cid for x in client.get("/api/v1/staff/complaints", headers=infra).json())
    bad = client.post(f"/api/v1/staff/complaints/{cid}/transitions", headers=infra, json={"to_status": "RESOLVED", "remark": "skip"})
    assert bad.status_code == 409
    client.post(f"/api/v1/staff/complaints/{cid}/comments", headers=infra, json={"body": "Vendor quote pending", "visibility": "INTERNAL"})
    client.post(f"/api/v1/staff/complaints/{cid}/transitions", headers=infra, json={"to_status": "IN_PROGRESS", "remark": "Technician sent"})
    r = client.post(f"/api/v1/staff/complaints/{cid}/transitions", headers=infra, json={"to_status": "RESOLVED", "remark": "Lamp replaced"})
    assert r.json()["status"] == "RESOLVED"
    seen = client.get(f"/api/v1/complaints/{cid}", headers=stu).json()
    assert all(x["visibility"] == "STUDENT_VISIBLE" for x in seen["comments"])  # internal remark hidden
    assert [h["to_status"] for h in seen["history"]] == ["SUBMITTED", "ASSIGNED", "IN_PROGRESS", "RESOLVED"]
    r = client.post(f"/api/v1/admin/complaints/{cid}/transitions", headers=adm, json={"to_status": "CLOSED", "remark": "Confirmed fixed"})
    assert r.json()["status"] == "CLOSED"
    assert client.get("/api/v1/admin/reports/summary", headers=adm).json()["total"] >= 1


def test_role_guards(client):
    stu = login(client, "student@campus.edu")
    assert client.get("/api/v1/admin/complaints", headers=stu).status_code == 403
    client.cookies.clear()
    assert client.get("/api/v1/me").status_code == 401


def test_confidential_hidden_from_staff(client):
    stu, adm, infra = login(client, "student@campus.edu"), login(client, "admin@campus.edu"), login(client, "infra.staff@campus.edu")
    c = client.post("/api/v1/complaints", headers=stu, json={"title": "Sensitive matter", "description": "Please handle this privately, it is sensitive.", "confidential": True}).json()
    cats = {x["code"]: x for x in client.get("/api/v1/lookups/categories", headers=adm).json()}
    client.put(f"/api/v1/admin/complaints/{c['id']}/classification", headers=adm, json={"category_id": cats["INFRASTRUCTURE"]["id"]})
    client.post(f"/api/v1/admin/complaints/{c['id']}/assignments", headers=adm, json={"department_id": cats["INFRASTRUCTURE"]["default_department_id"]})
    assert client.get(f"/api/v1/complaints/{c['id']}", headers=infra).status_code == 404
