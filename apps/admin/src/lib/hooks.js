import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Loads data from an API call, with a manual `reload` for after mutations.
 * Aborts in flight requests on unmount so a slow response can't set state on a
 * dead component.
 */
export function useApi(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    loaderRef.current(controller.signal)
      .then((data) => { if (!cancelled) setState({ data, loading: false, error: null }); })
      .catch((err) => {
        if (cancelled || err.name === 'AbortError') return;
        setState({ data: null, loading: false, error: err.message });
      });

    return () => { cancelled = true; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}

/**
 * Re-runs `loader` on an interval. Used by the live order board — polling keeps
 * the deployment story simple (no websocket server to host per client).
 */
export function usePolling(loader, intervalMs, enabled = true) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const refresh = useCallback(async (signal) => {
    try {
      const next = await loaderRef.current(signal);
      setData(next);
      setError(null);
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    refresh(controller.signal);
    const id = setInterval(() => refresh(controller.signal), intervalMs);
    return () => { clearInterval(id); controller.abort(); };
  }, [enabled, intervalMs, refresh]);

  return { data, error, loading, refresh: () => refresh() };
}

/** Delays a fast-changing value — used for search boxes. */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Fires a short beep for newly arrived orders, via WebAudio so no asset is needed. */
/**
 * Tracks a media query, so a component can lay itself out differently on a
 * phone rather than only restyling itself.
 *
 * Some layout differences cannot be expressed in CSS: the kitchen board shows
 * one status column at a time on a phone, and which one is React state. Hiding
 * the other columns with CSS would leave them mounted and their orders still in
 * the scroll height, which is the problem being solved.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (event) => setMatches(event.matches);
    setMatches(mql.matches);            // the query may have changed with `query`
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export function useOrderChime() {
  const contextRef = useRef(null);

  return useCallback(() => {
    try {
      contextRef.current ||= new (window.AudioContext || window.webkitAudioContext)();
      const ctx = contextRef.current;
      // Browsers suspend audio until a user gesture; resume is a no-op if running.
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      [880, 1174].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + i * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.16, now + i * 0.16 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + i * 0.16);
        osc.stop(now + i * 0.16 + 0.25);
      });
    } catch { /* audio unavailable — the visual badge still updates */ }
  }, []);
}
