import { useState } from 'react';
import { formatCurrency } from '@shared';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useAuth } from '../context/auth-context';
import { useToast } from '../components/toast-context';
import Modal, { ConfirmModal } from '../components/Modal';
import { Card, EmptyState, ErrorState, Spinner } from '../components/States';

export default function Coupons() {
  const { user, can } = useAuth();
  const toast = useToast();
  const symbol = user.restaurant?.currencySymbol || '₹';
  const editable = can('PLATFORM_ADMIN', 'OWNER', 'MANAGER');

  const { data, loading, error, reload } = useApi((signal) => api.coupons(signal), []);
  const [modal, setModal] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  async function toggleActive(coupon) {
    try {
      await api.updateCoupon(coupon.id, { isActive: !coupon.isActive });
      toast.success(coupon.isActive ? 'Coupon paused' : 'Coupon live');
      reload();
    } catch (err) { toast.error(err.message); }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await api.deleteCoupon(deleting.id);
      toast.success('Coupon deleted');
      setDeleting(null);
      reload();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const coupons = data.coupons;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Coupons</h1>
          <p className="page-sub">Discount codes customers can enter at checkout.</p>
        </div>
        {editable && (
          <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>+ New coupon</button>
        )}
      </header>

      {coupons.length === 0 ? (
        <EmptyState icon="🏷️" title="No coupons yet"
          message="Create a code to run a promotion — a percentage off, or a flat amount."
          action={editable && <button className="btn btn-primary" onClick={() => setModal({ mode: 'create' })}>+ New coupon</button>} />
      ) : (
        <Card bodyClass="no-pad">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th><th>Discount</th><th>Conditions</th>
                  <th className="num">Used</th><th>Status</th>{editable && <th />}
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => {
                  const expired = coupon.validUntil && new Date(coupon.validUntil) < new Date();
                  const exhausted = coupon.usageLimit != null && coupon.timesUsed >= coupon.usageLimit;
                  return (
                    <tr key={coupon.id}>
                      <td>
                        <div className="cell-stack">
                          <strong className="mono">{coupon.code}</strong>
                          {coupon.description && <span>{coupon.description}</span>}
                        </div>
                      </td>
                      <td className="strong">
                        {coupon.discountType === 'PERCENT'
                          ? `${coupon.value}% off`
                          : `${formatCurrency(coupon.value, symbol)} off`}
                        {coupon.maxDiscount != null && (
                          <span className="muted"> · max {formatCurrency(coupon.maxDiscount, symbol)}</span>
                        )}
                      </td>
                      <td className="muted">
                        {Number(coupon.minOrderAmount) > 0 && <div>Min {formatCurrency(coupon.minOrderAmount, symbol)}</div>}
                        {coupon.validUntil && <div>Until {new Date(coupon.validUntil).toLocaleDateString('en-IN')}</div>}
                        {coupon.usageLimit != null && <div>Limit {coupon.usageLimit}</div>}
                        {!Number(coupon.minOrderAmount) && !coupon.validUntil && coupon.usageLimit == null && '—'}
                      </td>
                      <td className="num">{coupon.timesUsed}</td>
                      <td>
                        {!coupon.isActive ? <span className="pill-muted">Paused</span>
                          : expired ? <span className="pill-alert">Expired</span>
                          : exhausted ? <span className="pill-alert">Used up</span>
                          : <span className="pill-good">Live</span>}
                      </td>
                      {editable && (
                        <td className="row-actions">
                          <button className="link-btn" onClick={() => toggleActive(coupon)}>
                            {coupon.isActive ? 'Pause' : 'Resume'}
                          </button>
                          <button className="link-btn" onClick={() => setModal({ mode: 'edit', coupon })}>Edit</button>
                          <button className="link-btn danger" onClick={() => setDeleting(coupon)}>Delete</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modal && (
        <CouponModal mode={modal.mode} initial={modal.coupon} symbol={symbol}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); reload(); }} />
      )}

      {deleting && (
        <ConfirmModal title={`Delete ${deleting.code}?`}
          message="Orders that already used this code keep their discount. This cannot be undone."
          confirmLabel="Delete" busy={busy}
          onConfirm={handleDelete} onClose={() => setDeleting(null)} />
      )}
    </>
  );
}

function CouponModal({ mode, initial, symbol, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    code: initial?.code ?? '',
    description: initial?.description ?? '',
    discountType: initial?.discountType ?? 'PERCENT',
    value: initial?.value ?? '',
    minOrderAmount: initial?.minOrderAmount ?? 0,
    maxDiscount: initial?.maxDiscount ?? '',
    usageLimit: initial?.usageLimit ?? '',
    validUntil: initial?.validUntil ? initial.validUntil.slice(0, 10) : '',
    isActive: initial?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description.trim() || null,
      discountType: form.discountType,
      value: Number(form.value),
      minOrderAmount: Number(form.minOrderAmount) || 0,
      maxDiscount: form.maxDiscount === '' ? null : Number(form.maxDiscount),
      usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
      // A date input gives a local day; send end-of-day so the coupon lasts all of it.
      validUntil: form.validUntil ? new Date(`${form.validUntil}T23:59:59`).toISOString() : null,
      isActive: form.isActive,
    };

    if (payload.code.length < 3) return setError('Codes need at least 3 characters.');
    if (!Number.isFinite(payload.value) || payload.value <= 0) return setError('Enter a discount greater than zero.');
    if (payload.discountType === 'PERCENT' && payload.value > 100) return setError('A percentage cannot exceed 100.');

    setBusy(true);
    try {
      if (mode === 'create') await api.createCoupon(payload);
      else await api.updateCoupon(initial.id, payload);
      toast.success(mode === 'create' ? 'Coupon created' : 'Coupon updated');
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal title={mode === 'create' ? 'New coupon' : `Edit ${initial.code}`} onClose={onClose} width={480}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Saving…' : 'Save coupon'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="form">
        <div className="field-row">
          <div className="field">
            <label>Code <span className="req">*</span></label>
            <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              placeholder="WELCOME10" autoFocus maxLength={20} className="mono" />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={form.discountType} onChange={set('discountType')}>
              <option value="PERCENT">Percentage off</option>
              <option value="FLAT">Flat amount off</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label>Description</label>
          <input value={form.description} onChange={set('description')} maxLength={120}
            placeholder="Shown to you only — customers just see the code" />
        </div>

        <div className="field-row">
          <div className="field">
            <label>{form.discountType === 'PERCENT' ? 'Percent off' : `Amount off (${symbol})`} <span className="req">*</span></label>
            <input type="number" min="0" step="1" value={form.value} onChange={set('value')} />
          </div>
          <div className="field">
            <label>Minimum order ({symbol})</label>
            <input type="number" min="0" step="1" value={form.minOrderAmount} onChange={set('minOrderAmount')} />
          </div>
        </div>

        <div className="field-row">
          {form.discountType === 'PERCENT' && (
            <div className="field">
              <label>Cap the discount at ({symbol})</label>
              <input type="number" min="0" step="1" value={form.maxDiscount} onChange={set('maxDiscount')}
                placeholder="No cap" />
            </div>
          )}
          <div className="field">
            <label>Total uses allowed</label>
            <input type="number" min="1" value={form.usageLimit} onChange={set('usageLimit')} placeholder="Unlimited" />
          </div>
        </div>

        <div className="field">
          <label>Valid until</label>
          <input type="date" value={form.validUntil} onChange={set('validUntil')} />
          <span className="field-hint">Leave blank for no expiry.</span>
        </div>

        <label className="checkbox">
          <input type="checkbox" checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
          Active — customers can use this now
        </label>

        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}
