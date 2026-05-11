import { useEffect, useState } from 'react';
import type { PaymentConfig, BalanceData } from '../types';
import {
  getBuyerUsage,
  getNetworkStats,
  type BuyerUsageChannelPoint,
  type BuyerUsageTotals,
  type NetworkStatsResponse,
} from '../api';
import { UsageChart } from '../components/UsageChart';
import { formatCompact, formatNumber, bigintFromString } from '../utils/format';
import './DashboardView.scss';

interface DashboardViewProps {
  config: PaymentConfig | null;
  balance: BalanceData | null;
}

const EMPTY_CHANNELS: BuyerUsageChannelPoint[] = [];

function formatUsd(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M2 10V3a1 1 0 011-1h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export function DashboardView({ config, balance }: DashboardViewProps) {
  const networkStatsUrl = config?.networkStatsUrl ?? null;
  const [copiedAddress, setCopiedAddress] = useState(false);
  const buyerEvmAddress = balance?.evmAddress ?? config?.evmAddress ?? null;

  const availableBalance = balance ? parseFloat(balance.available) : 0;
  const reservedBalance = balance ? parseFloat(balance.reserved) : 0;
  const totalBalance = balance ? parseFloat(balance.total) : 0;

  const handleCopyAddress = async () => {
    if (!buyerEvmAddress) return;
    await navigator.clipboard.writeText(buyerEvmAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const [buyerUsage, setBuyerUsage] = useState<BuyerUsageTotals | null>(null);
  const [networkStats, setNetworkStats] = useState<NetworkStatsResponse | null>(null);
  const [buyerUsageError, setBuyerUsageError] = useState<string | null>(null);
  const [networkStatsError, setNetworkStatsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBuyerUsage()
      .then((totals) => {
        if (cancelled) return;
        setBuyerUsage(totals);
        setBuyerUsageError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setBuyerUsageError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!networkStatsUrl) return;
    let cancelled = false;
    getNetworkStats(networkStatsUrl)
      .then((stats) => {
        if (cancelled) return;
        setNetworkStats(stats);
        setNetworkStatsError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setNetworkStatsError(err instanceof Error ? err.message : String(err));
      });
    return () => { cancelled = true; };
  }, [networkStatsUrl]);

  const personalRequests = buyerUsage?.totalRequests ?? 0;
  const personalTokens =
    bigintFromString(buyerUsage?.totalInputTokens) +
    bigintFromString(buyerUsage?.totalOutputTokens);
  const personalSettlements = buyerUsage?.totalSettlements ?? 0;
  const personalUniqueSellers = buyerUsage?.uniqueSellers ?? 0;

  const networkRequests = bigintFromString(networkStats?.totals.totalRequests);
  const networkTokens =
    bigintFromString(networkStats?.totals.totalInputTokens) +
    bigintFromString(networkStats?.totals.totalOutputTokens);
  const networkSettlements = networkStats?.totals.totalSettlements ?? 0;
  const networkPeers = networkStats?.totals.activePeers ?? 0;
  const networkSellers = networkStats?.totals.sellerCount;

  return (
    <div className="dashboard-view">
      {/* Wallet Header - matching PR #445 WalletPanel pattern */}
      <section className="wallet-header">
        <div className="wallet-header-balance">
          <div className="wallet-header-balance-label">Your Balance</div>
          <div className="wallet-header-balance-amount">
            ${formatUsd(totalBalance)}
          </div>
          <div className="wallet-header-balance-sub">
            {availableBalance > 0 && (
              <><span className="available">{formatUsd(availableBalance)} available</span> · </>
            )}
            {reservedBalance > 0 && (
              <span className="reserved">{formatUsd(reservedBalance)} reserved</span>
            )}
            {totalBalance === 0 && <span>No balance yet</span>}
          </div>
        </div>
        {buyerEvmAddress && (
          <div className="wallet-header-address">
            <span className="wallet-header-address-label">Signer</span>
            <div className="wallet-header-address-chip">
              <span className="wallet-header-address-value">
                {truncateAddress(buyerEvmAddress)}
              </span>
              <button
                type="button"
                className="wallet-header-copy-btn"
                onClick={handleCopyAddress}
                aria-label={copiedAddress ? 'Copied!' : 'Copy address'}
              >
                {copiedAddress ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 7l3.5 3.5L12 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <CopyIcon />
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <header className="dashboard-section-head">
          <div className="dashboard-section-eyebrow">Network</div>
          <h2 className="dashboard-section-title">Global activity</h2>
          <p className="dashboard-section-sub">
            Aggregate stats across every seller on the AntSeed network.
          </p>
        </header>

        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-label">Active peers</div>
            <div className="stat-card-value">{formatNumber(networkPeers)}</div>
            <div className="stat-card-hint">
              {networkSellers != null
                ? `${formatNumber(networkSellers)} sellers with lifetime activity`
                : 'Sellers currently online with on-chain activity'}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Network requests</div>
            <div className="stat-card-value">{formatCompact(networkRequests)}</div>
            <div className="stat-card-hint">Across all sellers</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Network settlements</div>
            <div className="stat-card-value">{formatNumber(networkSettlements)}</div>
            <div className="stat-card-hint">Total channels settled</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Network tokens</div>
            <div className="stat-card-value">{formatCompact(networkTokens)}</div>
            <div className="stat-card-hint">Input + output across all peers</div>
          </div>
        </div>

        {networkStatsError && (
          <div className="dashboard-stats-error">
            Couldn&apos;t load network stats: {networkStatsError}
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <header className="dashboard-section-head">
          <div className="dashboard-section-eyebrow">Your activity</div>
          <h2 className="dashboard-section-title">Your usage</h2>
          <p className="dashboard-section-sub">
            Requests and tokens flowing through your signer over time.
          </p>
        </header>

        <div className="dashboard-chart-card">
          <div className="dashboard-kpi-row">
            <div className="dashboard-kpi">
              <div className="dashboard-kpi-label">Requests</div>
              <div className="dashboard-kpi-value">{formatNumber(personalRequests)}</div>
            </div>
            <div className="dashboard-kpi">
              <div className="dashboard-kpi-label">Tokens</div>
              <div className="dashboard-kpi-value">{formatCompact(personalTokens)}</div>
            </div>
            <div className="dashboard-kpi">
              <div className="dashboard-kpi-label">Settlements</div>
              <div className="dashboard-kpi-value">{formatNumber(personalSettlements)}</div>
            </div>
            <div className="dashboard-kpi">
              <div className="dashboard-kpi-label">Sellers</div>
              <div className="dashboard-kpi-value">{formatNumber(personalUniqueSellers)}</div>
            </div>
          </div>

          <UsageChart channels={buyerUsage?.channels ?? EMPTY_CHANNELS} />
          {buyerUsageError && (
            <div className="dashboard-stats-error">
              Couldn&apos;t load your usage: {buyerUsageError}
            </div>
          )}
        </div>
      </section>

    </div>
  );
}
