import { useState } from 'react';
import { api } from '../lib/api';
import { useToast } from './toast-context';
import ImagePicker from './ImagePicker';

/**
 * The restaurant's own photographs — the room, the counter, the terrace — and
 * the order customers see them in.
 *
 * Every action here writes immediately rather than waiting for a Save. The rest
 * of this page edits one record field at a time, but a gallery is a list: an
 * owner who uploads three photos, reorders them and then forgets to save has
 * lost work in a way that changing a tax percent never does.
 *
 * The first photo is the hero, which is the whole reason reordering exists —
 * it is how someone puts their best picture first without re-uploading anything.
 */
export default function StorefrontPhotos({ photos, onChange, max = 8 }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function add(image) {
    if (!image) return;
    setBusy(true);
    try {
      const { photo } = await api.addStorefrontPhoto({ imageId: image.id });
      onChange([...photos, photo]);
      toast.success('Photo added to your storefront');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(photo) {
    setBusy(true);
    try {
      await api.deleteStorefrontPhoto(photo.id);
      onChange(photos.filter((p) => p.id !== photo.id));
      toast.success('Photo removed');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  /** Swaps a photo with its neighbour, then sends the whole resulting order. */
  async function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= photos.length) return;

    const next = [...photos];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);                            // optimistic: the drag should feel instant

    setBusy(true);
    try {
      const { photos: saved } = await api.reorderStorefrontPhotos(next.map((p) => p.id));
      onChange(saved);
    } catch (err) {
      onChange(photos);                        // put it back rather than lie about the order
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveCaption(photo, caption) {
    const trimmed = caption.trim();
    if (trimmed === (photo.caption || '')) return;
    try {
      const { photo: saved } = await api.updateStorefrontPhoto(photo.id, { caption: trimmed });
      onChange(photos.map((p) => (p.id === photo.id ? saved : p)));
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="form">
      {photos.length > 0 && (
        <ul className="photo-list">
          {photos.map((photo, index) => (
            <li key={photo.id} className="photo-row">
              <img src={photo.image.url} alt="" className="photo-thumb" />

              <div className="photo-fields">
                {index === 0
                  ? <span className="photo-tag hero">Hero — shown first</span>
                  : <span className="photo-tag">Photo {index + 1}</span>}
                <input
                  defaultValue={photo.caption ?? ''}
                  placeholder="Caption (optional) — e.g. Our terrace, open till 11"
                  maxLength={80}
                  onBlur={(e) => saveCaption(photo, e.target.value)}
                />
                <span className="field-hint">
                  {photo.image.width}×{photo.image.height} · {Math.round(photo.image.sizeBytes / 1024)}KB
                </span>
              </div>

              <div className="photo-actions">
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy || index === 0}
                  onClick={() => move(index, -1)} aria-label="Move earlier">↑</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy || index === photos.length - 1}
                  onClick={() => move(index, +1)} aria-label="Move later">↓</button>
                <button type="button" className="link-btn danger" disabled={busy}
                  onClick={() => remove(photo)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {photos.length < max ? (
        <ImagePicker
          kind="hero"
          label={photos.length === 0 ? 'Add your first photo' : 'Add another photo'}
          value={null}
          onChange={add}
          immediate
        />
      ) : (
        <p className="field-hint">
          You have the maximum of {max} photos. Remove one to add another.
        </p>
      )}
    </div>
  );
}
