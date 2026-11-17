import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../auth';
import { Brand } from '../Layout';
import { Alert, Field } from '../ui';

// Demo accounts exist only when the backend seeds demo data (development / e2e). Hide with VITE_SHOW_DEMO=false.
const DEMO = import.meta.env.VITE_SHOW_DEMO !== 'false';
const DEMO_USERS = [['Student', 'student@campus.edu'], ['Administrator', 'admin@campus.edu'], ['Infrastructure staff', 'infra.staff@campus.edu'], ['Hostel staff', 'hostel.staff@campus.edu']];

export default function Login() {
  const { user, signIn } = useAuth(); const nav = useNavigate(); const loc = useLocation();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={homeFor(user.role)} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!email.includes('@')) return setErr('Enter your college email address.');
    if (password.length < 8) return setErr('Password must be at least 8 characters.');
    setBusy(true);
    try {
      const u = await signIn(email.trim(), password);
      const from = (loc.state as { from?: string } | null)?.from;
      nav(from && from !== '/login' ? from : homeFor(u.role), { replace: true });
    } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <section className="auth-hero" aria-hidden>
        <Brand />
        <h1>Raise it. Route it. Resolve it.</h1>
        <p>Report a campus problem in under two minutes and follow it until it's fixed — every step is visible.</p>
        <ol className="auth-steps">
          <li><b>Raise</b> a complaint with a clear description</li>
          <li><b>Route</b> — an administrator sends it to the right department</li>
          <li><b>Resolve</b> — track progress and reopen if it isn't fixed</li>
        </ol>
      </section>
      <section className="auth-card">
        <h2>Sign in</h2>
        <p className="muted">Use your college account.</p>
        {err && <Alert>{err}</Alert>}
        <form onSubmit={submit} noValidate>
          <Field id="email" label="College email"><input id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field id="password" label="Password"><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        {DEMO && (
          <details className="demo">
            <summary>Demo accounts</summary>
            <p className="muted small">Password for all: <code>Campus@2026</code></p>
            <div className="demo-grid">
              {DEMO_USERS.map(([label, mail]) => (
                <button key={mail} type="button" className="btn btn-ghost btn-sm" onClick={() => { setEmail(mail); setPassword('Campus@2026'); }}>{label}</button>
              ))}
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
