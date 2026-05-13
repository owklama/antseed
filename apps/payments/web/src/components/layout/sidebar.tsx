import { useMemo, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Analytics02Icon,
  ArrowDataTransferHorizontalIcon,
  CoinsDollarIcon,
  Plant01Icon,
} from '@hugeicons/core-free-icons';
import { AntSeedLogo } from '../ui/ant-seed-logo';
import { AccountMenu, SidebarAuthWarning } from './account-menu';
import { GettingStarted } from './getting-started';
import { useAppShell } from '../../context/app-shell-context';

export const TAB_IDS = ['overview', 'channels', 'sellers', 'earn', 'emissions', 'diem-rewards'] as const;
export type TabId = typeof TAB_IDS[number];

interface NavItem {
  id: TabId;
  label: string;
  icon: ReactNode;
  /** Only render this nav item when the predicate returns true. Omitted = always show. */
  visible?: (ctx: { isSeller: boolean }) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: <HugeiconsIcon icon={Analytics02Icon} size={18} strokeWidth={1.5} /> },
  { id: 'channels',  label: 'Channels',  icon: <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} size={18} strokeWidth={1.5} /> },
  {
    id: 'sellers',
    label: 'Sellers',
    icon: <HugeiconsIcon icon={CoinsDollarIcon} size={18} strokeWidth={1.5} />,
    visible: ({ isSeller }) => isSeller,
  },
  { id: 'earn', label: 'Earn', icon: <HugeiconsIcon icon={Plant01Icon} size={18} strokeWidth={1.5} /> },
];

/**
 * Single visible trigger in the sidebar header. Replaces the old "Alpha"
 * pill — its label and glyph both telegraph the action ("see how AntSeed
 * works") instead of leaving the user to guess what a "?" or an "Alpha"
 * tag is for.
 *
 * The leading glyph is a three-node connector that mirrors the "Route"
 * panel inside the explainer modal, so the visual carries through from
 * trigger to content.
 */
function HowItWorksTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="dash-sidebar-howto"
      onClick={onClick}
      aria-label="How AntSeed works"
      title="How AntSeed works"
    >
      Guide
    </button>
  );
}

export function Sidebar() {
  const { activeTab, selectTab, isSeller, openHowItWorks } = useAppShell();
  const visibleItems = useMemo(
    () => NAV_ITEMS.filter((item) => (item.visible ? item.visible({ isSeller }) : true)),
    [isSeller],
  );
  return (
    <aside className="dash-sidebar">
      <div className="dash-sidebar-header">
        <AntSeedLogo height={28} className="dash-sidebar-logo" />
        <HowItWorksTrigger onClick={openHowItWorks} />
      </div>

      <nav className="dash-sidebar-nav" aria-label="Payments navigation">
        {visibleItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`dash-sidebar-item${isActive ? ' dash-sidebar-item--active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => selectTab(item.id)}
            >
              <span className="dash-sidebar-item-icon">{item.icon}</span>
              <span className="dash-sidebar-item-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <GettingStarted />

      <div className="dash-sidebar-footer">
        <SidebarAuthWarning />
        <AccountMenu />
      </div>
    </aside>
  );
}
