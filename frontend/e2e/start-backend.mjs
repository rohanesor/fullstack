// Launches the FastAPI backend for e2e tests against a brand-new SQLite database seeded with demo accounts.
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const backend = resolve(import.meta.dirname, '../../backend');
const db = join(backend, 'test_e2e.db');
for (const f of [db, `${db}-journal`]) if (existsSync(f)) rmSync(f);
const repository = resolve(backend, '..');
const venvPy = [join(backend, '.venv', 'Scripts', 'python.exe'), join(backend, '.venv', 'bin', 'python'), join(repository, '.venv', 'Scripts', 'python.exe'), join(repository, '.venv', 'bin', 'python')].find(existsSync);
const py = process.env.BACKEND_PYTHON ?? venvPy ?? (process.platform === 'win32' ? 'python' : 'python3');
const env = { ...process.env, DATABASE_URL: 'sqlite:///./test_e2e.db', SEED_DEMO_DATA: 'true', LOGIN_ATTEMPTS_PER_MINUTE: '1000', CORS_ORIGINS: 'http://127.0.0.1:5173' };
const p = spawn(py, ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000'], { cwd: backend, env, stdio: 'inherit' });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { p.kill(); process.exit(0); });
p.on('exit', (code) => process.exit(code ?? 0));
