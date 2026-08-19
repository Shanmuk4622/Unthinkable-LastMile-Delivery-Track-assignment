/**
 * Routing.
 *
 * Three role-scoped trees behind `<RequireRole>`, plus a public tree for the
 * landing page, auth screens and tracking. Every authenticated page is lazily
 * loaded, so a customer never downloads the admin console.
 */
import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { homeFor, useAuth } from '@/context/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingBlock } from '@/components/ui';
import type { Role } from '@/lib/types';

// ---- public -------------------------------------------------------------
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import TrackPublic from '@/pages/TrackPublic';
import NotFound from '@/pages/NotFound';

// ---- customer -----------------------------------------------------------
const CustomerDashboard = lazy(() => import('@/pages/customer/Dashboard'));
const CustomerOrders = lazy(() => import('@/pages/customer/Orders'));
const NewOrder = lazy(() => import('@/pages/customer/NewOrder'));
const OrderDetail = lazy(() => import('@/pages/OrderDetail'));
const NotificationsPage = lazy(() => import('@/pages/Notifications'));

// ---- agent --------------------------------------------------------------
const AgentDashboard = lazy(() => import('@/pages/agent/Dashboard'));
const AgentDeliveries = lazy(() => import('@/pages/agent/Deliveries'));

// ---- admin --------------------------------------------------------------
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'));
const AdminOrders = lazy(() => import('@/pages/admin/Orders'));
const AdminZones = lazy(() => import('@/pages/admin/Zones'));
const AdminPricing = lazy(() => import('@/pages/admin/Pricing'));
const AdminAgents = lazy(() => import('@/pages/admin/Agents'));
const AdminUsers = lazy(() => import('@/pages/admin/Users'));
const AdminAnalytics = lazy(() => import('@/pages/admin/Analytics'));

function Loading() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <LoadingBlock />
    </div>
  );
}

/** Gate a subtree behind authentication and (optionally) a set of roles. */
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loading />;

  if (!user) {
    // Remember where they were headed so login can bounce them straight back.
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;

  return (
    <AppShell>
      <Suspense fallback={<Loading />}>{children}</Suspense>
    </AppShell>
  );
}

/** Signed-in users have no business on the landing or auth screens. */
function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      {/* ---------------- public ---------------- */}
      <Route
        path="/"
        element={
          <PublicOnly>
            <Landing />
          </PublicOnly>
        }
      />
      <Route
        path="/login"
        element={
          <PublicOnly>
            <Login />
          </PublicOnly>
        }
      />
      <Route
        path="/register"
        element={
          <PublicOnly>
            <Register />
          </PublicOnly>
        }
      />
      <Route path="/track" element={<TrackPublic />} />
      <Route path="/track/:code" element={<TrackPublic />} />

      {/* ---------------- customer ---------------- */}
      <Route
        path="/app"
        element={
          <RequireRole roles={['CUSTOMER']}>
            <CustomerDashboard />
          </RequireRole>
        }
      />
      <Route
        path="/app/new"
        element={
          <RequireRole roles={['CUSTOMER']}>
            <NewOrder />
          </RequireRole>
        }
      />
      <Route
        path="/app/orders"
        element={
          <RequireRole roles={['CUSTOMER']}>
            <CustomerOrders />
          </RequireRole>
        }
      />
      <Route
        path="/app/orders/:id"
        element={
          <RequireRole roles={['CUSTOMER']}>
            <OrderDetail />
          </RequireRole>
        }
      />
      <Route
        path="/app/notifications"
        element={
          <RequireRole roles={['CUSTOMER']}>
            <NotificationsPage />
          </RequireRole>
        }
      />

      {/* ---------------- agent ---------------- */}
      <Route
        path="/agent"
        element={
          <RequireRole roles={['AGENT']}>
            <AgentDashboard />
          </RequireRole>
        }
      />
      <Route
        path="/agent/deliveries"
        element={
          <RequireRole roles={['AGENT']}>
            <AgentDeliveries />
          </RequireRole>
        }
      />
      <Route
        path="/agent/orders/:id"
        element={
          <RequireRole roles={['AGENT']}>
            <OrderDetail />
          </RequireRole>
        }
      />

      {/* ---------------- admin ---------------- */}
      <Route
        path="/admin"
        element={
          <RequireRole roles={['ADMIN']}>
            <AdminDashboard />
          </RequireRole>
        }
      />
      <Route
        path="/admin/orders"
        element={
          <RequireRole roles={['ADMIN']}>
            <AdminOrders />
          </RequireRole>
        }
      />
      <Route
        path="/admin/orders/:id"
        element={
          <RequireRole roles={['ADMIN']}>
            <OrderDetail />
          </RequireRole>
        }
      />
      <Route
        path="/admin/new"
        element={
          <RequireRole roles={['ADMIN']}>
            <NewOrder />
          </RequireRole>
        }
      />
      <Route
        path="/admin/zones"
        element={
          <RequireRole roles={['ADMIN']}>
            <AdminZones />
          </RequireRole>
        }
      />
      <Route
        path="/admin/pricing"
        element={
          <RequireRole roles={['ADMIN']}>
            <AdminPricing />
          </RequireRole>
        }
      />
      <Route
        path="/admin/agents"
        element={
          <RequireRole roles={['ADMIN']}>
            <AdminAgents />
          </RequireRole>
        }
      />
      <Route
        path="/admin/users"
        element={
          <RequireRole roles={['ADMIN']}>
            <AdminUsers />
          </RequireRole>
        }
      />
      <Route
        path="/admin/notifications"
        element={
          <RequireRole roles={['ADMIN']}>
            <NotificationsPage />
          </RequireRole>
        }
      />
      <Route
        path="/admin/analytics"
        element={
          <RequireRole roles={['ADMIN']}>
            <AdminAnalytics />
          </RequireRole>
        }
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
