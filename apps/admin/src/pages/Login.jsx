import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/auth-context';

const DEMO = [
  { label: 'Restaurant owner', email: 'owner@delightfood.in',   password: 'owner123' },
  { label: 'Manager',          email: 'manager@delightfood.in', password: 'manager123' },
  { label: 'Kitchen staff',    email: 'staff@delightfood.in',   password: 'staff123' },
  { label: 'Platform admin',   email: 'platform@restrovia.app', password: 'platform123' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (field) => (e) => { setForm((f) => ({ ...f, [field]: e.target.value })); setError(null); };

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login({ email: form.email.trim(), password: form.password });
      // Start at the top rather than wherever the last user happened to be —
      // a restaurant owner has no business landing on the platform screen.
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark">◆</span>
          <div>
            <strong>Restrovia</strong>
            <span>Restaurant admin</span>
          </div>
        </div>

        <h1>Sign in</h1>
        <p className="login-sub">Manage your orders, menu and insights.</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={form.email} onChange={set('email')}
              autoComplete="username" placeholder="you@restaurant.com" required autoFocus />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" value={form.password} onChange={set('password')}
              autoComplete="current-password" placeholder="••••••••" required />
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {/* Seeded accounts, so a demo never stalls on "what's the password?" */}
        <div className="login-demo">
          <span className="login-demo-title">Demo accounts</span>
          <div className="login-demo-grid">
            {DEMO.map((account) => (
              <button key={account.email} type="button" className="demo-chip"
                onClick={() => setForm({ email: account.email, password: account.password })}>
                {account.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
