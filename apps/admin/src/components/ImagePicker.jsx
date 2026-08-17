import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from './toast-context';
import Modal from './Modal';

/**
 * Pick a photo, crop it to a fixed shape, and upload it.
 *
 * The aspect ratio is fixed rather than offered as a choice: menu cards sit in a
 * grid, and one portrait photo among twenty landscape ones is what makes a menu
 * look untidy. The crop is the only place a person can influence framing, which
 * is also the only thing they actually care about.
 *
 * Everything is resized and re-encoded here, before upload — a phone photo is
 * several megapixels and a few megabytes, and none of that survives being drawn
 * into a 800px card. What reaches the server is tens of kilobytes.
 */

const OUTPUT = {
  menu: { width: 800, height: 600, aspect: 4 / 3, label: '4:3 — matches the menu cards' },
  logo: { width: 512, height: 512, aspect: 1, label: 'Square — matches the header mark' },
  /**
   * Wider and larger than the others: this one is stretched across the full
   * width of a phone and often of a laptop, where a 800px crop would show its
   * pixels. 16:9 is what a phone camera hands back in landscape, so the crop
   * usually costs the owner nothing.
   */
  hero: { width: 1600, height: 900, aspect: 16 / 9, label: '16:9 — spans the top of your menu' },
};

/**
 * The server's ceiling, less a little headroom for the base64 overhead of the
 * request body. Kept in step with MAX_BYTES in server/src/routes/admin/images.js.
 */
const BUDGET_BYTES = 560 * 1024;

/** Bytes a base64 data URL actually carries, without decoding it. */
function byteLength(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor(base64.length * 0.75);
}

/**
 * WebP where supported; a canvas silently returns PNG otherwise, which we detect.
 *
 * Quality steps down until the result fits the server's ceiling. A 4:3 menu crop
 * is comfortably inside it at first ask, but a busy 16:9 hero photo — a crowded
 * room, a lot of fine detail — can exceed it, and an owner should not be told to
 * "try a smaller one" when re-encoding is what is actually needed.
 */
function encode(canvas) {
  const type = canvas.toDataURL('image/webp', 0.8).startsWith('data:image/webp')
    ? 'image/webp'
    : 'image/jpeg';

  let out = '';
  for (const quality of [0.82, 0.72, 0.62, 0.52]) {
    out = canvas.toDataURL(type, quality);
    if (byteLength(out) <= BUDGET_BYTES) return out;
  }
  return out;   // best effort; the server will say so if it is still too big
}

/**
 * `immediate` says whether choosing a picture is the whole action.
 *
 * It usually is not: the upload puts bytes in the library, and the surrounding
 * form's Save is what attaches them. Saying "Image added" at upload time read as
 * finished, so logos were picked, left unsaved, and reported as not working —
 * with a stranded row in the images table for each attempt.
 */
