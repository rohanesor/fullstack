import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, Role, setSession, setUnauthorizedHandler, storedUser, User } from './api';

type Ctx = { user: User | null; signIn: (email: string, password: string) => Promise<User>; signOut: () => void };
const AuthCtx = createContext<Ctx>(null!);
export const useAuth = () => useContext(AuthCtx);
export const homeFor = (role: Role) => (role === 'ADMIN' ? '/admin' : role === 'STAFF' ? '/staff' : '/student');

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(storedUser);
  const signOut = useCallback(() => { void api.logout().catch(() => undefined); setSession(null, null); setUser(null); }, []);
  useEffect(() => { setUnauthorizedHandler(signOut); }, [signOut]);
  const signIn = async (email: string, password: string) => {
    const r = await api.login(email, password);
    setSession(null, r.user); setUser(r.user); return r.user;
  };
  return <AuthCtx.Provider value={{ user, signIn, signOut }}>{children}</AuthCtx.Provider>;
}

export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth(); const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}
