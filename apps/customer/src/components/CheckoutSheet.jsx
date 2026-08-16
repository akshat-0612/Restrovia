import { useEffect, useState } from 'react';
import { formatCurrency } from '@shared';

const NAME_KEY = 'restrovia:customer';

/**
 * Collects the three things a dine-in order actually needs: who you are, where
 * you're sitting, and anything the kitchen should know. No payment step.
 */
export default function CheckoutSheet({
  quote, totals, currencySymbol, tables, presetTable, submitting, error,
  onApplyCoupon, onClose, onSubmit,
}) {
  const [form, setForm] = useState(() => {
    let remembered = {};
    try { remembered = JSON.parse(localStorage.getItem(NAME_KEY) || '{}'); } catch { /* ignore */ }
    return {
      customerName: remembered.customerName || '',
      customerPhone: remembered.customerPhone || '',
      tableId: presetTable?.id || '',
      notes: '',
    };
  });
  const [coupon, setCoupon] = useState(quote?.couponCode || '');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (presetTable?.id) setForm((f) => ({ ...f, tableId: presetTable.id }));
  }, [presetTable]);

  const nameValid  = form.customerName.trim().length >= 2;
  const phoneValid = !form.customerPhone.trim() || /^[0-9+\-\s]{7,15}$/.test(form.customerPhone.trim());
  const tableValid = Boolean(form.tableId);
  const canSubmit  = nameValid && phoneValid && tableValid && !submitting;

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  function handleSubmit(e) {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    try {
      localStorage.setItem(NAME_KEY, JSON.stringify({
        customerName: form.customerName.trim(), customerPhone: form.customerPhone.trim(),
      }));
    } catch { /* private mode */ }
    onSubmit({ ...form, customerName: form.customerName.trim(), customerPhone: form.customerPhone.trim() });
  }

  return (
    <>
      <div className="sheet-overlay visible" onClick={submitting ? undefined : onClose} />
      <div className="checkout-sheet visible" role="dialog" aria-label="Order details">
        <div className="checkout-header">
          <div>
            <h2>Almost there</h2>
            <p>Tell us where to bring your order.</p>
          </div>
          <button className="btn-close" onClick={onClose} disabled={submitting} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="checkout-form">
          <div className="form-group">
            <label htmlFor="co-name">Your name <span className="req">*</span></label>
            <input
              id="co-name" value={form.customerName} onChange={set('customerName')}
              placeholder="e.g. Aarav" autoComplete="name" autoFocus maxLength={60}
            />
            {touched && !nameValid && <span className="field-error">Please tell us your name</span>}
          </div>

          <div className="form-group">
            <label htmlFor="co-phone">Phone <span className="optional">optional</span></label>
            <input
              id="co-phone" value={form.customerPhone} onChange={set('customerPhone')}
              placeholder="98765 43210" inputMode="tel" autoComplete="tel" maxLength={15}
            />
            <span className="field-hint">We&apos;ll use this to look up your order later.</span>
            {touched && !phoneValid && <span className="field-error">That doesn&apos;t look like a phone number</span>}
          </div>

          <div className="form-group">
            <label htmlFor="co-table">Table <span className="req">*</span></label>
            {presetTable ? (
              <div className="table-locked">
                <span className="table-locked-badge">{presetTable.label}</span>
                <span>Scanned from your table&apos;s QR code</span>
              </div>
            ) : (
              <select id="co-table" value={form.tableId} onChange={set('tableId')}>
                <option value="">Select your table…</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>{t.label} · seats {t.seats}</option>
                ))}
              </select>
            )}
            {touched && !tableValid && <span className="field-error">Select your table</span>}
          </div>

          <div className="form-group">
            <label htmlFor="co-notes">Notes for the kitchen <span className="optional">optional</span></label>
            <textarea
              id="co-notes" value={form.notes} onChange={set('notes')}
              placeholder="Less spicy, no onion, birthday candle…" rows={2} maxLength={300}
            />
          </div>

          <div className="coupon-row">
            <input
              value={coupon}
              onChange={(e) => setCoupon(e.target.value.toUpperCase())}
              placeholder="Coupon code"
              maxLength={20}
            />
            <button type="button" className="btn-coupon" onClick={() => onApplyCoupon(coupon.trim() || null)}>
              {quote?.couponCode ? 'Update' : 'Apply'}
            </button>
          </div>
          {quote?.couponCode && (
            <p className="coupon-applied">
              ✓ {quote.couponCode} applied — you saved {formatCurrency(quote.discountAmount, currencySymbol)}
            </p>
          )}

          <div className="checkout-bill">
            <div className="bill-row"><span>Subtotal</span><span>{formatCurrency(quote?.subtotal ?? totals.subtotal, currencySymbol)}</span></div>
            {quote?.discountAmount > 0 && (
              <div className="bill-row discount"><span>Discount</span><span>−{formatCurrency(quote.discountAmount, currencySymbol)}</span></div>
            )}
            {quote && !quote.taxInclusive && (
              <div className="bill-row muted"><span>{quote.taxLabel} ({quote.taxPercent}%)</span><span>{formatCurrency(quote.taxAmount, currencySymbol)}</span></div>
            )}
            <div className="bill-row total">
              <span>To pay at the counter</span>
              <span>{formatCurrency(quote?.totalAmount ?? totals.subtotal, currencySymbol)}</span>
            </div>
          </div>

          {error && <p className="checkout-error">{error}</p>}

          <button type="submit" className="btn-confirm-order" disabled={!canSubmit}>
            {submitting ? 'Placing your order…' : `Place order · ${formatCurrency(quote?.totalAmount ?? totals.subtotal, currencySymbol)}`}
          </button>
          <p className="checkout-footnote">No payment now — settle the bill at the counter.</p>
        </form>
      </div>
    </>
  );
}
