import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError, CategoryLookup, Complaint, Lookup, Priority, Role, Status } from '../api';
import { homeFor, useAuth } from '../auth';
import { Alert, Empty, Field, fmtDate, FLOW, PriorityBadge, Spinner, STATUS, StatusBadge } from '../ui';

type Act = { to: Status; label: string; kind: 'primary' | 'danger' | 'ghost'; prompt: string };
const ACTIONS: Record<Role, Partial<Record<Status, Act[]>>> = {
  STAFF: {
    ASSIGNED: [{ to: 'IN_PROGRESS', label: 'Start work', kind: 'primary', prompt: 'What are you doing first? (visible to the student)' }],
    IN_PROGRESS: [{ to: 'RESOLVED', label: 'Mark resolved', kind: 'primary', prompt: 'What was done to fix it? (visible to the student)' }],
  },
  ADMIN: {
    SUBMITTED: [{ to: 'REJECTED', label: 'Reject', kind: 'danger', prompt: 'Reason for rejecting (duplicate, invalid, out of scope…)' }],
    RESOLVED: [{ to: 'CLOSED', label: 'Close complaint', kind: 'primary', prompt: 'Closing note' }, { to: 'IN_PROGRESS', label: 'Reopen', kind: 'ghost', prompt: 'Why is it being reopened?' }],
    CLOSED: [{ to: 'IN_PROGRESS', label: 'Reopen', kind: 'ghost', prompt: 'Why is it being reopened?' }],
    REJECTED: [{ to: 'SUBMITTED', label: 'Restore', kind: 'ghost', prompt: 'Why is it being restored?' }],
  },
  STUDENT: { RESOLVED: [{ to: 'IN_PROGRESS', label: 'Not fixed — reopen', kind: 'ghost', prompt: 'What is still wrong?' }] },
};

function Stepper({ status }: { status: Status }) {
  if (status === 'REJECTED') return <Alert kind="warn">This complaint was rejected. See the timeline for the reason.</Alert>;
  const i = FLOW.indexOf(status);
  return (
    <ol className="stepper" aria-label="Progress">
      {FLOW.map((s, k) => <li key={s} className={k < i ? 'done' : k === i ? 'now' : ''} aria-current={k === i ? 'step' : undefined}><span>{k < i ? '✓' : k + 1}</span>{STATUS[s].label}</li>)}
    </ol>
  );
}

function Timeline({ c, role }: { c: Complaint; role: Role }) {
  const items = useMemo(() => [
    ...c.history.map((h) => ({ k: 'h' + h.id, at: h.changed_at, who: h.actor_name, node: <><b>{h.from_status ? `${STATUS[h.from_status].label} → ` : ''}{STATUS[h.to_status].label}</b>{h.remark && <p>{h.remark}</p>}</>, tone: STATUS[h.to_status].tone, internal: false })),
    ...c.comments.map((m) => ({ k: 'c' + m.id, at: m.created_at, who: m.author_name, node: <p>{m.body}</p>, tone: 'note', internal: m.visibility === 'INTERNAL' })),
  ].sort((a, b) => a.at.localeCompare(b.at)), [c]);
  return (
    <ol className="timeline" aria-label="Timeline">
      {items.map((x) => (
        <li key={x.k} className={`tl tl-${x.tone} ${x.internal ? 'tl-internal' : ''}`} data-internal={x.internal || undefined}>
          <div className="tl-head"><span>{x.who}</span>{x.internal && role !== 'STUDENT' && <span className="badge tone-grey">Internal</span>}<time dateTime={x.at}>{fmtDate(x.at)}</time></div>
          {x.node}
        </li>
      ))}
    </ol>
  );
}

