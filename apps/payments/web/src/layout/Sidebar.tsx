import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PaymentConfig } from '../types';
import { usePaymentNetwork } from '../payment-network';

export type TabId = 'dashboard' | 'channels' | 'emissions' | 'diem-rewards';

interface SidebarProps {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  config: PaymentConfig | null;
}

interface NavItem {
  id: TabId;
  label: string;
  icon: ReactNode;
}

function DashboardIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1" strokeLinejoin="round"/>
      <rect x="10" y="2.5" width="5.5" height="5.5" rx="1" strokeLinejoin="round"/>
      <rect x="2.5" y="10" width="5.5" height="5.5" rx="1" strokeLinejoin="round"/>
      <rect x="10" y="10" width="5.5" height="5.5" rx="1" strokeLinejoin="round"/>
    </svg>
  );
}

function ChannelsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="4.25" width="15" height="9.5" rx="1.25"/>
      <circle cx="9" cy="9" r="2"/>
    </svg>
  );
}

function AntsTabIcon() {
  return <AntIcon size={18} />;
}

function DiemTabIcon() {
  return (
    <img
      src="/diem-logo.png"
      width="18"
      height="18"
      alt=""
      aria-hidden="true"
      decoding="async"
      className="dash-sidebar-token-icon"
    />
  );
}

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3"/><path d="M8 2V3.5M8 12.5V14M2 8H3.5M12.5 8H14M3.8 3.8L4.8 4.8M11.2 11.2L12.2 12.2M3.8 12.2L4.8 11.2M11.2 4.8L12.2 3.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M13.5 10A5.5 5.5 0 016 2.5 5.5 5.5 0 108 13.5a5.5 5.5 0 005.5-3.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
  );
}

function AntIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 9.625C14.9665 9.625 15.75 8.763 15.75 7.7C15.75 6.637 14.9665 5.775 14 5.775C13.0335 5.775 12.25 6.637 12.25 7.7C12.25 8.763 13.0335 9.625 14 9.625Z" fill="currentColor"/>
      <path d="M14 15.4C15.353 15.4 16.45 14.146 16.45 12.6C16.45 11.054 15.353 9.8 14 9.8C12.647 9.8 11.55 11.054 11.55 12.6C11.55 14.146 12.647 15.4 14 15.4Z" fill="currentColor"/>
      <path d="M14 23.45C15.74 23.45 17.15 21.57 17.15 19.25C17.15 16.93 15.74 15.05 14 15.05C12.26 15.05 10.85 16.93 10.85 19.25C10.85 21.57 12.26 23.45 14 23.45Z" fill="currentColor"/>
      <path opacity="0.6" d="M12.95 5.95L9.8 2.1" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round"/>
      <path opacity="0.6" d="M15.05 5.95L18.2 2.1" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round"/>
      <circle cx="9.8" cy="2.1" r="0.875" fill="currentColor"/>
      <circle cx="18.2" cy="2.1" r="0.875" fill="currentColor"/>
      <path opacity="0.4" d="M12.25 11.2L6.125 7.7" stroke="currentColor" strokeWidth="0.52" strokeLinecap="round"/>
      <path opacity="0.4" d="M15.75 11.2L21.875 7.7" stroke="currentColor" strokeWidth="0.52" strokeLinecap="round"/>
      <circle cx="6.3" cy="7.7" r="0.875" fill="currentColor"/>
      <circle cx="21.7" cy="7.7" r="0.875" fill="currentColor"/>
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
  { id: 'channels',  label: 'Channels',  icon: <ChannelsIcon /> },
  { id: 'emissions', label: '$ANTS', icon: <AntsTabIcon /> },
  { id: 'diem-rewards', label: '$DIEM $ANTS', icon: <DiemTabIcon /> },
];

function BaseIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 111 111"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0 50.3923H72.8467V59.6416H0C2.35281 87.8625 26.0432 110.034 54.921 110.034Z"
        fill="#0052FF"
      />
    </svg>
  );
}

