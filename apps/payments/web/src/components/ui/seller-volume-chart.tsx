import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  type TooltipProps,
} from 'recharts';
import type { VolumeBucket } from '../../lib/api';
import { formatNumber, formatUsd } from '../../lib/format';
// Reuses `.usage-chart*` wrapper + tooltip classes from the buyer usage chart.
import './usage-chart.scss';

interface SellerVolumeChartProps {
  buckets: VolumeBucket[];
}

interface ChartPoint {
  /** Short label rendered on the X-axis (e.g. "May 13"). */
  date: string;
  /** Full date label used in tooltips. */
  fullDate: string;
  /** Numeric USDC volume — recharts wants a JS number on the axis. */
  volume: number;
  settlements: number;
}

function shortLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function fullLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload as ChartPoint | undefined;
  if (!p) return null;
  return (
    <div className="usage-chart-tooltip">
      <div className="usage-chart-tooltip-date">{p.fullDate}</div>
      <div className="usage-chart-tooltip-rows">
        <div className="usage-chart-tooltip-row">
          <span className="usage-chart-tooltip-label">Volume</span>
          <span className="usage-chart-tooltip-value">{formatUsd(p.volume)} USDC</span>
        </div>
        <div className="usage-chart-tooltip-row">
          <span className="usage-chart-tooltip-label">Settlements</span>
          <span className="usage-chart-tooltip-value">{formatNumber(p.settlements)}</span>
        </div>
      </div>
    </div>
  );
}

export function SellerVolumeChart({ buckets }: SellerVolumeChartProps) {
  const points = useMemo<ChartPoint[]>(
    () =>
      buckets.map((b) => ({
        date: shortLabel(b.date),
        fullDate: fullLabel(b.date),
        volume: parseFloat(b.volumeUsdc) || 0,
        settlements: b.settlements,
      })),
    [buckets],
  );

  const anyVolume = points.some((p) => p.volume > 0);

  if (!anyVolume) {
    return (
      <div className="usage-chart usage-chart--empty">
        <div className="usage-chart-empty-text">
          No settlements observed in this window. Volume will appear here as buyers close
          channels with you.
        </div>
      </div>
    );
  }

  return (
    <div className="usage-chart">
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={points} margin={{ top: 12, right: 8, left: 8, bottom: 4 }}>
          <defs>
            <linearGradient id="seller-volume-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.42} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="var(--card-border)"
            strokeDasharray="2 5"
            vertical={false}
            opacity={0.5}
          />
          <XAxis
            dataKey="date"
            stroke="var(--text-muted)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis
            stroke="var(--text-muted)"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v: number) => `$${formatUsd(v)}`}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '3 3' }}
          />
          <Area
            type="monotone"
            dataKey="volume"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#seller-volume-fill)"
            activeDot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--page-bg)', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
