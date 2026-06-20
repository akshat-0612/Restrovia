import { useState, useMemo } from 'react';
import './App.css';
import menuData from './data/menu.json';
import MenuItemCard from './components/MenuItemCard';
import CartSidebar from './components/CartSidebar';
import OrderSuccess from './components/OrderSuccess';
import ItemDetailSheet from './components/ItemDetailSheet';

function generateOrderId() {
  return 'DC' + Date.now().toString().slice(-6);
}

export default function App() {
  const [cartItems, setCartItems]       = useState([]);
  const [showCart, setShowCart]         = useState(false);
  const [orderInfo, setOrderInfo]       = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery]   = useState('');
  const [selectedItem, setSelectedItem] = useState(null);

  const categories = menuData.categories;
  const allItems   = menuData.items;

  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const cat of categories) {
      counts[cat] = allItems.filter((i) => i.category === cat).length;
    }
    return counts;
  }, [allItems, categories]);

  const filteredItems = useMemo(() => {
    let items = allItems;
    if (activeCategory !== 'All') {
      items = items.filter((i) => i.category === activeCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.description && i.description.toLowerCase().includes(q)) ||
          i.category.toLowerCase().includes(q)
      );
    }
    return items;
  }, [allItems, activeCategory, searchQuery]);

  // Group filtered items by category, preserving category order
  const groupedItems = useMemo(() => {
    const groups = [];
    for (const cat of categories) {
      const items = filteredItems.filter((i) => i.category === cat);
      if (items.length > 0) groups.push({ category: cat, items });
    }
    // items that don't match any known category (edge case)
    const knownCats = new Set(categories);
    const others = filteredItems.filter((i) => !knownCats.has(i.category));
    if (others.length > 0) groups.push({ category: 'Other', items: others });
    return groups;
  }, [filteredItems, categories]);

  const cartCount = cartItems.reduce((s, i) => s + i.qty, 0);

  function handleAddToCart(item, variant) {
    const cartKey = variant ? `${item.id}_${variant.label}` : `${item.id}`;
    const price   = variant ? variant.price : item.price;
    setCartItems((prev) => {
      const existing = prev.find((ci) => ci.cartKey === cartKey);
      if (existing) {
        return prev.map((ci) =>
          ci.cartKey === cartKey ? { ...ci, qty: ci.qty + 1 } : ci
        );
      }
      return [
        ...prev,
        { cartKey, id: item.id, name: item.name, category: item.category,
          variant: variant ? variant.label : null, price, qty: 1 },
      ];
    });
  }

  function handleUpdateQty(cartKey, delta) {
    setCartItems((prev) =>
      prev
        .map((ci) => ci.cartKey === cartKey ? { ...ci, qty: ci.qty + delta } : ci)
        .filter((ci) => ci.qty > 0)
    );
  }

  function handlePlaceOrder() {
    const total = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
    setOrderInfo({ orderId: generateOrderId(), total });
    setShowCart(false);
    setCartItems([]);
  }

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-top">
          <div className="header-brand">
            <div className="cafe-icon">☕</div>
            <div className="header-brand-text">
              <h1>Deshmukh</h1>
              <p>Café</p>
            </div>
          </div>
          <span className="header-menu-label">Menu</span>
          <div className="header-actions">
            <button className="btn-cart" onClick={() => setShowCart(true)}>
              🛒 Cart
              {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="search-bar-wrap">
          <div className="search-bar">
            <span>🔍</span>
            <input
              type="text"
              placeholder="Search dishes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '0.9rem' }}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Category chips */}
        <div className="category-row">
          <button
            className={`chip ${activeCategory === 'All' ? 'active' : ''}`}
            onClick={() => setActiveCategory('All')}
          >
            All Items <span className="chip-count">{allItems.length}</span>
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`chip ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat} <span className="chip-count">{categoryCounts[cat]}</span>
            </button>
          ))}
        </div>
      </header>

      {/* ── Menu grid ── */}
      <main className="main-content">
        {filteredItems.length === 0 ? (
          <div className="empty-menu">
            <span className="empty-icon">🍴</span>
            <p>No items found.</p>
          </div>
        ) : (
          groupedItems.map(({ category, items }) => (
            <div key={category} className="category-section">
              <div className="category-section-header">
                <span>{category}</span>
              </div>
              <div className="menu-grid">
                {items.map((item) => (
                  <MenuItemCard
                    key={item.id}
                    item={item}
                    cartItems={cartItems}
                    onAddToCart={handleAddToCart}
                    onUpdateQty={handleUpdateQty}
                    onCardClick={setSelectedItem}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </main>

      {/* ── Item Detail Sheet ── */}
      {selectedItem && (
        <ItemDetailSheet
          item={selectedItem}
          cartItems={cartItems}
          onAddToCart={handleAddToCart}
          onUpdateQty={handleUpdateQty}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {/* ── Cart Sidebar ── */}
      {showCart && (
        <CartSidebar
          cartItems={cartItems}
          onUpdateQty={handleUpdateQty}
          onClose={() => setShowCart(false)}
          onPlaceOrder={handlePlaceOrder}
        />
      )}

      {/* ── Order Success ── */}
      {orderInfo && (
        <OrderSuccess
          orderId={orderInfo.orderId}
          total={orderInfo.total}
          onDismiss={() => setOrderInfo(null)}
        />
      )}
    </div>
  );
}