export default function ImagePicker({ kind = 'menu', value, onChange, label = 'Photo', immediate = false }) {
  const toast = useToast();
  const spec = OUTPUT[kind];
  const fileRef = useRef(null);
  const [source, setSource] = useState(null);   // { src, name }
  const [busy, setBusy] = useState(false);

  function choose(e) {
    const file = e.target.files?.[0];
    e.target.value = '';                        // so re-picking the same file fires
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Choose an image file');
    if (file.size > 20 * 1024 * 1024) return toast.error('That image is over 20MB — try a smaller one');

    const reader = new FileReader();
    reader.onload = () => setSource({ src: reader.result, name: file.name });
    reader.onerror = () => toast.error("That file couldn't be read");
    reader.readAsDataURL(file);
  }

  async function upload(dataUrl) {
    setBusy(true);
    try {
      const { image } = await api.uploadImage({ dataUrl, width: spec.width, height: spec.height });
      onChange(image);
      setSource(null);
      // When the caller applies it itself, it owns the outcome message too.
      if (!immediate) toast.success('Image uploaded — press Save to apply it');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field">
      <label>{label}</label>

      {value?.url ? (
        <div className="image-current">
          <img src={value.url} alt="" className={`image-thumb ${kind}`} />
          <div className="image-meta">
            <span>{value.width}×{value.height}</span>
            {value.sizeBytes ? <span>{Math.round(value.sizeBytes / 1024)}KB</span> : null}
            <div className="image-actions">
              <button type="button" className="link-btn" onClick={() => fileRef.current?.click()}>Replace</button>
              <button type="button" className="link-btn danger" onClick={() => onChange(null)}>Remove</button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" className="image-drop" onClick={() => fileRef.current?.click()}>
          <span className="image-drop-icon" aria-hidden>⬆</span>
          <strong>Upload a photo</strong>
          <span>{spec.label}</span>
        </button>
      )}

      {!immediate && value?.url && (
        <span className="field-hint">Applied when you press Save on this section.</span>
      )}

      <input ref={fileRef} type="file" accept="image/*" hidden onChange={choose} />

      {source && (
        <Cropper
          src={source.src}
          spec={spec}
          busy={busy}
          onCancel={() => setSource(null)}
          onDone={upload}
        />
      )}
    </div>
  );
}

/**
 * Drag to move, slider to zoom. The image is drawn into a fixed-aspect window;
 * whatever fills that window is what gets kept.
 */
function Cropper({ src, spec, busy, onCancel, onDone }) {
  const [img, setImg] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const frameRef = useRef(null);
  const drag = useRef(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = src;
  }, [src]);

  /** Smallest zoom that still covers the window — never leave a transparent edge. */
  const baseScale = useCallback((frameW, frameH) => {
    if (!img) return 1;
    return Math.max(frameW / img.width, frameH / img.height);
  }, [img]);

  /** Keep the image covering the window after any pan or zoom. */
  const clamp = useCallback((next, scale) => {
    const frame = frameRef.current;
    if (!frame || !img) return next;
    const w = img.width * scale;
    const h = img.height * scale;
    const maxX = Math.max(0, (w - frame.clientWidth) / 2);
    const maxY = Math.max(0, (h - frame.clientHeight) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }, [img]);

  useEffect(() => {
    if (!img || !frameRef.current) return;
    setOffset({ x: 0, y: 0 });
    setZoom(1);
  }, [img]);

  const scaleNow = () => {
    const frame = frameRef.current;
    if (!frame) return 1;
    return baseScale(frame.clientWidth, frame.clientHeight) * zoom;
  };

  function onPointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: offset };
  }
  function onPointerMove(e) {
    if (!drag.current) return;
    const next = {
      x: drag.current.start.x + (e.clientX - drag.current.x),
      y: drag.current.start.y + (e.clientY - drag.current.y),
    };
    setOffset(clamp(next, scaleNow()));
  }
  const onPointerUp = () => { drag.current = null; };

  function changeZoom(z) {
    setZoom(z);
    setOffset((o) => clamp(o, baseScale(frameRef.current.clientWidth, frameRef.current.clientHeight) * z));
  }

  /** Redraws the visible window at output resolution and hands back a data URL. */
  function apply() {
    const frame = frameRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = spec.width;
    canvas.height = spec.height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    // White beneath, so a transparent PNG doesn't turn black once flattened.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scale = scaleNow();
    const outputScale = spec.width / frame.clientWidth;
    const drawW = img.width * scale * outputScale;
    const drawH = img.height * scale * outputScale;
    const x = (canvas.width - drawW) / 2 + offset.x * outputScale;
    const y = (canvas.height - drawH) / 2 + offset.y * outputScale;

    ctx.drawImage(img, x, y, drawW, drawH);
    onDone(encode(canvas));
  }

  const scale = img && frameRef.current ? scaleNow() : 1;

  return (
    <Modal
      title="Crop the photo"
      subtitle={spec.label}
      width={480}
      onClose={busy ? () => {} : onCancel}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={apply} disabled={busy || !img}>
            {busy ? 'Uploading…' : 'Use this crop'}
          </button>
        </>
      }
    >
      <div
        className="crop-frame"
        ref={frameRef}
        style={{ aspectRatio: String(spec.aspect) }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {img && (
          <img
            src={src}
            alt=""
            draggable={false}
            className="crop-image"
            style={{
              width: img.width * scale,
              height: img.height * scale,
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
            }}
          />
        )}
        <div className="crop-grid" aria-hidden />
      </div>

      <div className="crop-controls">
        <span className="block-label">Zoom</span>
        <input type="range" min="1" max="3" step="0.01" value={zoom}
          onChange={(e) => changeZoom(Number(e.target.value))} />
        <p className="field-hint">Drag the photo to reposition it. Everything inside the frame is kept.</p>
      </div>
    </Modal>
  );
}
