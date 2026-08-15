import { useState } from 'react';
import { ROLE_LABELS, timeAgo } from '@shared';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useAuth } from '../context/auth-context';
import { useToast } from '../components/toast-context';
import Modal, { ConfirmModal } from '../components/Modal';
import { Card, ErrorState, Spinner } from '../components/States';

const ROLE_HELP = {
  OWNER:   'Full access, including staff, settings and billing.',
  MANAGER: 'Runs the floor: orders, menu, tables and coupons. No staff or settings.',
  STAFF:   'The live order board only.',
};

export default function Staff() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useApi((signal) => api.staff(signal), []);
  const [modal, setModal] = useState(null);
  const [deactivating, setDeactivating] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleDeactivate() {
    setBusy(true);
    try {
      await api.deleteStaff(deactivating.id);
      toast.success(`${deactivating.name} can no longer sign in`);
      setDeactivating(null);
      reload();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Staff</h1>
          <p className="page-sub">Who can sign in to this portal, and what they can do.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>+ Add staff</button>
      </header>

      <Card bodyClass="no-pad">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Last signed in</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {data.staff.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="cell-inline">
                      <span className="user-avatar sm">{member.name.charAt(0).toUpperCase()}</span>
                      <strong>{member.name}</strong>
                      {member.id === user.id && <span className="tag-you">you</span>}
                    </div>
                  </td>
                  <td className="muted">{member.email}</td>
                  <td>
                    <div className="cell-stack">
                      <strong>{ROLE_LABELS[member.role]}</strong>
                      <span>{ROLE_HELP[member.role]}</span>
                    </div>
                  </td>
                  <td className="muted">{member.lastLoginAt ? timeAgo(member.lastLoginAt) : 'Never'}</td>
                  <td>{member.isActive ? <span className="pill-good">Active</span> : <span className="pill-muted">Deactivated</span>}</td>
                  <td className="row-actions">
                    <button className="link-btn" onClick={() => setModal({ mode: 'edit', member })}>Edit</button>
                    {member.id !== user.id && member.isActive && (
                      <button className="link-btn danger" onClick={() => setDeactivating(member)}>Deactivate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {modal && (
        <StaffModal mode={modal.mode} initial={modal.member}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      )}

      {deactivating && (
        <ConfirmModal title={`Deactivate ${deactivating.name}?`}
          message="They will be signed out and cannot sign back in. Their name stays on the orders they handled."
          confirmLabel="Deactivate" busy={busy}
          onConfirm={handleDeactivate} onClose={() => setDeactivating(null)} />
      )}
    </>
  );
}

function StaffModal({ mode, initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: initial?.name ?? '', email: initial?.email ?? '', phone: initial?.phone ?? '',
    role: initial?.role ?? 'STAFF', password: '', isActive: initial?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (form.name.trim().length < 2) return setError('Enter their full name.');
    if (mode === 'create' && form.password.length < 8) return setError('Password must be at least 8 characters.');
    if (mode === 'edit' && form.password && form.password.length < 8) return setError('Password must be at least 8 characters.');

    setBusy(true);
    try {
      if (mode === 'create') {
        await api.createStaff({
          name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim() || undefined,
          role: form.role, password: form.password,
        });
        toast.success('Staff member added');
      } else {
        await api.updateStaff(initial.id, {
          name: form.name.trim(), phone: form.phone.trim() || undefined,
          role: form.role, isActive: form.isActive,
          ...(form.password ? { password: form.password } : {}),
        });
        toast.success('Staff member updated');
      }
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={mode === 'create' ? 'Add staff member' : `Edit ${initial.name}`} onClose={onClose} width={460}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="form">
        <div className="field">
          <label>Full name <span className="req">*</span></label>
          <input value={form.name} onChange={set('name')} autoFocus maxLength={60} />
        </div>
        <div className="field">
          <label>Email <span className="req">*</span></label>
          <input type="email" value={form.email} onChange={set('email')}
            disabled={mode === 'edit'} required />
          {mode === 'edit' && <span className="field-hint">Email cannot be changed after the account is created.</span>}
        </div>
        <div className="field">
          <label>Phone</label>
          <input value={form.phone} onChange={set('phone')} maxLength={20} />
        </div>
        <div className="field">
          <label>Role</label>
          <select value={form.role} onChange={set('role')}>
            <option value="STAFF">Staff</option>
            <option value="MANAGER">Manager</option>
            <option value="OWNER">Owner</option>
          </select>
          <span className="field-hint">{ROLE_HELP[form.role]}</span>
        </div>
        <div className="field">
          <label>{mode === 'create' ? 'Password' : 'New password'} {mode === 'create' && <span className="req">*</span>}</label>
          <input type="password" value={form.password} onChange={set('password')}
            placeholder={mode === 'edit' ? 'Leave blank to keep the current one' : 'At least 8 characters'} />
        </div>
        {mode === 'edit' && (
          <label className="checkbox">
            <input type="checkbox" checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
            Can sign in
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}
