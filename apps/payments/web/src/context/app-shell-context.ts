import { createContext, useContext } from 'react';
import type { TabId } from '../components/layout/sidebar';

export type OverlayPhase = 'deposit' | 'success' | null;

export interface AppShellContextValue {
  activeTab: TabId;
  selectTab: (tab: TabId) => void;
  isDark: boolean;
  toggleTheme: () => void;
  openDeposit: () => void;
  openWithdraw: () => void;
  openHowItWorks: () => void;
  refreshBalance: () => Promise<void>;
  handleDeposited: () => Promise<void>;
  /**
   * On-chain seller status for the current signer. `isSeller` is derived from
   * a non-zero stake on the AntseedStaking contract. Defaults to false while
   * the seller-status query is in flight — UI must treat the seller as a
   * minority case, never blocking buyer flows on it.
   */
  isSeller: boolean;
}

export const AppShellContext = createContext<AppShellContextValue | null>(null);

export function useAppShell(): AppShellContextValue {
  const ctx = useContext(AppShellContext);
  if (!ctx) {
    throw new Error('useAppShell must be used inside <AppShell>');
  }
  return ctx;
}
