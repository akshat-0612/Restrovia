import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { api } from './lib/api';
import { useCart } from './hooks/useCart';
import { useActiveOrder } from './hooks/useActiveOrder';
import { useRestaurant, flattenMenu } from './hooks/useRestaurant';
import { cartKeyFor, formatCurrency } from '@shared';

import Header from './components/Header';
import MenuItemCard from './components/MenuItemCard';
import ItemDetailSheet from './components/ItemDetailSheet';
import CartSidebar from './components/CartSidebar';
import CheckoutSheet from './components/CheckoutSheet';
import OrderTracker from './components/OrderTracker';

/** Applies the restaurant's brand colours as CSS variables at the document root. */
function useBrandTheme(restaurant) {
  useEffect(() => {
    if (!restaurant) return;
    const root = document.documentElement;
    root.style.setProperty('--brand', restaurant.primaryColor);
    root.style.setProperty('--accent', restaurant.accentColor);
    document.title = `${restaurant.name} — Order from your table`;
  }, [restaurant]);
}

export default function App() {
  const { status, restaurant, categories, error } = useRestaurant();
  const menuItems = useMemo(() => flattenMenu(categories), [categories]);

  const cart = useCart(menuItems);
  useBrandTheme(restaurant);

  const [activeCategory, setActiveCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [detailItem, setDetailItem] = useState(null);
  const [view, setView] = useState('menu');       // menu | cart | checkout | tracking
  const [toast, setToast] = useState(null);

  // Survives reloads, so closing the tab doesn't lose the customer their order.
  const activeOrder = useActiveOrder();

  const [tables, setTables] = useState([]);
  const [presetTable, setPresetTable] = useState(null);

  const [couponCode, setCouponCode] = useState(null);
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  /* ── Table: from a scanned QR (?t=token) or picked at checkout ── */
  useEffect(() => {
    if (status !== 'ready') return;
    api.getTables()
      // "T2" must come before "T10" — a plain string sort puts them the other way round.
      .then(({ tables: list }) => setTables(
        [...list].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
      ))
      .catch(() => setTables([]));

    const token = new URLSearchParams(window.location.search).get('t');
    if (!token) return;
    api.getTableByToken(token)
      .then(({ table }) => setPresetTable(table))
      .catch(() => setToast({ tone: 'warn', message: "That table code wasn't recognised — pick your table at checkout." }));
  }, [status]);

  /* ── Server-authoritative pricing. Debounced so quick +/- taps make one call. ── */
  const quoteSeq = useRef(0);
  useEffect(() => {
    if (cart.payload.length === 0) { setQuote(null); setQuoteError(null); return undefined; }

    const seq = ++quoteSeq.current;
    const timer = setTimeout(async () => {
      try {
        const result = await api.quote(cart.payload, couponCode);
        // Ignore a response that a newer request has already superseded.
        if (seq === quoteSeq.current) { setQuote(result); setQuoteError(null); }
      } catch (err) {
        if (seq === quoteSeq.current) {
          setQuoteError(err.message);
          // A rejected coupon shouldn't block checkout — drop it and re-quote.
          if (/coupon/i.test(err.message)) setCouponCode(null);
        }
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [cart.payload, couponCode]);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(id);
  }, [toast]);

  // A customer coming back to a still-cooking order lands on the tracker, not the menu.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !activeOrder.order) return;
    restored.current = true;
    if (activeOrder.isActive) setView('tracking');
  }, [activeOrder.order, activeOrder.isActive]);

  /* ── Cart actions ── */
  const handleAdd = useCallback((item, variant) => {
    cart.add(item, variant);
    setToast({ tone: 'ok', message: `${item.name}${variant ? ` (${variant.label})` : ''} added` });
  }, [cart]);

  const handleChangeQtyByItem = useCallback(
    (itemId, variantLabel, delta) => cart.changeQty(cartKeyFor(itemId, variantLabel), delta),
    [cart]
  );

  /* ── Filtering ── */
  const visibleCategories = useMemo(() => {
    const query = search.trim().toLowerCase();
    return categories
      .map((category) => {
        if (activeCategory !== 'All' && category.name !== activeCategory) return null;
        const items = query
          ? category.items.filter((i) =>
              i.name.toLowerCase().includes(query) ||
              (i.description || '').toLowerCase().includes(query) ||
              category.name.toLowerCase().includes(query))
          : category.items;
        return items.length ? { ...category, items } : null;
      })
      .filter(Boolean);
  }, [categories, activeCategory, search]);

  const resultCount = visibleCategories.reduce((s, c) => s + c.items.length, 0);

  /* ── Placing the order ── */
  async function handleSubmitOrder(form) {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { order } = await api.placeOrder({
        cart: cart.payload,
        customerName: form.customerName,
        customerPhone: form.customerPhone || undefined,
        tableId: form.tableId,
        notes: form.notes || undefined,
        couponCode,
      });
      cart.clear();
      setCouponCode(null);
      setQuote(null);
      activeOrder.remember(order);
      setView('tracking');
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Render ── */
  if (status === 'loading') {
    return (
      <div className="boot-screen">
        <div className="boot-spinner" />
        <p>Setting the table…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="boot-screen error">
        <span className="boot-icon">😕</span>
        <h1>We couldn&apos;t load the menu</h1>
        <p>{error}</p>
        <button className="btn-continue" onClick={() => window.location.reload()}>Try again</button>
      </div>
    );
  }

  if (view === 'tracking' && activeOrder.order) {
    return (
      <OrderTracker
        order={activeOrder.order}
        restaurant={restaurant}
        onDone={() => {
          // A finished order has nothing left to track — stop offering it.
          if (!activeOrder.isActive) activeOrder.forget();
          setView('menu');
        }}
      />
    );
  }

  const symbol = restaurant.currencySymbol;

  return (
    <div className="app">
      <Header
        restaurant={restaurant}
        categories={categories}
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
        search={search}
        onSearchChange={setSearch}
        cartCount={cart.totals.count}
        onOpenCart={() => setView('cart')}
        tableLabel={presetTable?.label}
        activeOrder={activeOrder.order}
        onTrackOrder={() => setView('tracking')}
      />

      <main className="main-content">
        {resultCount === 0 ? (
          <div className="empty-menu">
            <span className="empty-icon">🍴</span>
            <p>Nothing matches “{search}”</p>
            <button className="btn-text" onClick={() => { setSearch(''); setActiveCategory('All'); }}>
              Clear filters
            </button>
          </div>
        ) : (
          visibleCategories.map((category) => (
            <section key={category.id} className="category-section">
              <div className="category-section-header">
                <span>{category.icon} {category.name}</span>
                <span className="category-section-count">{category.items.length}</span>
              </div>
              <div className="menu-grid">
                {category.items.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={{ ...item, categoryName: category.name, categoryIcon: category.icon }}
                    currencySymbol={symbol}
                    quantityOf={cart.quantityOf}
                    onAdd={handleAdd}
                    onChangeQty={handleChangeQtyByItem}
                    onOpen={setDetailItem}
                  />
                ))}
              </div>
            </section>
          ))
        )}

        <footer className="menu-footer">
          <p>{restaurant.logoEmoji} {restaurant.name}</p>
          {restaurant.address && <p>{restaurant.address}{restaurant.city ? `, ${restaurant.city}` : ''}</p>}
          {restaurant.phone && <p>{restaurant.phone}</p>}
          <p className="menu-footer-hours">Open {restaurant.openingTime} – {restaurant.closingTime}</p>
        </footer>
      </main>

      {/* Sticky bar so the cart is always one tap away on mobile. */}
      {cart.totals.count > 0 && view === 'menu' && (
        <button className="floating-cart" onClick={() => setView('cart')}>
          <span className="floating-cart-count">{cart.totals.count}</span>
          <span>View cart</span>
          <span className="floating-cart-total">
            {formatCurrency(quote?.totalAmount ?? cart.totals.subtotal, symbol)}
          </span>
        </button>
      )}

      {detailItem && (
        <ItemDetailSheet
          item={detailItem}
          currencySymbol={symbol}
          quantityOf={cart.quantityOf}
          onAdd={handleAdd}
          onChangeQty={handleChangeQtyByItem}
          onClose={() => setDetailItem(null)}
        />
      )}

      {view === 'cart' && (
        <CartSidebar
          lines={cart.lines}
          totals={cart.totals}
          currencySymbol={symbol}
          quote={quote}
          quoteError={quoteError}
          isAcceptingOrders={restaurant.isAcceptingOrders}
          closedMessage={restaurant.closedMessage}
          onChangeQty={cart.changeQty}
          onRemove={cart.remove}
          onClose={() => setView('menu')}
          onCheckout={() => setView('checkout')}
        />
      )}

      {view === 'checkout' && (
        <CheckoutSheet
          quote={quote}
          totals={cart.totals}
          currencySymbol={symbol}
          tables={tables}
          presetTable={presetTable}
          submitting={submitting}
          error={submitError}
          onApplyCoupon={setCouponCode}
          onClose={() => setView('cart')}
          onSubmit={handleSubmitOrder}
        />
      )}

      {toast && <div className={`toast ${toast.tone}`}>{toast.message}</div>}
    </div>
  );
}
