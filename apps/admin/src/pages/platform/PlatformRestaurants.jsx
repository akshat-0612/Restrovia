import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatCurrency, formatNumber } from '@shared';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../components/toast-context';
import RestaurantMark from '../../components/RestaurantMark';
import Modal from '../../components/Modal';
import StatCard from '../../components/StatCard';
import { Card, ErrorState, Spinner } from '../../components/States';
import { RankedBars } from '../../components/Charts';

/**
 * The vendor's own view: every restaurant sold, platform-wide totals, and the
 * onboarding form that turns a sale into a working tenant.
 */
export default function PlatformRestaurants({ standalone = false }) {
  const { selectRestaurant, logout, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const stats = useApi((signal) => api.platformStats(signal), []);
  const list = useApi((signal) => api.platformRestaurants(signal), []);
  const [creating, setCreating] = useState(false);
  const [domainsFor, setDomainsFor] = useState(null);

  if (stats.loading || list.loading) return <Spinner label="Loading the platform…" />;
  if (stats.error) return <ErrorState message={stats.error} onRetry={stats.reload} />;

  function open(restaurant) {
    selectRestaurant(restaurant.id);
    navigate('/');
  }

  async function toggleActive(restaurant) {
    try {
      await api.updateRestaurant(restaurant.id, { isActive: !restaurant.isActive });
      toast.success(restaurant.isActive ? `${restaurant.name} suspended` : `${restaurant.name} reactivated`);
      list.reload();
    } catch (err) { toast.error(err.message); }
  }

  const s = stats.data;

  return (
    <div className={standalone ? 'platform-page' : ''}>
      <header className="page-head">
        <div>
          <h1>All restaurants</h1>
          <p className="page-sub">
            {s.activeRestaurants} of {s.restaurants} active · one database, fully isolated tenants
          </p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setCreating(true)}>+ Onboard restaurant</button>
          {standalone && <button className="btn btn-ghost" onClick={logout}>Sign out</button>}
        </div>
      </header>

      <div className="stat-grid">
        <StatCard label="Revenue today" value={s.today.revenue} symbol="₹" asCurrency compact
          sub={`${s.today.orders} orders across all clients`} icon="💰" tone="brand" />
        <StatCard label="Revenue this month" value={s.thisMonth.revenue} symbol="₹" asCurrency compact
          sub={`${formatNumber(s.thisMonth.orders)} orders`} icon="📈" />
        <StatCard label="Lifetime processed" value={s.allTime.revenue} symbol="₹" asCurrency compact
          sub={`${formatNumber(s.allTime.orders)} orders all-time`} icon="🏦" />
        <StatCard label="Live restaurants" value={s.activeRestaurants}
          sub={`${s.restaurants - s.activeRestaurants} suspended`} icon="🏪" />
      </div>

      <div className="grid-2">
        <Card title="This month's leaderboard" subtitle="Revenue by client">
          <RankedBars rows={s.leaderboard} labelKey="name" valueKey="revenue" symbol="₹"
            subLabel={(r) => `${formatNumber(r.orders)} orders`} />
        </Card>

        <Card title="Signed in as" subtitle="Platform administrator">
          <div className="platform-identity">
            <div className="user-avatar lg">{user.name.charAt(0)}</div>
            <div>
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
          </div>
          <p className="field-hint" style={{ marginTop: '1rem' }}>
            Opening a restaurant below switches this portal into that client&apos;s account.
            Every request you make is then scoped to their data only.
          </p>
        </Card>
      </div>

      <Card title="Restaurants" bodyClass="no-pad">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Restaurant</th><th>Storefront</th><th>Plan</th>
                <th className="num">Orders</th><th className="num">Lifetime revenue</th>
                <th className="num">Menu</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {list.data.restaurants.map((restaurant) => (
                <tr key={restaurant.id}>
                  <td>
                    <div className="cell-inline">
                      <RestaurantMark restaurant={restaurant} className="restaurant-emoji" />
                      <div className="cell-stack">
                        <strong>{restaurant.name}</strong>
                        <span>{restaurant.city || '—'}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <button className="domain-cell" onClick={() => setDomainsFor(restaurant)}>
                      {restaurant.domains.length > 0 ? (
                        <>
                          <span className="mono">{restaurant.domains[0].hostname}</span>
                          {restaurant.domains.length > 1 && (
                            <span className="domain-more">+{restaurant.domains.length - 1}</span>
                          )}
                        </>
                      ) : restaurant.platformHost ? (
                        <span className="mono muted">{restaurant.platformHost}</span>
                      ) : (
                        <span className="domain-none">Add a domain</span>
                      )}
                    </button>
                  </td>
                  <td><span className={`plan-pill plan-${restaurant.plan.toLowerCase()}`}>{restaurant.plan}</span></td>
                  <td className="num">{formatNumber(restaurant.orderCount)}</td>
                  <td className="num strong">{formatCurrency(restaurant.lifetimeRevenue, restaurant.currencySymbol, { compact: true })}</td>
                  <td className="num muted">{restaurant.menuItemCount}</td>
                  <td>
                    {restaurant.isActive
                      ? restaurant.isAcceptingOrders
                        ? <span className="pill-good">Live</span>
                        : <span className="pill-alert">Orders paused</span>
                      : <span className="pill-muted">Suspended</span>}
                  </td>
                  <td className="row-actions">
                    <button className="link-btn" onClick={() => open(restaurant)}>Open portal</button>
                    <button className="link-btn" onClick={() => setDomainsFor(restaurant)}>Domains</button>
                    <button className="link-btn" onClick={() => toggleActive(restaurant)}>
                      {restaurant.isActive ? 'Suspend' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {creating && (
        <OnboardModal onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); list.reload(); stats.reload(); }} />
      )}

      {domainsFor && (
        <DomainsModal
          restaurant={list.data.restaurants.find((r) => r.id === domainsFor.id) ?? domainsFor}
          onClose={() => setDomainsFor(null)}
          onChanged={list.reload}
        />
      )}
    </div>
  );
}

/**
 * Domains are how a visitor's browser is matched to a restaurant — one customer-app
 * deployment answers on all of them. Every restaurant also has a platform subdomain
 * that works with no DNS setup at all.
 */
function DomainsModal({ restaurant, onClose, onChanged }) {
  const toast = useToast();
  const [hostname, setHostname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function add(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.addDomain(restaurant.id, {
        hostname: hostname.trim(),
        isPrimary: restaurant.domains.length === 0,
      });
      setHostname('');
      toast.success('Domain attached');
      onChanged();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function remove(domain) {
    try {
      await api.removeDomain(domain.id);
      toast.success(`${domain.hostname} detached`);
      onChanged();
    } catch (err) { toast.error(err.message); }
  }

  return (
    <Modal
      title={`${restaurant.name} — domains`}
      subtitle="Where this restaurant's customers place orders"
      onClose={onClose}
      width={520}
      footer={<button className="btn btn-primary" onClick={onClose}>Done</button>}
    >
      {restaurant.platformHost && (
        <div className="domain-default">
          <div>
            <strong className="mono">{restaurant.platformHost}</strong>
            <span>Always works — no DNS needed</span>
          </div>
          <span className="pill-good">Built in</span>
        </div>
      )}

      {restaurant.domains.length > 0 && (
        <ul className="domain-list">
          {restaurant.domains.map((domain) => (
            <li key={domain.id}>
              <span className="mono">{domain.hostname}</span>
              {domain.isPrimary && <span className="pill-good">Primary</span>}
              <button className="link-btn danger" onClick={() => remove(domain)}>Detach</button>
            </li>
          ))}
        </ul>
      )}

      <form className="form" onSubmit={add} style={{ marginTop: '1rem' }}>
        <div className="field">
          <label>Add a custom domain</label>
          <div className="domain-add">
            <input
              value={hostname}
              onChange={(e) => { setHostname(e.target.value); setError(null); }}
              placeholder="order.theirrestaurant.com"
              className="mono"
            />
            <button type="submit" className="btn btn-ghost" disabled={busy || !hostname.trim()}>
              {busy ? 'Adding…' : 'Attach'}
            </button>
          </div>
          <span className="field-hint">
            Have the owner point a CNAME at your customer-app deployment, then attach it here.
            It starts working immediately — no redeploy.
          </span>
        </div>
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}

const slugify = (value) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

function OnboardModal({ onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: '', slug: '', slugTouched: false, tagline: '', logoEmoji: '🍽️',
    primaryColor: '#e8552d', city: '', phone: '', taxPercent: 5,
    plan: 'STARTER', ownerName: '', ownerEmail: '', ownerPassword: '',
    tableCount: 10, seedStarterMenu: true, domain: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({
      ...f,
      [field]: value,
      // The slug follows the name until the user edits it directly.
      ...(field === 'name' && !f.slugTouched ? { slug: slugify(value) } : {}),
      ...(field === 'slug' ? { slugTouched: true, slug: slugify(value) } : {}),
    }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim() || !form.slug) return setError('Give the restaurant a name.');
    if (form.ownerPassword.length < 8) return setError("The owner's password needs at least 8 characters.");

    setBusy(true);
    try {
      const result = await api.createRestaurant({
        name: form.name.trim(), slug: form.slug, tagline: form.tagline.trim() || undefined,
        logoEmoji: form.logoEmoji, primaryColor: form.primaryColor,
        city: form.city.trim() || undefined, phone: form.phone.trim() || undefined,
        taxPercent: Number(form.taxPercent), plan: form.plan,
        ownerName: form.ownerName.trim(), ownerEmail: form.ownerEmail.trim(),
        ownerPassword: form.ownerPassword,
        tableCount: Number(form.tableCount), seedStarterMenu: form.seedStarterMenu,
        domain: form.domain.trim() || undefined,
      });
      setCreated({ ...result, ownerEmail: form.ownerEmail.trim(), ownerPassword: form.ownerPassword });
      toast.success(`${form.name} is live`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  if (created) {
    return (
      <Modal title="Restaurant created" subtitle="Hand these details to your client" onClose={onCreated} width={520}
        footer={<button className="btn btn-primary" onClick={onCreated}>Done</button>}>
        <div className="handover">
          <h3>Owner sign-in</h3>
          <pre className="code-block">Portal:   {window.location.origin}
Email:    {created.ownerEmail}
Password: {created.ownerPassword}</pre>

          <h3>Their storefront</h3>
          <pre className="code-block">{created.platformHost
            ? `https://${created.platformHost}`
            : `(set PLATFORM_DOMAIN on the API to get a built-in address)`}</pre>

          <p className="field-hint">
            This works now — no deployment and no DNS. To use the client&apos;s own domain,
            have them point a CNAME at your customer-app deployment and attach it under
            Domains. One deployment serves every restaurant.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Onboard a restaurant" subtitle="Creates the tenant, its owner login and a starter setup"
      onClose={onClose} width={560}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Creating…' : 'Create restaurant'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="form">
        <h3 className="form-section">Restaurant</h3>
        <div className="field-row">
          <div className="field">
            <label>Name <span className="req">*</span></label>
            <input value={form.name} onChange={set('name')} autoFocus maxLength={80} placeholder="Delight Food" />
          </div>
          <div className="field">
            <label>Slug <span className="req">*</span></label>
            <input value={form.slug} onChange={set('slug')} className="mono" maxLength={40} />
            <span className="field-hint">Permanent. Used in every deployment.</span>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Tagline</label>
            <input value={form.tagline} onChange={set('tagline')} maxLength={120} />
          </div>
          <div className="field">
            <label>City</label>
            <input value={form.city} onChange={set('city')} maxLength={60} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>Logo emoji</label>
            <input value={form.logoEmoji} onChange={set('logoEmoji')} maxLength={8} className="emoji-input" />
          </div>
          <div className="field">
            <label>Brand colour</label>
            <div className="color-field">
              <input type="color" value={form.primaryColor} onChange={set('primaryColor')} />
              <input value={form.primaryColor} onChange={set('primaryColor')} className="mono" maxLength={7} />
            </div>
          </div>
          <div className="field">
            <label>Tax %</label>
            <input type="number" min="0" max="50" step="0.5" value={form.taxPercent} onChange={set('taxPercent')} />
          </div>
        </div>
        <div className="field">
          <label>Plan</label>
          <select value={form.plan} onChange={set('plan')}>
            <option value="STARTER">Starter</option>
            <option value="GROWTH">Growth</option>
            <option value="PRO">Pro</option>
          </select>
        </div>

        <h3 className="form-section">Owner account</h3>
        <div className="field-row">
          <div className="field">
            <label>Owner name <span className="req">*</span></label>
            <input value={form.ownerName} onChange={set('ownerName')} maxLength={60} />
          </div>
          <div className="field">
            <label>Owner email <span className="req">*</span></label>
            <input type="email" value={form.ownerEmail} onChange={set('ownerEmail')} />
          </div>
        </div>
        <div className="field">
          <label>Temporary password <span className="req">*</span></label>
          <input value={form.ownerPassword} onChange={set('ownerPassword')} placeholder="At least 8 characters" />
          <span className="field-hint">Share it with the owner and ask them to change it on first sign-in.</span>
        </div>

        <h3 className="form-section">Starter setup</h3>
        <div className="field-row">
          <div className="field">
            <label>Tables to create</label>
            <input type="number" min="0" max="60" value={form.tableCount} onChange={set('tableCount')} />
          </div>
          <div className="field">
            <label>Custom domain <span className="optional">optional</span></label>
            <input value={form.domain} onChange={set('domain')} className="mono"
              placeholder="order.theirrestaurant.com" />
            <span className="field-hint">Can be added later.</span>
          </div>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={form.seedStarterMenu} onChange={set('seedStarterMenu')} />
          Create four starter categories (Starters, Main Course, Beverages, Desserts)
        </label>

        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}
