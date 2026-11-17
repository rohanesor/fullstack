// Typed client for the CampusResolve API (/api/v1). The backend enforces every permission; the UI only hides what a role can't do.
export type Role = 'STUDENT' | 'ADMIN' | 'STAFF';
export type Status = 'SUBMITTED' | 'ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED' | 'REJECTED';
export type Priority = 'NORMAL' | 'HIGH' | 'URGENT';
export type User = { id: string; institutional_id: string; name: string; email: string; role: Role; department_id: string | null };
export type Lookup = { id: string; code: string; name: string };
export type CategoryLookup = Lookup & { description: string; default_department_id: string | null };
export type Prediction = { id: string; category_id: string | null; category_name: string | null; confidence: number | null; model_version: string; prediction_status: string; created_at: string };
export type History = { id: string; from_status: Status | null; to_status: Status; remark: string | null; actor_name: string; changed_at: string };
export type Comment = { id: string; author_name: string; body: string; visibility: 'STUDENT_VISIBLE' | 'INTERNAL'; created_at: string };
export type Complaint = {
  id: string; reference_code: string; student_id: string; student_name: string; title: string; description: string; location: string | null;
  final_category_id: string | null; final_category_name: string | null; assigned_department_id: string | null; assigned_department_name: string | null;
  priority: Priority; confidential: boolean; status: Status; version: number; created_at: string; updated_at: string;
  predictions: Prediction[]; history: History[]; comments: Comment[];
};
export type Summary = { total: number; by_status: Record<string, number>; by_category: Record<string, number> };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const KEY = 'cr.session';
// The access token stays in an HttpOnly cookie. sessionStorage retains display-only user data.
let token: string | null = null;
export function storedUser(): User | null {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null')?.user ?? null; } catch { return null; }
}
export function setSession(_token: string | null, user: User | null) {
  token = null;
  try { user ? sessionStorage.setItem(KEY, JSON.stringify({ user })) : sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ }
}

function csrfToken(): string | undefined {
  return document.cookie.split('; ').find((x) => x.startsWith('cr_csrf='))?.split('=').slice(1).join('=');
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(csrfToken() ? { 'X-CSRF-Token': csrfToken()! } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 401) onUnauthorized();
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const d = data?.detail;
    const msg = typeof d === 'string' ? d : Array.isArray(d) ? d.map((x: { msg?: string; loc?: string[] }) => `${x.loc?.slice(-1)[0] ?? ''}: ${x.msg}`).join('; ') : `Request failed (${res.status})`;
    throw new ApiError(res.status, msg);
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) => req<{ access_token: string; user: User }>('POST', '/auth/login', { email, password }),
  logout: () => req<void>('POST', '/auth/logout'),
  me: () => req<User>('GET', '/me'),
  categories: () => req<CategoryLookup[]>('GET', '/lookups/categories'),
  departments: () => req<Lookup[]>('GET', '/lookups/departments'),
  // student
  createComplaint: (b: { title: string; description: string; location?: string; confidential: boolean }) => req<Complaint>('POST', '/complaints', b),
  myComplaints: () => req<Complaint[]>('GET', '/complaints'),
  complaint: (id: string) => req<Complaint>('GET', `/complaints/${encodeURIComponent(id)}`),
  reopen: (id: string, remark: string) => req<Complaint>('POST', `/complaints/${id}/reopen`, { to_status: 'IN_PROGRESS', remark }),
  // admin
  adminQueue: (f: { status?: string; category?: string; department?: string; q?: string }) => {
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
    return req<Complaint[]>('GET', `/admin/complaints${p.toString() ? `?${p}` : ''}`);
  },
  classify: (id: string, category_id: string, priority: Priority) => req<Complaint>('PUT', `/admin/complaints/${id}/classification`, { category_id, priority }),
  assign: (id: string, department_id: string, remark?: string) => req<Complaint>('POST', `/admin/complaints/${id}/assignments`, { department_id, remark }),
  summary: () => req<Summary>('GET', '/admin/reports/summary'),
  // staff
  staffQueue: () => req<Complaint[]>('GET', '/staff/complaints'),
  // shared by role prefix
  transition: (role: Role, id: string, to_status: Status, remark: string) =>
    role === 'STUDENT' ? api.reopen(id, remark) : req<Complaint>('POST', `/${role === 'ADMIN' ? 'admin' : 'staff'}/complaints/${id}/transitions`, { to_status, remark }),
  comment: (role: Role, id: string, body: string, visibility: 'STUDENT_VISIBLE' | 'INTERNAL') =>
    req<Complaint>('POST', role === 'STUDENT' ? `/complaints/${id}/comments` : `/${role === 'ADMIN' ? 'admin' : 'staff'}/complaints/${id}/comments`, { body, visibility }),
};
