/** Rounds to 2 decimals without floating-point drift (0.1 + 0.2 style). */
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Single source of truth for order maths. Both the customer quote and the
 * server-side order creation call this, so the total the customer sees is the
 * total that gets stored.
 */
export function computeTotals({ lineItems, taxPercent, discountAmount = 0, taxInclusive = false }) {
  const subtotal = round2(lineItems.reduce((sum, li) => sum + li.unitPrice * li.quantity, 0));
  const discount = round2(Math.min(discountAmount, subtotal));
  const taxable  = round2(subtotal - discount);

  // Inclusive tax is already inside the menu price — back it out for the bill
  // breakdown instead of adding it on top.
  const taxAmount = taxInclusive
    ? round2(taxable - taxable / (1 + Number(taxPercent) / 100))
    : round2((taxable * Number(taxPercent)) / 100);

  const totalAmount = taxInclusive ? taxable : round2(taxable + taxAmount);
  const itemCount   = lineItems.reduce((sum, li) => sum + li.quantity, 0);

  return { subtotal, discountAmount: discount, taxAmount, totalAmount, itemCount };
}
