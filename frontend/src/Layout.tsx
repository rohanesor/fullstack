import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';

const NAV = {
  STUDENT: [['/student', 'My complaints'], ['/student/new', 'New complaint']],
  ADMIN: [['/admin', 'Work queue']],
  STAFF: [['/staff', 'Assigned to us']],
} as const;
const ROLE_LABEL = { STUDENT: 'Student', ADMIN: 'Administrator', STAFF: 'Department staff' };

export function Brand() {
  return (
    <span className="brand"><span className="brand-mark" aria-hidden>✓</span>Campus<b>Resolve</b></span>
  );
}

export default function Layout() {
  const { user, signOut } = useAuth(); const nav = useNavigate();
  if (!user) return null;
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <div className="topbar-in">
          <NavLink to="/" className="brand-link" aria-label="CampusResolve home"><Brand /></NavLink>
          <nav aria-label="Main" className="mainnav">
            {NAV[user.role].map(([to, label]) => <NavLink key={to} to={to} end>{label}</NavLink>)}
          </nav>
          <div className="who">
            <span className="who-name">{user.name}<small>{ROLE_LABEL[user.role]}</small></span>
            <button className="btn btn-ghost" onClick={() => { signOut(); nav('/login'); }}>Sign out</button>
          </div>
        </div>
      </header>
      <main id="main" className="container"><Outlet /></main>
      <footer className="foot">CampusResolve · Raise it. Route it. Resolve it.</footer>
    </div>
  );
}
