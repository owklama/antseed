import { useMemo } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon, CoinsDollarIcon } from '@hugeicons/core-free-icons';
import type { EmissionsPendingRow } from '../lib/api';
import {
  useConfig,
  useEmissionsInfo,
  useEmissionsPending,
  useEmissionsShares,
  useNetworkStats,
  useSellerActivity,
  useSellerNetworkStats,
  useSellerStatus,
  useSellerVolumeSeries,
} from '../hooks/queries';
import { useAppShell } from '../context/app-shell-context';
import { AntMark } from '../components/ui/ant-seed-logo';
import { SellerEmissionsChart } from '../components/ui/seller-emissions-chart';
import { SellerVolumeChart } from '../components/ui/seller-volume-chart';
import {
  bigintFromString,
  formatAntsCompact,
  formatCompact,
  formatNumber,
  formatUsd,
  safeBigint,
  truncateAddr,
} from '../lib/format';
import './sellers-view.scss';

function formatRegisteredAt(unixSeconds: number): string {
  if (!unixSeconds) return '—';
  try {
    return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function formatRelativeTime(unixSeconds: number): string {
  if (!unixSeconds) return 'Never';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - unixSeconds;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return formatRegisteredAt(unixSeconds);
}

/** Sum seller-side claimable + claimed $ANTS across recent epochs. */
function aggregateSellerEmissions(rows: EmissionsPendingRow[]): { claimable: bigint; claimed: bigint } {
  let claimable = 0n;
  let claimed = 0n;
  for (const r of rows) {
    if (r.isCurrent) continue;
    const amt = safeBigint(r.seller.amount);
    if (r.seller.claimed) claimed += amt;
    else claimable += amt;
  }
  return { claimable, claimed };
}

export function SellersView() {
  const { selectTab } = useAppShell();
  const { data: status = null } = useSellerStatus();
  const { data: activity = null } = useSellerActivity();
  const { data: config = null } = useConfig();
  const { data: networkStats = null } = useNetworkStats(config?.networkStatsUrl ?? null);
  const { data: sellerNet = null } = useSellerNetworkStats(
    config?.networkStatsUrl ?? null,
    status?.agentId ?? null,
  );
  const { data: emissions = null } = useEmissionsPending(status?.evmAddress ?? null);
  const { data: emissionsInfo = null } = useEmissionsInfo();
  const { data: emissionsShares = null } = useEmissionsShares();
  const { data: volumeSeries = null } = useSellerVolumeSeries(30);

  const stakeUsd = status ? parseFloat(status.stake) : 0;
  const networkSellers = networkStats?.totals.sellerCount;

  const totalTokens = sellerNet
    ? bigintFromString(sellerNet.totalInputTokens) + bigintFromString(sellerNet.totalOutputTokens)
    : 0n;
  const totalRequests = sellerNet ? bigintFromString(sellerNet.totalRequests) : 0n;
  const indexerLinked = !!config?.networkStatsUrl && !!sellerNet;

  const antsAgg = useMemo(
    () => aggregateSellerEmissions(emissions?.rows ?? []),
    [emissions],
  );

  return (
    <div className="overview-view">
      <section className="page-banner">
        <span className="page-banner-mark" aria-hidden="true">
          <HugeiconsIcon icon={CoinsDollarIcon} size={20} strokeWidth={1.6} />
        </span>
        <div className="page-banner-content">
          <div className="page-banner-eyebrow">Sellers</div>
          <h2 className="page-banner-heading">You&rsquo;re registered as a seller</h2>
          <p className="page-banner-sub">
            Stake binds your seller address to an agentId on the AntSeed network. Settlements pay
            into your deposit balance, and seller-side $ANTS emissions accrue each epoch you stay
            active.
          </p>
        </div>
        <span className="page-banner-deco" aria-hidden="true" />
      </section>

      <section className="overview-section">
        <header className="overview-section-head">
          <div className="overview-section-eyebrow">Your registration</div>
          <h2 className="overview-section-title">Stake &amp; agent</h2>
          <p className="overview-section-sub">
            Read directly from the AntseedStaking contract.
          </p>
        </header>

        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-label">Stake</div>
            <div className="stat-card-value">{formatUsd(stakeUsd)}</div>
            <div className="stat-card-hint">USDC bonded to the staking contract</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Agent ID</div>
            <div className="stat-card-value">
              {status && status.agentId > 0 ? `#${formatNumber(status.agentId)}` : '—'}
            </div>
            <div className="stat-card-hint">ERC-8004 identity bound to your seller</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Registered</div>
            <div className="stat-card-value">{formatRegisteredAt(status?.stakedAt ?? 0)}</div>
            <div className="stat-card-hint">Date your stake was first locked</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Seller address</div>
            <div className="stat-card-value" title={status?.evmAddress ?? ''}>
              {truncateAddr(status?.evmAddress)}
            </div>
            <div className="stat-card-hint">
              {networkSellers != null
                ? `${formatNumber(networkSellers)} sellers active network-wide`
                : 'Receives settlement payouts from buyers'}
            </div>
          </div>
        </div>
      </section>

      <section className="overview-section">
        <header className="overview-section-head">
          <div className="overview-section-eyebrow">Lifetime activity</div>
          <h2 className="overview-section-title">Volume served</h2>
          <p className="overview-section-sub">
            USDC volume + channels are read on-chain. Requests and tokens come from the network
            stats indexer when one is configured for this chain.
          </p>
        </header>

        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-label">USDC volume</div>
            <div className="stat-card-value">
              {activity ? formatUsd(parseFloat(activity.totalVolumeUsdc)) : '—'}
            </div>
            <div className="stat-card-hint">Settled through your channels</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Channels settled</div>
            <div className="stat-card-value">
              {activity ? formatNumber(activity.channelCount) : '—'}
            </div>
            <div className="stat-card-hint">Lifetime channel count</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Requests served</div>
            <div className="stat-card-value">
              {indexerLinked ? formatCompact(totalRequests) : '—'}
            </div>
            <div className="stat-card-hint">
              {indexerLinked
                ? `${formatNumber(sellerNet?.uniqueBuyers ?? 0)} unique buyers`
                : config?.networkStatsUrl
                  ? 'No settlements seen by indexer yet'
                  : 'Indexer not configured for this chain'}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Tokens served</div>
            <div className="stat-card-value">
              {indexerLinked ? formatCompact(totalTokens) : '—'}
            </div>
            <div className="stat-card-hint">Input + output combined</div>
          </div>
        </div>

        {indexerLinked && sellerNet && (
          <p className="seller-meta-line">
            {sellerNet.firstSeenAt
              ? `First settled ${formatRegisteredAt(sellerNet.firstSeenAt)}`
              : 'Awaiting first settlement'}
            {sellerNet.lastSeenAt
              ? ` · last activity ${formatRelativeTime(sellerNet.lastSeenAt)}`
              : ''}
            {sellerNet.avgRequestsPerChannel > 0
              ? ` · ~${formatNumber(sellerNet.avgRequestsPerChannel)} req/channel`
              : ''}
          </p>
        )}
      </section>

      <section className="overview-section">
        <header className="overview-section-head">
          <div className="overview-section-eyebrow">Right now</div>
          <h2 className="overview-section-title">Live state &amp; rewards</h2>
        </header>

        <div className="stat-grid stat-grid--3up">
          <div className="stat-card">
            <div className="stat-card-label">Active channels</div>
            <div className="stat-card-value">
              {activity ? formatNumber(activity.activeChannels) : '—'}
            </div>
            <div className="stat-card-hint">Open buyer channels routing to you</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Last settlement</div>
            <div className="stat-card-value">
              {activity ? formatRelativeTime(activity.lastSettledAt) : '—'}
            </div>
            <div className="stat-card-hint">
              {activity && activity.lastSettledAt
                ? formatRegisteredAt(activity.lastSettledAt)
                : 'No on-chain settlements yet'}
            </div>
          </div>
          <button type="button" className="stat-card stat-card--clickable" onClick={() => selectTab('earn')}>
            <div className="stat-card-label">
              <span className="seller-ants-mark" aria-hidden="true"><AntMark size={12} /></span>
              Seller $ANTS
            </div>
            <div className="stat-card-value">{formatAntsCompact(antsAgg.claimable)}</div>
            <div className="stat-card-hint">
              claimable
              {antsAgg.claimed > 0n ? ` · ${formatAntsCompact(antsAgg.claimed)} already claimed` : ''}
              <HugeiconsIcon icon={ArrowRight01Icon} size={11} strokeWidth={1.8} />
            </div>
          </button>
        </div>
      </section>

      <section className="overview-section">
        <header className="overview-section-head">
          <div className="overview-section-eyebrow">Trends</div>
          <h2 className="overview-section-title">USDC volume (last 30 days)</h2>
          <p className="overview-section-sub">
            {volumeSeries
              ? `${formatUsd(parseFloat(volumeSeries.totalVolumeUsdc))} USDC across ${formatNumber(volumeSeries.totalSettlements)} settlements in window.`
              : 'Reconstructed from on-chain ChannelSettled events for your seller address.'}
          </p>
        </header>
        <div className="overview-chart-card">
          <SellerVolumeChart buckets={volumeSeries?.buckets ?? []} />
        </div>
      </section>

      <section className="overview-section">
        <header className="overview-section-head">
          <div className="overview-section-eyebrow">Trends</div>
          <h2 className="overview-section-title">$ANTS per epoch</h2>
          <p className="overview-section-sub">
            Seller-side emissions across the most recent epochs the contract still exposes.
          </p>
        </header>
        <div className="overview-chart-card">
          <SellerEmissionsChart
            rows={emissions?.rows ?? []}
            shares={emissionsShares ?? null}
            epochEmission={emissionsInfo?.epochEmission ?? '0'}
          />
        </div>
      </section>
    </div>
  );
}
