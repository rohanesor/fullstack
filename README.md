# CampusResolve

College complaint management product with Student, Administrator, and Department Staff workflows. The interface is intentionally minimally styled so the design can be replaced without changing application behavior.

## Run locally

### Backend

```bash
python -m venv .venv
source .venv/bin/activate                 # Windows: .venv\Scripts\activate
pip install -r backend/requirements-dev.txt
cd backend
cp .env.example .env
uvicorn app.main:app --reload
```

API docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Web app: http://localhost:5173

### Demo accounts

All use password `Campus123!`:

- `student@campusresolve.edu`
- `admin@campusresolve.edu`
- `staff@campusresolve.edu` (Campus Facilities)

Change/remove demo credentials before deployment.

## Tests

```bash
source .venv/bin/activate
cd backend && pytest -q
cd ../frontend && npm install && npx playwright install chromium && npm run test:e2e
npm run build
```

## ML model

Complaint creation works when no model is installed. Predictions are then recorded as `NOT_CONFIGURED`, and administrators classify manually. This is intentional: do not claim model quality or deploy an unreviewed model before an approved labelled dataset is available.

To activate a reviewed model, save one scikit-learn pipeline (vectorizer + classifier) to `backend/models/complaint_pipeline.joblib`, set `MODEL_VERSION`, and restart the API. Its labels must match category codes: `ACADEMICS`, `INFRASTRUCTURE`, `HOSTEL`, `TRANSPORT`, and `ADMINISTRATION`.

See `ARCHITECTURE_PLAN.md` for architecture, security, ML governance, and roadmap.

## Production deployment on an AWS EC2 instance

The production setup is Docker Compose with PostgreSQL, FastAPI and Nginx. It is intended to sit behind an **Application Load Balancer (ALB)** that terminates TLS. The EC2 web port `8080` must be allowed only from the ALB security group, never from the Internet.

1. Launch a current Ubuntu 24.04 EC2 instance (start with `t4g.small` for ARM64 or `t3.small` for x86), encrypted gp3 EBS, **IMDSv2 required**, and an IAM instance profile containing `AmazonSSMManagedInstanceCore`. Use Session Manager rather than opening SSH.
2. Install Docker Engine and Compose on the instance; clone this repository.
3. Copy `.env.production.example` to `.env.production`, set unique passwords and a 32+ character secret, and set the public hostname/origin. Do not enable demo data.
4. Start the stack: `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`.
5. Create an ALB HTTPS listener with an ACM certificate. Target group: instance target on HTTP port `8080`; health check path `/health`. The ALB listener redirects HTTP 80 to HTTPS 443.
6. Security groups: ALB allows 80/443 from the Internet; EC2 allows TCP 8080 **only from the ALB security group**. PostgreSQL has no host port and is unavailable outside Docker.
7. Verify `https://YOUR_HOST/health`, then execute the API and Playwright suites against a staging deployment before publishing a production URL.

Operational requirements: back up the `postgres_data` volume/database, rotate `JWT_SECRET` by planned session invalidation, patch the instance, keep `SEED_DEMO_DATA=false`, and monitor `docker compose logs`. Never use the demo accounts in production.

### Deployment checks

```bash
# on EC2
curl -fsS http://127.0.0.1:8080/health
curl -fsS https://complaints.example.edu/health

docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=100 api
```
