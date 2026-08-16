import { useMemo, useState } from 'react';
import { formatCurrency, SPICE_LABELS } from '@shared';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useAuth } from '../context/auth-context';
import { useToast } from '../components/toast-context';
import Modal, { ConfirmModal } from '../components/Modal';
import ImagePicker from '../components/ImagePicker';
import { Card, EmptyState, ErrorState, Spinner } from '../components/States';

const EMPTY_ITEM = {
  name: '', description: '', categoryId: '', image: null,
  basePrice: '', variants: [], isVeg: true, isAvailable: true,
  isFeatured: false, spiceLevel: 0, prepTimeMins: 10,
};

export default function MenuManager() {
  const { user, can } = useAuth();
  const toast = useToast();
  const symbol = user.restaurant?.currencySymbol || '₹';
  const editable = can('PLATFORM_ADMIN', 'OWNER', 'MANAGER');

  const categories = useApi((signal) => api.categories(signal), []);
  const [categoryFilter, setCategoryFilter] = useState('');
  const items = useApi((signal) => api.menuItems({ categoryId: categoryFilter }, signal), [categoryFilter]);

  const [itemModal, setItemModal] = useState(null);       // { mode, item }
  const [categoryModal, setCategoryModal] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    const list = items.data?.items ?? [];
    const byCategory = new Map();
    for (const item of list) {
      const key = item.category.id;
      if (!byCategory.has(key)) byCategory.set(key, { category: item.category, items: [] });
      byCategory.get(key).items.push(item);
    }
    return [...byCategory.values()];
  }, [items.data]);

  async function toggleAvailability(item) {
    try {
      await api.setAvailability(item.id, !item.isAvailable);
      toast.success(`${item.name} is now ${item.isAvailable ? 'unavailable' : 'available'}`);
      items.reload();
    } catch (err) { toast.error(err.message); }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      if (deleting.kind === 'item') {
        await api.deleteItem(deleting.id);
        items.reload();
      } else {
        await api.deleteCategory(deleting.id);
        categories.reload();
        items.reload();
      }
      toast.success('Deleted');
      setDeleting(null);
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  }

  if (categories.loading) return <Spinner label="Loading your menu…" />;
  if (categories.error) return <ErrorState message={categories.error} onRetry={categories.reload} />;

  const categoryList = categories.data.categories;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Menu</h1>
          <p className="page-sub">
            {categoryList.length} categories · {items.data?.items.length ?? 0} items.
            Changes appear on the customer app immediately.
          </p>
        </div>
        {editable && (
          <div className="page-actions">
            <button className="btn btn-ghost" onClick={() => setCategoryModal({ mode: 'create' })}>+ Category</button>
            <button className="btn btn-primary" onClick={() => setItemModal({ mode: 'create', item: EMPTY_ITEM })}>
              + Add item
            </button>
          </div>
        )}
      </header>

      <div className="filter-bar">
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {categoryList.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name} ({c.itemCount})</option>)}
        </select>
      </div>

      <Card title="Categories" bodyClass="no-pad">
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Category</th><th className="num">Items</th><th>Status</th>{editable && <th />}</tr></thead>
            <tbody>
              {categoryList.map((category) => (
                <tr key={category.id}>
                  <td><span className="cat-icon">{category.icon}</span> <strong>{category.name}</strong></td>
                  <td className="num">{category.itemCount}</td>
                  <td>{category.isActive
                    ? <span className="pill-good">Visible</span>
                    : <span className="pill-muted">Hidden</span>}</td>
                  {editable && (
                    <td className="row-actions">
                      <button className="link-btn" onClick={() => setCategoryModal({ mode: 'edit', category })}>Edit</button>
                      <button className="link-btn danger"
                        onClick={() => setDeleting({ kind: 'category', id: category.id, name: category.name })}>
                        Delete
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {items.loading ? <Spinner /> : grouped.length === 0 ? (
        <EmptyState icon="🍽️" title="No items yet"
          message="Add your first dish to start taking orders."
          action={editable && <button className="btn btn-primary" onClick={() => setItemModal({ mode: 'create', item: EMPTY_ITEM })}>+ Add item</button>} />
      ) : grouped.map(({ category, items: list }) => (
        <Card key={category.id} title={`${category.icon} ${category.name}`} subtitle={`${list.length} items`}>
          <div className="item-grid">
            {list.map((item) => (
              <article key={item.id} className={`item-tile ${item.isAvailable ? '' : 'off'}`}>
                <div className="item-tile-top">
                  <span className={`veg-dot ${item.isVeg ? 'veg' : 'nonveg'}`} title={item.isVeg ? 'Veg' : 'Non-veg'} />
                  <strong className="item-tile-name">{item.name}</strong>
                  {item.isFeatured && <span className="tag-featured">★</span>}
                </div>

                {item.description && <p className="item-tile-desc">{item.description}</p>}

                <div className="item-tile-prices">
                  {item.variants.length > 0
                    ? item.variants.map((v) => (
                        <span key={v.label} className="price-tag">{v.label} {formatCurrency(v.price, symbol)}</span>
                      ))
                    : <span className="price-tag">{formatCurrency(item.basePrice, symbol)}</span>}
                </div>

                <div className="item-tile-meta">
                  <span>⏱ {item.prepTimeMins}m</span>
                  {item.spiceLevel > 0 && <span>{'🌶'.repeat(item.spiceLevel)} {SPICE_LABELS[item.spiceLevel]}</span>}
                  <span>{item.timesOrdered} sold</span>
                </div>

                {editable && (
                  <div className="item-tile-actions">
                    <button
                      className={`switch ${item.isAvailable ? 'on' : ''}`}
                      onClick={() => toggleAvailability(item)}
                      title={item.isAvailable ? 'Mark unavailable' : 'Mark available'}
                    >
                      <span className="switch-knob" />
                    </button>
                    <span className="switch-label">{item.isAvailable ? 'Available' : 'Sold out'}</span>
                    <button className="link-btn" onClick={() => setItemModal({ mode: 'edit', item })}>Edit</button>
                    <button className="link-btn danger"
                      onClick={() => setDeleting({ kind: 'item', id: item.id, name: item.name })}>Delete</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </Card>
      ))}

      {itemModal && (
        <ItemModal
          mode={itemModal.mode}
          initial={itemModal.item}
          categories={categoryList}
          symbol={symbol}
          onClose={() => setItemModal(null)}
          onSaved={() => { setItemModal(null); items.reload(); categories.reload(); }}
        />
      )}

      {categoryModal && (
        <CategoryModal
          mode={categoryModal.mode}
          initial={categoryModal.category}
          onClose={() => setCategoryModal(null)}
          onSaved={() => { setCategoryModal(null); categories.reload(); items.reload(); }}
        />
      )}

      {deleting && (
        <ConfirmModal
          title={`Delete “${deleting.name}”?`}
          message={deleting.kind === 'item'
            ? 'Past orders keep their record — only the menu entry is removed. This cannot be undone.'
            : 'The category must be empty. Move its items elsewhere first.'}
          confirmLabel="Delete"
          busy={busy}
          onConfirm={handleDelete}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  );
}

/* ───────────────────────── Item form ───────────────────────── */

function ItemModal({ mode, initial, categories, symbol, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => ({
    ...EMPTY_ITEM,
    ...initial,
    categoryId: initial.categoryId || initial.category?.id || categories[0]?.id || '',
    basePrice: initial.basePrice ?? '',
    description: initial.description ?? '',
    // An item may carry an upload, an older external URL, or neither.
    image: initial.image
      ? { ...initial.image, url: initial.imageUrl }
      : initial.imageUrl ? { url: initial.imageUrl, legacy: true } : null,
    variants: (initial.variants ?? []).map((v) => ({ label: v.label, price: String(v.price) })),
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const usesVariants = form.variants.length > 0;
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const setVariant = (index, field, value) =>
    setForm((f) => ({
      ...f,
      variants: f.variants.map((v, i) => (i === index ? { ...v, [field]: value } : v)),
    }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const payload = {
      categoryId: form.categoryId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      // Uploads win; a legacy external URL is preserved until it is replaced.
      imageId: form.image && !form.image.legacy ? form.image.id : null,
      imageUrl: form.image?.legacy ? form.image.url : null,
      isVeg: form.isVeg,
      isAvailable: form.isAvailable,
      isFeatured: form.isFeatured,
      spiceLevel: Number(form.spiceLevel),
      prepTimeMins: Number(form.prepTimeMins),
      // Variants and a base price are mutually exclusive — send only the one in use.
      variants: usesVariants
        ? form.variants.map((v) => ({ label: v.label.trim(), price: Number(v.price) }))
        : [],
      basePrice: usesVariants ? null : Number(form.basePrice),
    };

    if (!payload.name) return setError('Give the item a name.');
    if (usesVariants) {
      if (payload.variants.some((v) => !v.label || !Number.isFinite(v.price) || v.price < 0)) {
        return setError('Every size needs a label and a valid price.');
      }
      const labels = payload.variants.map((v) => v.label.toLowerCase());
      if (new Set(labels).size !== labels.length) return setError('Size labels must be unique.');
    } else if (!Number.isFinite(payload.basePrice) || payload.basePrice < 0) {
      return setError('Enter a valid price, or add sizes instead.');
    }

    setBusy(true);
    try {
      if (mode === 'create') await api.createItem(payload);
      else await api.updateItem(initial.id, payload);
      toast.success(mode === 'create' ? 'Item added' : 'Item updated');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={mode === 'create' ? 'Add menu item' : `Edit ${initial.name}`}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Saving…' : 'Save item'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="form">
        <div className="field">
          <label>Name <span className="req">*</span></label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Veg Hakka Noodles" autoFocus maxLength={80} />
        </div>

        <div className="field-row">
          <div className="field">
            <label>Category <span className="req">*</span></label>
            <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Prep time (min)</label>
            <input type="number" min="1" max="120" value={form.prepTimeMins}
              onChange={(e) => set('prepTimeMins', e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label>Description</label>
          <textarea value={form.description} onChange={(e) => set('description', e.target.value)}
            rows={2} maxLength={300} placeholder="Shown under the name on the customer app" />
        </div>

        <ImagePicker
          kind="menu"
          label={<>Photo <span className="optional">optional</span></>}
          value={form.image}
          onChange={(image) => set('image', image)}
        />
        <p className="field-hint" style={{ marginTop: '-0.5rem', marginBottom: '0.9rem' }}>
          Every photo is cropped to the same shape, so the menu grid stays even.
          Without one, the category icon is shown.
        </p>

        {/* Pricing: either one price, or a set of sizes. */}
        <div className="field">
          <label>Pricing</label>
          <div className="pricing-toggle">
            <button type="button" className={`seg ${!usesVariants ? 'active' : ''}`}
              onClick={() => set('variants', [])}>Single price</button>
            <button type="button" className={`seg ${usesVariants ? 'active' : ''}`}
              onClick={() => usesVariants || set('variants', [{ label: 'Half', price: '' }, { label: 'Full', price: '' }])}>
              Sizes
            </button>
          </div>
        </div>

        {usesVariants ? (
          <div className="variant-editor">
            {form.variants.map((variant, index) => (
              <div key={index} className="variant-row">
                <input placeholder="Size (e.g. Half)" value={variant.label}
                  onChange={(e) => setVariant(index, 'label', e.target.value)} maxLength={30} />
                <input type="number" min="0" step="1" placeholder={`Price (${symbol})`} value={variant.price}
                  onChange={(e) => setVariant(index, 'price', e.target.value)} />
                <button type="button" className="icon-btn"
                  onClick={() => set('variants', form.variants.filter((_, i) => i !== index))}
                  aria-label="Remove size">✕</button>
              </div>
            ))}
            {form.variants.length < 6 && (
              <button type="button" className="link-btn"
                onClick={() => set('variants', [...form.variants, { label: '', price: '' }])}>
                + Add another size
              </button>
            )}
          </div>
        ) : (
          <div className="field">
            <label>Price ({symbol}) <span className="req">*</span></label>
            <input type="number" min="0" step="1" value={form.basePrice}
              onChange={(e) => set('basePrice', e.target.value)} placeholder="0" />
          </div>
        )}

        <div className="field-row">
          <div className="field">
            <label>Spice level</label>
            <select value={form.spiceLevel} onChange={(e) => set('spiceLevel', e.target.value)}>
              <option value={0}>None</option>
              <option value={1}>Mild</option>
              <option value={2}>Medium</option>
              <option value={3}>Hot</option>
            </select>
          </div>
          <div className="field">
            <label>Diet</label>
            <select value={form.isVeg ? 'veg' : 'nonveg'} onChange={(e) => set('isVeg', e.target.value === 'veg')}>
              <option value="veg">Vegetarian</option>
              <option value="nonveg">Non-vegetarian</option>
            </select>
          </div>
        </div>

        <div className="checkbox-row">
          <label className="checkbox">
            <input type="checkbox" checked={form.isAvailable}
              onChange={(e) => set('isAvailable', e.target.checked)} />
            Available to order
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={form.isFeatured}
              onChange={(e) => set('isFeatured', e.target.checked)} />
            Mark as popular
          </label>
        </div>

        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}

/* ───────────────────────── Category form ───────────────────────── */

const ICON_CHOICES = ['🍴', '🍜', '🥪', '🍝', '☕', '🥤', '🧃', '💧', '🍰', '🍕', '🍔', '🍛', '🥗', '🍟', '🥟', '🍩'];

function CategoryModal({ mode, initial, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    icon: initial?.icon ?? '🍴',
    isActive: initial?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError('Give the category a name.');
    setBusy(true);
    setError(null);
    try {
      if (mode === 'create') await api.createCategory({ ...form, name: form.name.trim() });
      else await api.updateCategory(initial.id, { ...form, name: form.name.trim() });
      toast.success(mode === 'create' ? 'Category added' : 'Category updated');
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <Modal
      title={mode === 'create' ? 'New category' : `Edit ${initial.name}`}
      onClose={onClose}
      width={420}
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
          <label>Name <span className="req">*</span></label>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Desserts" autoFocus maxLength={50} />
        </div>
        <div className="field">
          <label>Icon</label>
          <div className="icon-picker">
            {ICON_CHOICES.map((icon) => (
              <button key={icon} type="button"
                className={`icon-choice ${form.icon === icon ? 'active' : ''}`}
                onClick={() => setForm((f) => ({ ...f, icon }))}>{icon}</button>
            ))}
          </div>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={form.isActive}
            onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
          Show on the customer menu
        </label>
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}
