import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Cards from './pages/Cards';
import Expenses from './pages/Expenses';
import Internet from './pages/Internet';
import InternetFtthCustomer from './pages/InternetFtthCustomer';
import Office from './pages/Office';
import Partners from './pages/Partners';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import ForceChangePassword from './pages/ForceChangePassword';
import { AppProvider, useAppContext } from './context/AppContext';
import { canAccessSection } from './utils/permissions';

function requiresPasswordChange(user: { requires_password_change?: boolean; requiresPasswordChange?: boolean } | null): boolean {
  return !!(user?.requires_password_change ?? user?.requiresPasswordChange);
}

function ProtectedRoute({ children, section }: { children: React.ReactNode; section?: string }) {
  const { currentUser } = useAppContext();
  const location = useLocation();

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiresPasswordChange(currentUser)) {
    return <Navigate to="/force-change-password" replace />;
  }

  if (section && !canAccessSection(currentUser, section)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function ForceChangePasswordRoute({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAppContext();

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  if (!requiresPasswordChange(currentUser)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/force-change-password" element={<ForceChangePasswordRoute><ForceChangePassword /></ForceChangePasswordRoute>} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<ProtectedRoute section="dashboard"><Dashboard /></ProtectedRoute>} />
        <Route path="cards" element={<ProtectedRoute section="cards"><Cards /></ProtectedRoute>} />
        <Route path="expenses" element={<ProtectedRoute section="expenses"><Expenses /></ProtectedRoute>} />
        <Route path="internet" element={<ProtectedRoute section="internet"><Internet /></ProtectedRoute>} />
        <Route
          path="internet/ftth-customer/:externalId"
          element={
            <ProtectedRoute section="internet">
              <InternetFtthCustomer />
            </ProtectedRoute>
          }
        />
        <Route path="office" element={<ProtectedRoute section="office"><Office /></ProtectedRoute>} />
        <Route path="partners" element={<ProtectedRoute section="partners"><Partners /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute section="reports"><Reports /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute section="settings"><Settings /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}
