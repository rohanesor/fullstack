import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, homeFor, RequireRole, useAuth } from './auth';
import Layout from './Layout';
import Detail from './pages/Detail';
import Login from './pages/Login';
import { AdminQueue, StaffQueue } from './pages/Queues';
import { NewComplaint, StudentHome } from './pages/Student';
import { Empty } from './ui';
import './styles.css';

function Home() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />;
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Home />} />
          <Route element={<RequireRole roles={['STUDENT', 'ADMIN', 'STAFF']}><Layout /></RequireRole>}>
            <Route path="/student" element={<RequireRole roles={['STUDENT']}><StudentHome /></RequireRole>} />
            <Route path="/student/new" element={<RequireRole roles={['STUDENT']}><NewComplaint /></RequireRole>} />
            <Route path="/admin" element={<RequireRole roles={['ADMIN']}><AdminQueue /></RequireRole>} />
            <Route path="/staff" element={<RequireRole roles={['STAFF']}><StaffQueue /></RequireRole>} />
            <Route path="/complaints/:id" element={<Detail />} />
            <Route path="*" element={<Empty title="Page not found">Use the menu above to continue.</Empty>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