function ChainIndicator({ config }: { config: PaymentConfig | null }) {
  const { wrongChain, isSwitchingChain, targetChainName, ensureCorrectNetwork } =
    usePaymentNetwork(config);
  const [error, setError] = useState<string | null>(null);

  const handleSwitch = async () => {
    setError(null);
    try {
      await ensureCorrectNetwork();
    } catch (err) {
      // User-rejected switches throw; surface as a tooltip-only hint and clear after a few seconds.
      const message = err instanceof Error ? err.message.split('\n')[0] : 'Switch failed';
      setError(message);
      setTimeout(() => setError(null), 4000);
    }
  };

  if (wrongChain) {
    return (
      <button
        type="button"
        className="dash-sidebar-chain dash-sidebar-chain--switch"
        onClick={handleSwitch}
        disabled={isSwitchingChain}
        title={error ?? `Switch wallet to ${targetChainName}`}
        aria-label={`Switch wallet to ${targetChainName}`}
      >
        <span className="dash-sidebar-chain-logo"><BaseIcon size={12} /></span>
        <span className="dash-sidebar-chain-label">
          {isSwitchingChain ? 'Switching…' : `Switch to ${targetChainName}`}
        </span>
      </button>
    );
  }

  return (
    <div
      className="dash-sidebar-chain"
      title={`Payments network: ${targetChainName}`}
      aria-label={`Connected to ${targetChainName}`}
    >
      <span className="dash-sidebar-chain-logo"><BaseIcon size={12} /></span>
      <span className="dash-sidebar-chain-label">{targetChainName}</span>
      <span className="dash-sidebar-chain-dot" aria-hidden="true" />
    </div>
  );
}

function AlphaHint() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="dash-sidebar-alpha-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`dash-sidebar-alpha${open ? ' dash-sidebar-alpha--open' : ''}`}
        onClick={() => setOpen((p) => !p)}
        aria-label="About this alpha build"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        Alpha
      </button>
      {open && (
        <div className="dash-sidebar-alpha-popover" role="dialog" aria-label="About this alpha build">
          <div className="dash-sidebar-alpha-popover-head">
            <span className="dash-sidebar-alpha-popover-dot" aria-hidden="true" />
            <span className="dash-sidebar-alpha-popover-eyebrow">Alpha build</span>
          </div>
          <p className="dash-sidebar-alpha-popover-lede">
            The AntSeed payments portal is under active development. Numbers and flows may change.
          </p>
          <ul className="dash-sidebar-alpha-popover-list">
            <li><span className="dash-sidebar-alpha-popover-mark" />Channel mechanics are evolving</li>
            <li><span className="dash-sidebar-alpha-popover-mark" />$ANTS emissions are pre-mainnet</li>
            <li><span className="dash-sidebar-alpha-popover-mark" />Expect occasional rough edges</li>
          </ul>
        </div>
      )}
    </div>
  );
}

export function Sidebar({ activeTab, onSelect, isDark, onToggleTheme, config }: SidebarProps) {
  return (
    <aside className="dash-sidebar">
      <div className="dash-sidebar-header">
        <div className="dash-sidebar-brand">
          <AntIcon size={22} />
          <span className="dash-sidebar-title">AntSeed</span>
        </div>
        <AlphaHint />
      </div>

      <nav className="dash-sidebar-nav" aria-label="Payments navigation">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`dash-sidebar-item${isActive ? ' dash-sidebar-item--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onSelect(item.id)}
            >
              <span className="dash-sidebar-item-icon">{item.icon}</span>
              <span className="dash-sidebar-item-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="dash-sidebar-footer">
        <button
          type="button"
          className="dash-sidebar-theme-toggle"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Switch to light' : 'Switch to dark'}
        >
          <span className="dash-sidebar-theme-toggle-icon">
            {isDark ? <SunIcon /> : <MoonIcon />}
          </span>
          <span className="dash-sidebar-theme-toggle-label">
            {isDark ? 'Light mode' : 'Dark mode'}
          </span>
        </button>
        <ChainIndicator config={config} />
      </div>
    </aside>
  );
}
