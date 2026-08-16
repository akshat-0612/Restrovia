import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useToast } from '../components/toast-context';
import { Card, ErrorState, Spinner } from '../components/States';

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York'];

export default function Settings() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi((signal) => api.settings(signal), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  useEffect(() => { if (data) setForm(data.restaurant); }, [data]);

  if (loading || !form) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: value }));
  };

  async function save(fields) {
    setBusy(true);
    try {
      // Only the named fields go up, so one section's save can't clobber another's.
      const payload = Object.fromEntries(
        fields.map((f) => [f, ['taxPercent', 'serviceChargePct', 'minOrderAmount', 'avgPrepTimeMins'].includes(f)
          ? Number(form[f]) : form[f]])
      );
      const { restaurant } = await api.updateSettings(payload);
      setForm(restaurant);
      toast.success('Saved');
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  async function changePassword(e) {
    e.preventDefault();
    if (password.newPassword !== password.confirm) return toast.error('The new passwords do not match');
    if (password.newPassword.length < 8) return toast.error('Use at least 8 characters');
    try {
      await api.changePassword({ currentPassword: password.currentPassword, newPassword: password.newPassword });
      setPassword({ currentPassword: '', newPassword: '', confirm: '' });
      toast.success('Password changed');
    } catch (err) { toast.error(err.message); }
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="page-sub">Your restaurant&apos;s profile, branding and billing rules.</p>
        </div>
      </header>

      <Card title="Restaurant profile" subtitle="Shown on the customer app"
        action={<button className="btn btn-primary btn-sm" disabled={busy}
          onClick={() => save(['name', 'tagline', 'phone', 'email', 'address', 'city', 'gstNumber'])}>Save</button>}>
        <div className="form">
          <div className="field-row">
            <div className="field">
              <label>Restaurant name</label>
              <input value={form.name} onChange={set('name')} maxLength={80} />
            </div>
            <div className="field">
              <label>Tagline</label>
              <input value={form.tagline ?? ''} onChange={set('tagline')} maxLength={120}
                placeholder="Fresh, fast and full of flavour" />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Phone</label>
              <input value={form.phone ?? ''} onChange={set('phone')} maxLength={20} />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email ?? ''} onChange={set('email')} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Address</label>
              <input value={form.address ?? ''} onChange={set('address')} maxLength={200} />
            </div>
            <div className="field">
              <label>City</label>
              <input value={form.city ?? ''} onChange={set('city')} maxLength={60} />
            </div>
          </div>
          <div className="field">
            <label>GST number</label>
            <input value={form.gstNumber ?? ''} onChange={set('gstNumber')} maxLength={30} className="mono" />
          </div>
        </div>
      </Card>

      <Card title="Storefront" subtitle="Where your customers order — used for table QR codes"
        action={<button className="btn btn-primary btn-sm" disabled={busy}
          onClick={() => save(['storefrontUrl'])}>Save</button>}>
        <div className="form">
          <div className="field">
            <label>Storefront URL</label>
            <input value={form.storefrontUrl ?? ''} onChange={set('storefrontUrl')}
              placeholder="https://your-restaurant.pages.dev" className="mono" />
            <span className="field-hint">
              The address customers visit. Every table QR code is built from it, so
              printing codes before this is right means reprinting them.
            </span>
          </div>
          {form.domains?.length > 0 && (
            <p className="field-hint">
              Registered domains for this restaurant:{' '}
              {form.domains.map((d) => d.hostname).join(', ')} — used automatically if
              you leave the field blank.
            </p>
          )}
        </div>
      </Card>

      <Card title="Branding" subtitle="Colours and logo used across your customer app"
        action={<button className="btn btn-primary btn-sm" disabled={busy}
          onClick={() => save(['logoEmoji', 'logoUrl', 'primaryColor', 'accentColor'])}>Save</button>}>
        <div className="form">
          <div className="field-row">
            <div className="field">
              <label>Logo emoji</label>
              <input value={form.logoEmoji} onChange={set('logoEmoji')} maxLength={8} className="emoji-input" />
              <span className="field-hint">Used when no logo image is set.</span>
            </div>
            <div className="field">
              <label>Logo image URL</label>
              <input value={form.logoUrl ?? ''} onChange={set('logoUrl')} placeholder="https://…" />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Primary colour</label>
              <div className="color-field">
                <input type="color" value={form.primaryColor} onChange={set('primaryColor')} />
                <input value={form.primaryColor} onChange={set('primaryColor')} className="mono" maxLength={7} />
              </div>
            </div>
            <div className="field">
              <label>Accent colour</label>
              <div className="color-field">
                <input type="color" value={form.accentColor} onChange={set('accentColor')} />
                <input value={form.accentColor} onChange={set('accentColor')} className="mono" maxLength={7} />
              </div>
            </div>
          </div>
          <div className="brand-preview" style={{ '--preview-brand': form.primaryColor, '--preview-accent': form.accentColor }}>
            <span className="preview-logo">{form.logoEmoji}</span>
            <div>
              <strong>{form.name}</strong>
              <span>{form.tagline}</span>
            </div>
            <button type="button" className="preview-btn">Add to cart</button>
          </div>
        </div>
      </Card>

      <Card title="Billing rules" subtitle="How totals are calculated on every order"
        action={<button className="btn btn-primary btn-sm" disabled={busy}
          onClick={() => save(['currencySymbol', 'taxPercent', 'taxLabel', 'taxInclusive', 'minOrderAmount', 'avgPrepTimeMins', 'timezone'])}>Save</button>}>
        <div className="form">
          <div className="field-row">
            <div className="field">
              <label>Currency symbol</label>
              <input value={form.currencySymbol} onChange={set('currencySymbol')} maxLength={4} />
            </div>
            <div className="field">
              <label>Tax label</label>
              <input value={form.taxLabel} onChange={set('taxLabel')} maxLength={20} placeholder="GST" />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Tax percent</label>
              <input type="number" min="0" max="50" step="0.5" value={form.taxPercent} onChange={set('taxPercent')} />
            </div>
            <div className="field">
              <label>Minimum order</label>
              <input type="number" min="0" step="1" value={form.minOrderAmount} onChange={set('minOrderAmount')} />
            </div>
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={form.taxInclusive} onChange={set('taxInclusive')} />
            Menu prices already include tax
          </label>
          <div className="field-row">
            <div className="field">
              <label>Typical prep time (min)</label>
              <input type="number" min="1" max="180" value={form.avgPrepTimeMins} onChange={set('avgPrepTimeMins')} />
              <span className="field-hint">Shown to customers as an estimate while they wait.</span>
            </div>
            <div className="field">
              <label>Timezone</label>
              <select value={form.timezone} onChange={set('timezone')}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
              <span className="field-hint">All reports use this zone for &quot;today&quot; and &quot;this month&quot;.</span>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Opening hours & availability"
        action={<button className="btn btn-primary btn-sm" disabled={busy}
          onClick={() => save(['openingTime', 'closingTime', 'closedMessage', 'isAcceptingOrders'])}>Save</button>}>
        <div className="form">
          <div className="field-row">
            <div className="field">
              <label>Opens</label>
              <input type="time" value={form.openingTime} onChange={set('openingTime')} />
            </div>
            <div className="field">
              <label>Closes</label>
              <input type="time" value={form.closingTime} onChange={set('closingTime')} />
            </div>
          </div>
          <div className="field">
            <label>Message when orders are paused</label>
            <input value={form.closedMessage} onChange={set('closedMessage')} maxLength={200} />
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={form.isAcceptingOrders} onChange={set('isAcceptingOrders')} />
            Currently accepting orders
          </label>
        </div>
      </Card>

      <Card title="Your password">
        <form className="form" onSubmit={changePassword}>
          <div className="field">
            <label>Current password</label>
            <input type="password" value={password.currentPassword} autoComplete="current-password"
              onChange={(e) => setPassword((p) => ({ ...p, currentPassword: e.target.value }))} />
          </div>
          <div className="field-row">
            <div className="field">
              <label>New password</label>
              <input type="password" value={password.newPassword} autoComplete="new-password"
                onChange={(e) => setPassword((p) => ({ ...p, newPassword: e.target.value }))} />
            </div>
            <div className="field">
              <label>Confirm new password</label>
              <input type="password" value={password.confirm} autoComplete="new-password"
                onChange={(e) => setPassword((p) => ({ ...p, confirm: e.target.value }))} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary">Change password</button>
        </form>
      </Card>

      <Card title="Deployment" subtitle="What to configure when you deploy this restaurant's customer app">
        <div className="deploy-block">
          <p>Build the customer app with this environment variable and it becomes this restaurant&apos;s storefront:</p>
          <pre className="code-block">VITE_RESTAURANT_SLUG={form.slug}
VITE_API_URL=https://your-api-domain.com</pre>
          <p className="field-hint">
            The slug is fixed for the life of the restaurant — every order, table QR code and
            saved cart is keyed to it.
          </p>
        </div>
      </Card>
    </>
  );
}
