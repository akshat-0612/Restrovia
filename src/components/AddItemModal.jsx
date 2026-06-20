import { useState } from 'react';

const CATEGORIES = ['Coffee', 'Tea', 'Snacks', 'Desserts', 'Meals', 'Drinks', 'Bakery', 'Other'];

const EMPTY_FORM = { name: '', description: '', price: '', category: 'Coffee' };

export default function AddItemModal({ onAdd, onClose }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) return setError('Item name is required.');
    if (!form.price || isNaN(form.price) || Number(form.price) <= 0)
      return setError('Enter a valid price.');
    onAdd({ ...form, id: Date.now(), price: Number(form.price) });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Menu Item</h2>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label>Item Name</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. Cappuccino"
                autoFocus
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Price (₹)</label>
                <input
                  name="price"
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.price}
                  onChange={handleChange}
                  placeholder="0.00"
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select name="category" value={form.category} onChange={handleChange}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="Short description (optional)"
              />
            </div>

            {error && (
              <p style={{ color: '#c0392b', fontSize: '0.8rem', marginTop: '-0.5rem' }}>{error}</p>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-submit">Add Item</button>
          </div>
        </form>
      </div>
    </div>
  );
}
