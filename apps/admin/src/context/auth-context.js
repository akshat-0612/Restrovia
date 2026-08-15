import { createContext, useContext } from 'react';

/**
 * Context and hook live apart from the provider component so the provider file
 * exports components only — which is what keeps fast refresh working.
 */
export const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
