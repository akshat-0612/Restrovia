import { useEffect, useState } from 'react';

/**
 * The sticky control bar: search, categories, orders, cart.
 *
 * Deliberately carries no branding. The hero above it already says whose menu
 * this is, and a customer scanning a QR code at a table knows what restaurant
 * they are sitting in — repeating the name and logo directly under the hero
 * spent a row of a phone screen saying something nobody was asking.
 */

/** Hysteresis, so a bar crossing the threshold does not flicker its shadow. */
const LIFT_AT = 130;
const SETTLE_AT = 60;

/** Whether the bar is floating over content rather than sitting under the hero. */
function useScrolled() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled((was) => (was ? y > SETTLE_AT : y > LIFT_AT));
    };
    onScroll();                                  // correct after a reload mid-page
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return scrolled;
}

export default function Header({
  restaurant, categories, activeCategory, onCategoryChange,
  search, onSearchChange, cartCount, onOpenCart, tableLabel,
  myOrders = [], activeOrders = [], onViewOrders,
}) {
  const scrolled = useScrolled();
  const live = activeOrders.length;
  const totalItems = categories.reduce((s, c) => s + c.items.length, 0);

  return (
    <header className={`menu-bar ${scrolled ? 'scrolled' : ''}`}>
      <div className="menu-bar-tools">
        <div className="search-bar">
          <span aria-hidden>🔍</span>
          <input
            type="search"
            placeholder="Search the menu…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search the menu"
          />
          {search && (
            <button className="search-clear" onClick={() => onSearchChange('')} aria-label="Clear search">✕</button>
          )}
        </div>

        {tableLabel && <span className="table-chip">Table {tableLabel}</span>}

        {/*
          A button beside the cart rather than the full-width strip this used to
          be. The strip appeared the moment an order was placed and pushed the
          whole menu down to make room; this occupies a slot that was already
          there, so placing an order no longer moves what someone is reading.
        */}
        {myOrders.length > 0 && (
          <button
            className={`btn-orders ${live > 0 ? 'live' : ''}`}
            onClick={onViewOrders}
            aria-label={live > 0 ? `Your orders, ${live} in progress` : 'Your orders'}
          >
            <span aria-hidden>🧾</span>
            <span className="btn-orders-text">Orders</span>
            {live > 0 && <span className="orders-badge">{live}</span>}
          </button>
        )}

        <button className="btn-cart" onClick={onOpenCart} aria-label="Open cart">
          <span aria-hidden>🛒</span>
          <span className="btn-cart-text">Cart</span>
          {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
        </button>
      </div>

      <nav className="category-row" aria-label="Menu categories">
        <button
          className={`chip ${activeCategory === 'All' ? 'active' : ''}`}
          onClick={() => onCategoryChange('All')}
        >
          All <span className="chip-count">{totalItems}</span>
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

      {!restaurant.isAcceptingOrders && (
        <div className="closed-banner">🔒 {restaurant.closedMessage}</div>
      )}
    </header>
  );
}
