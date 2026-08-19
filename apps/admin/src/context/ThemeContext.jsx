import { useCallback, useEffect, useMemo, useState } from 'react';
import { ThemeContext, THEME_STORAGE_KEY } from './theme-context';

/**
 * Light or dark for the admin portal.
 *
 * A device preference, not a restaurant setting: the same manager may want dark
 * on the kitchen tablet at night and light on a laptop by a window, and two
 * staff sharing a restaurant should not fight over one stored value. So it lives
 * in localStorage and is never sent to the API.
 *
 * "system" is the default and stays live — following the OS as it switches at
 * dusk, rather than sampling it once at sign-in.
 */
const prefersLight = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches;

function readPreference() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return ['dark', 'light', 'system'].includes(stored) ? stored : 'system';
  } catch {
    return 'system';                       // private mode, or storage disabled
  }
}

export function ThemeProvider({ children }) {
  const [preference, setStored] = useState(readPreference);
  const [systemTheme, setSystemTheme] = useState(() => (prefersLight() ? 'light' : 'dark'));

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (event) => setSystemTheme(event.matches ? 'light' : 'dark');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const theme = preference === 'system' ? systemTheme : preference;

  /**
   * Resolved in JS and always written out explicitly, so the stylesheet needs
   * one block per theme rather than a third set of rules duplicating the light
   * palette inside a prefers-color-scheme query.
   */
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // Lets native controls, scrollbars and form widgets match.
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  const setPreference = useCallback((next) => {
    setStored(next);
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* nothing to do */ }
  }, []);

  const value = useMemo(
    () => ({ preference, setPreference, theme }),
    [preference, setPreference, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
