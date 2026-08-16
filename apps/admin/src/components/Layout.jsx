import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '@shared';
import { useAuth } from '../context/auth-context';
import { api } from '../lib/api';
import { useToast } from './toast-context';

/** `roles` gates a link — a STAFF account simply never sees Settings or Staff. */
const NAV = [
  { to: '/',          label: 'Dashboard',   icon: '◱', end: true },
  { to: '/live',      label: 'Live orders', icon: '◷', badgeKey: 'liveOrders' },
  { to: '/orders',    label: 'Orders',      icon: '☰' },
  { to: '/analytics', label: 'Analytics',   icon: '◪', roles: ['PLATFORM_ADMIN', 'OWNER', 'MANAGER'] },
  { to: '/menu',      label: 'Menu',        icon: '❑', roles: ['PLATFORM_ADMIN', 'OWNER', 'MANAGER'] },
  { to: '/tables',    label: 'Tables',      icon: '⊞', roles: ['PLATFORM_ADMIN', 'OWNER', 'MANAGER'] },
  { to: '/coupons',   label: 'Coupons',     icon: '％', roles: ['PLATFORM_ADMIN', 'OWNER', 'MANAGER'] },
  { to: '/staff',     label: 'Staff',       icon: '⚇', roles: ['PLATFORM_ADMIN', 'OWNER'] },
  { to: '/settings',  label: 'Settings',    icon: '⚙', roles: ['PLATFORM_ADMIN', 'OWNER'] },
];

export default function Layout({ children, liveCount = 0 }) {
  const { user, logout, isPlatformAdmin, selectRestaurant } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [restaurant, setRestaurant] = useState(user?.restaurant ?? null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    api.settings()
      .then(({ restaurant: r }) => setRestaurant(r))
      .catch(() => { /* the page's own error state covers this */ });
  }, []);

  async function handleToggleOrders() {
    setToggling(true);
    try {
      const { isAcceptingOrders } = await api.toggleOrders();
      setRestaurant((r) => ({ ...r, isAcceptingOrders }));
      toast.success(isAcceptingOrders ? 'Now accepting orders' : 'Orders paused — customers will see your closed message');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setToggling(false);
    }
  }

  const visibleNav = NAV.filter((item) => !item.roles || item.roles.includes(user.role));
  const badges = { liveOrders: liveCount };

  return (
    <div className="layout">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-mark">◆</span>
          <div>
            <strong>Restrovia</strong>
            <span>Admin</span>
          </div>
        </div>

        <div className="sidebar-restaurant">
          <span className="restaurant-emoji">{restaurant?.logoEmoji || '🍽️'}</span>
          <div className="restaurant-meta">
            <strong title={restaurant?.name}>{restaurant?.name || '—'}</strong>
            <span>/{restaurant?.slug}</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <span className="nav-icon" aria-hidden>{item.icon}</span>
              {item.label}
              {item.badgeKey && badges[item.badgeKey] > 0 && (
                <span className="nav-badge">{badges[item.badgeKey]}</span>
              )}
            </NavLink>
          ))}

          {isPlatformAdmin && (
            <>
              <div className="nav-divider">Platform</div>
              <NavLink to="/platform" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}>
                <span className="nav-icon" aria-hidden>◈</span>
                All restaurants
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          {restaurant && (
            <button
              className={`orders-toggle ${restaurant.isAcceptingOrders ? 'on' : 'off'}`}
              onClick={handleToggleOrders}
              disabled={toggling}
            >
              <span className="toggle-dot" />
              {restaurant.isAcceptingOrders ? 'Accepting orders' : 'Orders paused'}
            </button>
          )}

          <div className="sidebar-user">
            <div className="user-avatar">{user.name.charAt(0).toUpperCase()}</div>
            <div className="user-meta">
              <strong>{user.name}</strong>
              <span>{ROLE_LABELS[user.role]}</span>
            </div>
          </div>

          <div className="sidebar-actions">
            {isPlatformAdmin && (
              <button className="btn btn-ghost btn-sm" onClick={() => { selectRestaurant(null); navigate('/platform'); }}>
                Switch
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
          </div>
        </div>
      </aside>

      {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}

      <div className="main-col">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle navigation">☰</button>
          <span className="topbar-restaurant">{restaurant?.logoEmoji} {restaurant?.name}</span>
          {restaurant && !restaurant.isAcceptingOrders && (
            <span className="topbar-warning">Orders paused</span>
          )}
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
