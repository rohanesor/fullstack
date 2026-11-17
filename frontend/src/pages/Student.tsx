import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, Complaint } from '../api';
import { useAuth } from '../auth';
import { ago, Alert, Empty, Field, PriorityBadge, Spinner, StatusBadge } from '../ui';

const ACTIVE = new Set(['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED']);

export function ComplaintRow({ c, to, extra }: { c: Complaint; to: string; extra?: ReactNode }) {
  return (
    <li>
      <Link to={to} className="row" data-ref={c.reference_code}>
        <div className="row-main">
          <span className="ref">{c.reference_code}</span>
          <span className="row-title">{c.title}</span>
          <span className="row-meta">{c.final_category_name ?? 'Awaiting review'}{c.assigned_department_name ? ` · ${c.assigned_department_name}` : ''} · updated {ago(c.updated_at)}</span>
        </div>
        <div className="row-side">{extra}<PriorityBadge priority={c.priority} />{c.confidential && <span className="badge tone-grey">Confidential</span>}<StatusBadge status={c.status} /></div>
      </Link>
    </li>
  );
}

export function StudentHome() {
  const { user } = useAuth(); const loc = useLocation();
  const [items, setItems] = useState<Complaint[] | null>(null); const [err, setErr] = useState('');
  const created = (loc.state as { created?: string } | null)?.created;
  useEffect(() => { api.myComplaints().then(setItems).catch((e) => setErr(e.message)); }, []);
  const [active, past] = useMemo(() => [items?.filter((c) => ACTIVE.has(c.status)) ?? [], items?.filter((c) => !ACTIVE.has(c.status)) ?? []], [items]);
  return (
    <>
      <div className="page-head">
        <div><h1>Hello, {user?.name.split(' ')[0]}</h1><p className="muted">Track every complaint you've raised.</p></div>
        <Link to="/student/new" className="btn btn-primary">+ New complaint</Link>
      </div>
      {created && <Alert kind="success">Complaint submitted. Your reference is <b data-testid="created-ref">{created}</b>.</Alert>}
      {err && <Alert>{err}</Alert>}
      {!items && !err && <Spinner />}
      {items && (
        <div className="stats">
          <div className="stat"><b>{active.length}</b><span>Open</span></div>
          <div className="stat"><b>{items.filter((c) => c.status === 'RESOLVED').length}</b><span>Awaiting your confirmation</span></div>
          <div className="stat"><b>{past.length}</b><span>Closed or rejected</span></div>
        </div>
      )}
      {items && items.length === 0 && <Empty title="No complaints yet">Something not working on campus? <Link to="/student/new">Raise a complaint</Link>.</Empty>}
      {active.length > 0 && <section aria-labelledby="h-open"><h2 id="h-open" className="section-title">Open</h2><ul className="list">{active.map((c) => <ComplaintRow key={c.id} c={c} to={`/complaints/${c.id}`} />)}</ul></section>}
      {past.length > 0 && <section aria-labelledby="h-past"><h2 id="h-past" className="section-title">Past</h2><ul className="list">{past.map((c) => <ComplaintRow key={c.id} c={c} to={`/complaints/${c.id}`} />)}</ul></section>}
    </>
  );
}

const LIMITS = { title: [4, 160], description: [15, 10000], location: [0, 160] } as const;

export function NewComplaint() {
  const nav = useNavigate();
  const [f, setF] = useState({ title: '', description: '', location: '', confidential: false });
  const [errors, setErrors] = useState<Record<string, string>>({}); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string; checked?: boolean; type?: string } }) =>
    setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  function validate() {
    const e: Record<string, string> = {};
    if (f.title.trim().length < LIMITS.title[0]) e.title = 'Give a short title (at least 4 characters).';
    if (f.description.trim().length < LIMITS.description[0]) e.description = 'Describe the problem in at least 15 characters: what, where and since when.';
    setErrors(e); return Object.keys(e).length === 0;
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr('');
    if (!validate()) return;
    setBusy(true);
    try {
      const c = await api.createComplaint({ title: f.title.trim(), description: f.description.trim(), location: f.location.trim() || undefined, confidential: f.confidential });
      nav('/student', { state: { created: c.reference_code } });
    } catch (x) { setErr((x as Error).message); setBusy(false); }
  }
  return (
    <>
      <div className="page-head"><div><h1>New complaint</h1><p className="muted">An administrator reviews every complaint and sends it to the right department.</p></div></div>
      <div className="two-col">
        <form className="card" onSubmit={submit} noValidate>
          {err && <Alert>{err}</Alert>}
          <Field id="title" label="Title" error={errors.title} hint={`${f.title.length}/160`}>
            <input id="title" value={f.title} maxLength={160} onChange={set('title')} placeholder="e.g. Projector not working in B204" aria-invalid={!!errors.title} />
          </Field>
          <Field id="description" label="What happened?" error={errors.description} hint={`${f.description.length}/10000 · include where, when and who is affected`}>
            <textarea id="description" rows={7} value={f.description} maxLength={10000} onChange={set('description')} aria-invalid={!!errors.description} />
          </Field>
          <Field id="location" label="Location (optional)" hint="Block, room, hostel or bus route">
            <input id="location" value={f.location} maxLength={160} onChange={set('location')} />
          </Field>
          <label className="check"><input type="checkbox" checked={f.confidential} onChange={set('confidential')} />
            <span><b>Keep this confidential</b><br /><small className="muted">Only administrators will see it — use for harassment, health, safety or discipline matters.</small></span></label>
          <div className="actions"><Link to="/student" className="btn btn-ghost">Cancel</Link><button className="btn btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit complaint'}</button></div>
        </form>
        <aside className="card card-warn" aria-label="Urgent help">
          <h2>Is someone in danger?</h2>
          <p>Don't wait for a complaint to be routed. Contact campus security or emergency services right away.</p>
          <ul className="plain">
            <li><b>Emergency:</b> 112</li>
            <li><b>Campus security:</b> use the number on your ID card</li>
          </ul>
          <p className="small muted">You'll get a reference number as soon as you submit. Categorisation suggestions are reviewed by staff — you never need to pick a department.</p>
        </aside>
      </div>
    </>
  );
}
