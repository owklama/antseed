import { useQuery } from '@tanstack/react-query';
import type { PublicClient } from 'viem';
import {
  getBalance,
  getBuyerUsage,
  getConfig,
  getEmissionsInfo,
  getEmissionsPending,
  getEmissionsShares,
  getNetworkStats,
  getSellerActivity,
  getSellerNetworkStats,
  getSellerStatus,
  getSellerVolumeSeries,
  getTransfersEnabled,
} from '../lib/api';
import { scanDiemEpochs } from '../lib/diem-scan';

export const queryKeys = {
  balance: ['balance'] as const,
  config: ['config'] as const,
  buyerUsage: ['buyer-usage'] as const,
  sellerStatus: ['seller-status'] as const,
  sellerActivity: ['seller-activity'] as const,
  sellerVolumeSeries: (days: number) => ['seller-volume-series', days] as const,
  sellerNetworkStats: (url: string, agentId: number) => ['seller-network-stats', url, agentId] as const,
  networkStats: (url: string) => ['network-stats', url] as const,
  // Prefix keys — invalidating these prefix-matches every query under them
  // (react-query's default invalidate behavior is by-prefix). Invalidating
  // `emissions` after a claim refetches `info`, `pending`, `shares`, AND
  // `transfersEnabled`. The transfersEnabled refetch is intentional but
  // cheap (60s staleTime gates the actual network call) — keep it under
  // this prefix so the ANTS-token side stays in sync with claims.
  emissions: ['emissions'] as const,
  diem: ['diem-scan'] as const,
  emissionsInfo: ['emissions', 'info'] as const,
  emissionsPending: (address: string | null) => ['emissions', 'pending', address] as const,
  emissionsShares: ['emissions', 'shares'] as const,
  transfersEnabled: ['emissions', 'transfers-enabled'] as const,
  diemScan: (address: string | null, limit: number) => ['diem-scan', address, limit] as const,
};

export function useBalance() {
  return useQuery({
    queryKey: queryKeys.balance,
    queryFn: getBalance,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    retry: false,
  });
}

export function useConfig() {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: getConfig,
    staleTime: Infinity,
  });
}

/** Derived: the AntSeed buyer address, preferring config over balance fallback. */
export function useBuyerEvmAddress(): string | null {
  const { data: config } = useConfig();
  const { data: balance } = useBalance();
  return config?.evmAddress ?? balance?.evmAddress ?? null;
}

export function useBuyerUsage() {
  return useQuery({
    queryKey: queryKeys.buyerUsage,
    queryFn: getBuyerUsage,
    staleTime: 30_000,
  });
}

export function useSellerStatus() {
  return useQuery({
    queryKey: queryKeys.sellerStatus,
    queryFn: getSellerStatus,
    // Stake rarely changes mid-session — re-check every minute is plenty,
    // but keep the query "fresh" for 30s to avoid back-to-back refetches when
    // several components mount at once.
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
}

/** Convenience boolean: true once the seller-status query has resolved with stake > 0. */
export function useIsSeller(): boolean {
  const { data } = useSellerStatus();
  return data?.isSeller ?? false;
}

export function useSellerActivity() {
  const isSeller = useIsSeller();
  return useQuery({
    queryKey: queryKeys.sellerActivity,
    queryFn: getSellerActivity,
    // Channel volume + last-settled-at can change as buyers settle, but not
    // every block. A 30s heartbeat keeps the cards responsive without
    // spamming the RPC.
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    enabled: isSeller,
    retry: false,
  });
}

export function useSellerVolumeSeries(days = 30) {
  const isSeller = useIsSeller();
  return useQuery({
    queryKey: queryKeys.sellerVolumeSeries(days),
    queryFn: () => getSellerVolumeSeries(days),
    // Server caches for 60s and a daily-bucketed chart doesn't change minute
    // to minute; align client refresh with that.
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    enabled: isSeller,
    retry: false,
  });
}

export function useSellerNetworkStats(networkStatsUrl: string | null, agentId: number | null) {
  return useQuery({
    queryKey: queryKeys.sellerNetworkStats(networkStatsUrl ?? '', agentId ?? 0),
    queryFn: () => getSellerNetworkStats(networkStatsUrl as string, agentId as number),
    enabled: !!networkStatsUrl && !!agentId && agentId > 0,
    staleTime: 60_000,
  });
}

export function useNetworkStats(url: string | null) {
  return useQuery({
    queryKey: queryKeys.networkStats(url ?? ''),
    queryFn: () => getNetworkStats(url as string),
    enabled: !!url,
    staleTime: 30_000,
  });
}

export function useEmissionsInfo() {
  return useQuery({
    queryKey: queryKeys.emissionsInfo,
    queryFn: getEmissionsInfo,
    staleTime: 60_000,
  });
}

export function useEmissionsPending(address: string | null) {
  return useQuery({
    queryKey: queryKeys.emissionsPending(address),
    queryFn: () => getEmissionsPending(address as string),
    enabled: !!address,
    staleTime: 15_000,
  });
}

export function useEmissionsShares() {
  return useQuery({
    queryKey: queryKeys.emissionsShares,
    queryFn: getEmissionsShares,
    staleTime: Infinity,
  });
}

export function useTransfersEnabled() {
  return useQuery({
    queryKey: queryKeys.transfersEnabled,
    queryFn: getTransfersEnabled,
    staleTime: 60_000,
  });
}

export function useDiemScan(
  publicClient: PublicClient | undefined,
  address: string | null,
  limit: number,
) {
  return useQuery({
    queryKey: queryKeys.diemScan(address, limit),
    queryFn: () => scanDiemEpochs(publicClient as PublicClient, address as `0x${string}`, limit),
    enabled: !!publicClient && !!address,
    staleTime: 30_000,
  });
}
