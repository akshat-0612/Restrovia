export default function OrderSuccess({ orderId, total, onDismiss }) {
  return (
    <div className="order-success-overlay">
      <div className="order-success-box">
        <span className="success-icon">✅</span>
        <h2>Order Placed!</h2>
        <p>Your order has been received.</p>
        <p>We'll have it ready for you shortly.</p>
        <p className="order-id">Order #{orderId} · ₹{total.toFixed(2)}</p>
        <button className="btn-continue" onClick={onDismiss}>
          Continue Browsing
        </button>
      </div>
    </div>
  );
}
