import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/auth-context';
import { api } from './lib/api';
import { usePolling } from './lib/hooks';
import Layout from './components/Layout';
import { Spinner } from './components/States';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import LiveOrders from './pages/LiveOrders';
import Orders from './pages/Orders';
import Analytics from './pages/Analytics';
import MenuManager from './pages/MenuManager';
import Tables from './pages/Tables';
import Coupons from './pages/Coupons';
import Staff from './pages/Staff';
import Settings from './pages/Settings';
import PlatformRestaurants from './pages/platform/PlatformRestaurants';

export default function App() {
  const { status, restaurantId, isPlatformAdmin } = useAuth();
  const location = useLocation();

  if (status === 'checking') return <div className="boot"><Spinner label="Signing you in…" /></div>;
  if (status === 'anonymous') return <Login />;

  // A platform admin has no restaurant of their own — they pick one first.
  const needsRestaurant = isPlatformAdmin && !restaurantId;
  if (needsRestaurant && location.pathname !== '/platform') {
    return <Navigate to="/platform" replace />;
  }
  if (needsRestaurant) return <PlatformShell />;

  return <AdminShell key={restaurantId} isPlatformAdmin={isPlatformAdmin} />;
}

/** The platform screen renders without the tenant sidebar, since none is selected. */
function PlatformShell() {
  return (
    <div className="platform-shell">
      <PlatformRestaurants standalone />
    </div>
  );
}

function AdminShell({ isPlatformAdmin }) {
  const [lastSeenIds, setLastSeenIds] = useState(null);

  // The live count is lifted here so the sidebar badge stays accurate on every page.
  const { data } = usePolling((signal) => api.liveOrders(signal), 15000);
  const liveOrders = data?.orders ?? [];

  useEffect(() => {
    if (!data) return;
    setLastSeenIds(new Set(liveOrders.map((o) => o.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return (
    <Layout liveCount={liveOrders.filter((o) => o.status === 'PLACED').length}>
      <Routes>
        <Route path="/"          element={<Dashboard />} />
        <Route path="/live"      element={<LiveOrders knownIds={lastSeenIds} />} />
        <Route path="/orders"    element={<Orders />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/menu"      element={<MenuManager />} />
        <Route path="/tables"    element={<Tables />} />
        <Route path="/coupons"   element={<Coupons />} />
        <Route path="/staff"     element={<Staff />} />
        <Route path="/settings"  element={<Settings />} />
        {isPlatformAdmin && <Route path="/platform" element={<PlatformRestaurants />} />}
        <Route path="*"          element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
