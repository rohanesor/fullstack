import { useEffect, useState } from 'react';
import { api, Complaint, Lookup, Status, Summary } from '../api';
import { useAuth } from '../auth';
import { ageDays, Alert, Empty, Spinner, STATUS } from '../ui';
import { ComplaintRow } from './Student';

function Aging({ c }: { c: Complaint }) {
  const d = ageDays(c.created_at); if (d < 3 || c.status === 'CLOSED' || c.status === 'REJECTED' || c.status === 'RESOLVED') return null;
  return <span className={`aging ${d >= 7 ? 'old' : ''}`}>{d} days open</span>;
}

export function AdminQueue() {
  const [f, setF] = useState({ status: 'SUBMITTED', category: '', department: '', q: '' });
  const [items, setItems] = useState<Complaint[] | null>(null); const [err, setErr] = useState('');
  const [cats, setCats] = useState<Lookup[]>([]); const [depts, setDepts] = useState<Lookup[]>([]); const [sum, setSum] = useState<Summary | null>(null);
  useEffect(() => { api.categories().then(setCats); api.departments().then(setDepts); api.summary().then(setSum).catch(() => {}); }, []);
  useEffect(() => {
    setItems(null); const t = setTimeout(() => api.adminQueue(f).then(setItems).catch((e) => setErr(e.message)), f.q ? 250 : 0);
    return () => clearTimeout(t);
  }, [f]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <>
      <div className="page-head"><div><h1>Work queue</h1><p className="muted">Review, confirm the category, and route each complaint.</p></div></div>
      {sum && (
        <div className="stats" aria-label="Summary">
          {(['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED'] as Status[]).map((s) => (
            <button key={s} className={`stat stat-btn ${f.status === s ? 'on' : ''}`} onClick={() => setF({ ...f, status: s })}>
              <b>{sum.by_status[s] ?? 0}</b><span>{STATUS[s].label}</span>
            </button>
          ))}
          <div className="stat"><b>{sum.total}</b><span>All time</span></div>
        </div>
      )}
      <div className="filters" role="search">
        <label>Status<select value={f.status} onChange={set('status')}><option value="">All</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        <label>Category<select value={f.category} onChange={set('category')}><option value="">All</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Department<select value={f.department} onChange={set('department')}><option value="">All</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label className="grow">Search<input type="search" placeholder="Reference or title" value={f.q} onChange={set('q')} /></label>
      </div>
      {err && <Alert>{err}</Alert>}
      {!items && !err && <Spinner />}
      {items && items.length === 0 && <Empty title="Nothing here">No complaints match these filters.</Empty>}
      {items && items.length > 0 && <ul className="list">{items.map((c) => <ComplaintRow key={c.id} c={c} to={`/complaints/${c.id}`} extra={<Aging c={c} />} />)}</ul>}
    </>
  );
}

export function StaffQueue() {
  const { user } = useAuth();
  const [items, setItems] = useState<Complaint[] | null>(null); const [err, setErr] = useState(''); const [tab, setTab] = useState<'todo' | 'done'>('todo');
  useEffect(() => { api.staffQueue().then(setItems).catch((e) => setErr(e.message)); }, []);
  const shown = items?.filter((c) => (tab === 'todo' ? ['ASSIGNED', 'IN_PROGRESS'] : ['RESOLVED', 'CLOSED']).includes(c.status)) ?? [];
  return (
    <>
      <div className="page-head"><div><h1>Assigned to your department</h1><p className="muted">Start work, keep students updated, and mark complaints resolved.</p></div></div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'todo'} className={tab === 'todo' ? 'on' : ''} onClick={() => setTab('todo')}>To do ({items?.filter((c) => ['ASSIGNED', 'IN_PROGRESS'].includes(c.status)).length ?? 0})</button>
        <button role="tab" aria-selected={tab === 'done'} className={tab === 'done' ? 'on' : ''} onClick={() => setTab('done')}>Done</button>
      </div>
      {err && <Alert>{err}</Alert>}
      {!items && !err && <Spinner />}
      {items && shown.length === 0 && <Empty title={tab === 'todo' ? 'All caught up' : 'Nothing finished yet'}>{!user?.department_id && 'Your account is not linked to a department yet.'}</Empty>}
      {shown.length > 0 && <ul className="list">{shown.map((c) => <ComplaintRow key={c.id} c={c} to={`/complaints/${c.id}`} extra={<Aging c={c} />} />)}</ul>}
    </>
  );
}
