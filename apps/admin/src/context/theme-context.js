import { createContext, useContext } from 'react';

/**
 * Context and hook apart from the provider, so the provider file exports
 * components only and fast refresh keeps working.
 */
export const ThemeContext = createContext(null);

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

export const THEME_CHOICES = [
  { id: 'system', label: 'Match my device', note: 'Follows your operating system setting.' },
  { id: 'dark',   label: 'Dark',            note: 'Easier in a dim kitchen or late service.' },
  { id: 'light',  label: 'Light',           note: 'Easier in daylight and on a bright counter.' },
];

export const THEME_STORAGE_KEY = 'restrovia:theme';