function ActionBox({ act, onDo }: { act: Act; onDo: (remark: string) => Promise<void> }) {
  const [open, setOpen] = useState(false); const [remark, setRemark] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  if (!open) return <button className={`btn btn-${act.kind} btn-block`} onClick={() => setOpen(true)}>{act.label}</button>;
  async function go(e: FormEvent) {
    e.preventDefault(); if (remark.trim().length < 3) return setErr('Add a short remark (at least 3 characters).');
    setBusy(true); setErr('');
    try { await onDo(remark.trim()); } catch (x) { setErr((x as Error).message); setBusy(false); }
  }
  return (
    <form className="action-box" onSubmit={go}>
      <Field id={`r-${act.to}`} label={act.prompt} error={err}><textarea id={`r-${act.to}`} rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} autoFocus /></Field>
      <div className="actions"><button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button><button className={`btn btn-${act.kind === 'ghost' ? 'primary' : act.kind}`} disabled={busy}>{act.label}</button></div>
    </form>
  );
}

function AdminPanel({ c, onChange }: { c: Complaint; onChange: (c: Complaint) => void }) {
  const [cats, setCats] = useState<CategoryLookup[]>([]); const [depts, setDepts] = useState<Lookup[]>([]);
  const pred = c.predictions[c.predictions.length - 1];
  const [cat, setCat] = useState(c.final_category_id ?? (pred?.prediction_status === 'SUCCEEDED' ? pred.category_id ?? '' : ''));
  const [prio, setPrio] = useState<Priority>(c.priority);
  const [dept, setDept] = useState(c.assigned_department_id ?? '');
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { api.categories().then(setCats); api.departments().then(setDepts); }, []);
  useEffect(() => { if (!c.assigned_department_id && cat) { const d = cats.find((x) => x.id === cat)?.default_department_id; if (d) setDept(d); } }, [cat, cats, c.assigned_department_id]);
  const canAssign = !!c.final_category_id && ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS'].includes(c.status);
  const run = async (fn: () => Promise<Complaint>, ok: string) => {
    setBusy(true); setErr(''); setMsg('');
    try { onChange(await fn()); setMsg(ok); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="card" aria-labelledby="h-route">
      <h2 id="h-route">Review and route</h2>
      <div className="pred">
        <span className="muted small">Suggested category</span>
        {pred?.prediction_status === 'SUCCEEDED' ? (
          <p><b>{pred.category_name ?? 'Unknown'}</b>{pred.confidence != null && <> · {pred.confidence}% confidence</>}<br /><small className="muted">Model {pred.model_version} — a suggestion only, please confirm.</small></p>
        ) : <p data-testid="no-prediction">No suggestion {pred ? `(${pred.prediction_status.toLowerCase().replace('_', ' ')})` : ''} — choose the category manually.</p>}
      </div>
      {err && <Alert>{err}</Alert>}{msg && <Alert kind="success">{msg}</Alert>}
      <Field id="cat" label="Confirmed category">
        <select id="cat" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Select…</option>{cats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      </Field>
      <Field id="prio" label="Priority" hint="Urgency is always a human decision.">
        <select id="prio" value={prio} onChange={(e) => setPrio(e.target.value as Priority)}><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option></select>
      </Field>
      <button className="btn btn-primary btn-block" disabled={!cat || busy || ['CLOSED', 'REJECTED'].includes(c.status)} onClick={() => run(() => api.classify(c.id, cat, prio), 'Category confirmed.')}>Confirm category</button>
      <hr />
      <Field id="dept" label="Department" hint={!c.final_category_id ? 'Confirm the category first.' : undefined}>
        <select id="dept" value={dept} onChange={(e) => setDept(e.target.value)} disabled={!canAssign}><option value="">Select…</option>{depts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      </Field>
      <button className="btn btn-primary btn-block" disabled={!canAssign || !dept || busy} onClick={() => run(() => api.assign(c.id, dept), c.assigned_department_id ? 'Reassigned.' : 'Assigned to department.')}>
        {c.assigned_department_id ? 'Reassign' : 'Assign to department'}
      </button>
    </section>
  );
}

function CommentForm({ c, role, onChange }: { c: Complaint; role: Role; onChange: (c: Complaint) => void }) {
  const [body, setBody] = useState(''); const [vis, setVis] = useState<'STUDENT_VISIBLE' | 'INTERNAL'>('STUDENT_VISIBLE'); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  if (['CLOSED', 'REJECTED'].includes(c.status) && role === 'STUDENT') return null;
  async function send(e: FormEvent) {
    e.preventDefault(); if (!body.trim()) return;
    setBusy(true); setErr('');
    try { onChange(await api.comment(role, c.id, body.trim(), role === 'STUDENT' ? 'STUDENT_VISIBLE' : vis)); setBody(''); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  }
  return (
    <form className="comment-form" onSubmit={send}>
      {err && <Alert>{err}</Alert>}
      <Field id="comment" label={role === 'STUDENT' ? 'Add information' : 'Add a remark'}><textarea id="comment" rows={3} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <div className="actions">
        {role !== 'STUDENT' && (
          <fieldset className="seg"><legend className="sr-only">Visibility</legend>
            <label><input type="radio" name="vis" checked={vis === 'STUDENT_VISIBLE'} onChange={() => setVis('STUDENT_VISIBLE')} /> Visible to student</label>
            <label><input type="radio" name="vis" checked={vis === 'INTERNAL'} onChange={() => setVis('INTERNAL')} /> Internal only</label>
          </fieldset>
        )}
        <button className="btn btn-primary" disabled={busy || !body.trim()}>Post</button>
      </div>
    </form>
  );
}

export default function Detail() {
  const { id = '' } = useParams(); const { user } = useAuth();
  const [c, setC] = useState<Complaint | null>(null); const [err, setErr] = useState<ApiError | null>(null); const [flash, setFlash] = useState('');
  useEffect(() => { setC(null); api.complaint(id).then(setC).catch(setErr); }, [id]);
  if (!user) return null;
  const back = homeFor(user.role);
  if (err) return err.status === 404
    ? <Empty title="Complaint not found">It doesn't exist or you don't have access to it. <Link to={back}>Back to your list</Link></Empty>
    : <Alert>{err.message}</Alert>;
  if (!c) return <Spinner />;
  const acts = ACTIONS[user.role][c.status] ?? [];
  const update = (n: Complaint, note?: string) => { setC(n); if (note) setFlash(note); };
  return (
    <>
      <Link to={back} className="back">← Back</Link>
      <div className="page-head detail-head">
        <div>
          <span className="ref">{c.reference_code}</span>
          <h1>{c.title}</h1>
          <div className="badges"><StatusBadge status={c.status} /><PriorityBadge priority={c.priority} />{c.confidential && <span className="badge tone-grey">Confidential</span>}</div>
        </div>
      </div>
      <Stepper status={c.status} />
      {flash && <Alert kind="success">{flash}</Alert>}
      <div className="two-col">
        <div>
          <section className="card">
            <h2>Details</h2>
            <p className="desc">{c.description}</p>
            <dl className="facts">
              <div><dt>Location</dt><dd>{c.location ?? '—'}</dd></div>
              <div><dt>Category</dt><dd>{c.final_category_name ?? 'Awaiting review'}</dd></div>
              <div><dt>Department</dt><dd>{c.assigned_department_name ?? 'Not assigned yet'}</dd></div>
              <div><dt>Raised by</dt><dd>{user.role === 'STUDENT' ? 'You' : c.student_name}</dd></div>
              <div><dt>Submitted</dt><dd>{fmtDate(c.created_at)}</dd></div>
            </dl>
            <p className="muted small">{STATUS[c.status].help}</p>
          </section>
          <section className="card">
            <h2>Timeline</h2>
            <Timeline c={c} role={user.role} />
            <CommentForm c={c} role={user.role} onChange={(n) => update(n)} />
          </section>
        </div>
        <aside className="side">
          {user.role === 'ADMIN' && <AdminPanel c={c} onChange={(n) => update(n)} />}
          {acts.length > 0 && (
            <section className="card" aria-labelledby="h-act">
              <h2 id="h-act">{user.role === 'STUDENT' ? 'Not fixed?' : 'Update status'}</h2>
              <div className="stack">{acts.map((a) => <ActionBox key={a.to + a.label} act={a} onDo={async (r) => update(await api.transition(user.role, c.id, a.to, r), `Status changed to ${STATUS[a.to].label}.`)} />)}</div>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
