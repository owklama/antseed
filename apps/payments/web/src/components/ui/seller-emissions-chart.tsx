import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  type TooltipProps,
} from 'recharts';
import type { EmissionsPendingRow, EmissionsShares } from '../../lib/api';
import { antsWeiToNumber, estimateEmissionReward, formatAnts, safeBigint } from '../../lib/format';
import './seller-emissions-chart.scss';

interface SellerEmissionsChartProps {
  rows: EmissionsPendingRow[];
  /** Used to estimate the current (still-open) epoch reward. */
  shares: EmissionsShares | null;
  /** Current epoch's full pool emission, in wei (18dp). */
  epochEmission: string;
}

type Status = 'claimed' | 'claimable' | 'current' | 'zero';

interface BarPoint {
  epoch: number;
  label: string;
  /** Numeric reward in $ANTS (whole-number units) for the y-axis. */
  amount: number;
  /** Raw wei, kept for tooltip precision. */
  amountWei: bigint;
  status: Status;
}

function statusFor(row: EmissionsPendingRow, amountWei: bigint): Status {
  if (row.isCurrent) return 'current';
  if (amountWei === 0n) return 'zero';
  if (row.seller.claimed) return 'claimed';
  return 'claimable';
}

function colorFor(status: Status): string {
  switch (status) {
    case 'claimed':   return 'var(--accent)';
    case 'claimable': return 'var(--accent-text)';
    case 'current':   return 'color-mix(in srgb, var(--accent) 55%, transparent)';
    case 'zero':      return 'var(--card-border)';
  }
}

function statusLabel(status: Status): string {
  switch (status) {
    case 'claimed':   return 'Claimed';
    case 'claimable': return 'Claimable';
    case 'current':   return 'Estimate (current epoch)';
    case 'zero':      return 'No activity';
  }
}

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload as BarPoint | undefined;
  if (!p) return null;
  return (
    <div className="usage-chart-tooltip">
      <div className="usage-chart-tooltip-date">Epoch #{p.epoch}</div>
      <div className="usage-chart-tooltip-rows">
        <div className="usage-chart-tooltip-row">
          <span className="usage-chart-tooltip-label">$ANTS</span>
          <span className="usage-chart-tooltip-value">{formatAnts(p.amountWei)}</span>
        </div>
        <div className="usage-chart-tooltip-row">
          <span className="usage-chart-tooltip-label">Status</span>
          <span className="usage-chart-tooltip-value">{statusLabel(p.status)}</span>
        </div>
      </div>
    </div>
  );
}

export function SellerEmissionsChart({ rows, shares, epochEmission }: SellerEmissionsChartProps) {
  const points = useMemo<BarPoint[]>(() => {
    // Recent epochs first → render left-to-right oldest-to-newest.
    const sorted = [...rows].sort((a, b) => a.epoch - b.epoch);
    return sorted.map((row) => {
      const amountWei = row.isCurrent
        ? estimateEmissionReward(
            epochEmission,
            shares?.sellerSharePct ?? 0,
            row.seller.userPoints,
            row.seller.totalPoints,
          )
        : safeBigint(row.seller.amount);
      return {
        epoch: row.epoch,
        label: `#${row.epoch}`,
        amount: antsWeiToNumber(amountWei),
        amountWei,
        status: statusFor(row, amountWei),
      };
    });
  }, [rows, shares, epochEmission]);

  const hasAnyAmount = points.some((p) => p.amountWei > 0n);

  if (!hasAnyAmount) {
    return (
      <div className="seller-emissions-chart seller-emissions-chart--empty">
        <div className="seller-emissions-chart-empty-text">
          No seller-side $ANTS earned in the recent epochs shown. Settle channels to start
          accruing.
        </div>
      </div>
    );
  }

  return (
    <div className="seller-emissions-chart">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={points} margin={{ top: 12, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid
            stroke="var(--card-border)"
            strokeDasharray="2 5"
            vertical={false}
            opacity={0.5}
          />
          <XAxis
            dataKey="label"
            stroke="var(--text-muted)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            minTickGap={16}
          />
          <YAxis
            stroke="var(--text-muted)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={42}
            tickFormatter={(v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: 'color-mix(in srgb, var(--accent) 8%, transparent)' }}
          />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
            {points.map((p) => (
              <Cell key={p.epoch} fill={colorFor(p.status)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ul className="seller-emissions-chart-legend" aria-hidden="true">
        <li><span className="seller-emissions-chart-swatch seller-emissions-chart-swatch--claimed" /> Claimed</li>
        <li><span className="seller-emissions-chart-swatch seller-emissions-chart-swatch--claimable" /> Claimable</li>
        <li><span className="seller-emissions-chart-swatch seller-emissions-chart-swatch--current" /> Current (estimate)</li>
      </ul>
    </div>
  );
}
