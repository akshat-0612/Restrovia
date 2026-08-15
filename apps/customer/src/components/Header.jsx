import { ORDER_STATUS } from '@shared';

export default function Header({
  restaurant, categories, activeCategory, onCategoryChange,
  search, onSearchChange, cartCount, onOpenCart, tableLabel,
  activeOrder, onTrackOrder,
}) {
  return (
    <header className="header">
      <div className="header-top">
        <div className="header-brand">
          <div className="cafe-icon">
            {restaurant.logoUrl
              ? <img src={restaurant.logoUrl} alt="" />
              : restaurant.logoEmoji}
          </div>
          <div className="header-brand-text">
            <h1>{restaurant.name}</h1>
            {restaurant.tagline && <p>{restaurant.tagline}</p>}
          </div>
        </div>

        <div className="header-actions">
          {tableLabel && <span className="table-chip">Table {tableLabel}</span>}
          <button className="btn-cart" onClick={onOpenCart} aria-label="Open cart">
            <span aria-hidden>🛒</span>
            <span className="btn-cart-text">Cart</span>
            {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
          </button>
        </div>
      </div>

      {activeOrder && (
        <button className="order-strip" onClick={onTrackOrder}>
          <span className="order-strip-icon">{ORDER_STATUS[activeOrder.status].icon}</span>
          <span className="order-strip-text">
            <strong>Order #{activeOrder.orderNumber}</strong>
            <span>{ORDER_STATUS[activeOrder.status].customerLabel}</span>
          </span>
          <span className="order-strip-cta">Track →</span>
        </button>
      )}

      {!restaurant.isAcceptingOrders && (
        <div className="closed-banner">🔒 {restaurant.closedMessage}</div>
      )}

      <div className="search-bar-wrap">
        <div className="search-bar">
          <span aria-hidden>🔍</span>
          <input
            type="search"
            placeholder="Search the menu…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search the menu"
          />
          {search && <button className="search-clear" onClick={() => onSearchChange('')} aria-label="Clear search">✕</button>}
        </div>
      </div>

      <nav className="category-row" aria-label="Menu categories">
        <button
          className={`chip ${activeCategory === 'All' ? 'active' : ''}`}
          onClick={() => onCategoryChange('All')}
        >
          All <span className="chip-count">{categories.reduce((s, c) => s + c.items.length, 0)}</span>
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={`chip ${activeCategory === c.name ? 'active' : ''}`}
            onClick={() => onCategoryChange(c.name)}
          >
            {c.icon} {c.name} <span className="chip-count">{c.items.length}</span>
          </button>
        ))}
      </nav>
    </header>
  );
}
