import { ReactNode } from 'react';
import type { Priority, Status } from './api';

export const STATUS: Record<Status, { label: string; icon: string; tone: string; help: string }> = {
  SUBMITTED: { label: 'Submitted', icon: '●', tone: 'blue', help: 'Waiting for an administrator to review and route it.' },
  ASSIGNED: { label: 'Assigned', icon: '➜', tone: 'violet', help: 'Sent to the responsible department.' },
  IN_PROGRESS: { label: 'In progress', icon: '◐', tone: 'amber', help: 'The department is working on it.' },
  RESOLVED: { label: 'Resolved', icon: '✓', tone: 'green', help: 'Action taken. You can reopen it if the problem continues.' },
  CLOSED: { label: 'Closed', icon: '■', tone: 'grey', help: 'Confirmed complete by an administrator.' },
  REJECTED: { label: 'Rejected', icon: '✕', tone: 'red', help: 'Not accepted. See the remark for the reason.' },
};
export const FLOW: Status[] = ['SUBMITTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS[status];
  return <span className={`badge tone-${s.tone}`} data-status={status}><span aria-hidden>{s.icon}</span>{s.label}</span>;
}
export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === 'NORMAL') return null;
  return <span className={`badge ${priority === 'URGENT' ? 'tone-red' : 'tone-amber'}`}><span aria-hidden>▲</span>{priority === 'URGENT' ? 'Urgent' : 'High'}</span>;
}

// SQLite returns UTC timestamps without an offset; treat those as UTC so local times are right.
export const parseTime = (iso: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
export const fmtDate = (iso: string) => parseTime(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export function ago(iso: string) {
  const m = Math.round((Date.now() - parseTime(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); return `${d} day${d > 1 ? 's' : ''} ago`;
}
export const ageDays = (iso: string) => Math.floor((Date.now() - parseTime(iso).getTime()) / 86400000);

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info' | 'warn'; children: ReactNode }) {
  return <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}
export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <div className="spinner-wrap" role="status"><span className="spinner" aria-hidden /> {label}…</div>;
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><div className="empty-icon" aria-hidden>◎</div><h3>{title}</h3>{children}</div>;
}
export function Field({ label, hint, error, children, id }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; id: string }) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <p className="field-error" id={`${id}-err`}>{error}</p> : hint ? <p className="field-hint" id={`${id}-hint`}>{hint}</p> : null}
    </div>
  );
}
