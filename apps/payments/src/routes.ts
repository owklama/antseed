import type { FastifyInstance } from 'fastify';
import { ethers } from 'ethers';
import type { CryptoContext, PaymentCryptoConfig } from './crypto-context.js';
import {
  ChannelsClient,
  DepositsClient,
  EmissionsClient,
  ANTSTokenClient,
  StakingClient,
  formatUsdc,
  signSetOperator,
  makeDepositsDomain,
  type ChainConfig,
  type BuyerUsageTotals,
} from '@antseed/node';

const EMPTY_BUYER_USAGE: BuyerUsageTotals = {
  totalRequests: 0,
  totalInputTokens: '0',
  totalOutputTokens: '0',
  totalSettlements: 0,
  uniqueSellers: 0,
  activeChannels: 0,
  channels: [],
};

interface RouteContext {
  cryptoCtx: CryptoContext | null;
  cryptoConfig: PaymentCryptoConfig;
  chainConfig: ChainConfig;
  proxyPort: number;
}

// Use shared utilities from @antseed/node
const formatUsdc6 = formatUsdc;

// AntseedChannels.ChannelSettled — keyed by (channelId, buyer, seller) +
// data payload (cumulativeAmount, delta, totalSettled, platformFee, metadata).
// We use it to reconstruct per-day USDC volume served by a seller.
const CHANNEL_SETTLED_ABI = [
  'event ChannelSettled(bytes32 indexed channelId, address indexed buyer, address indexed seller, uint128 cumulativeAmount, uint128 delta, uint128 totalSettled, uint256 platformFee, bytes metadata)',
] as const;
const CHANNEL_SETTLED_IFACE = new ethers.Interface(CHANNEL_SETTLED_ABI);
const CHANNEL_SETTLED_TOPIC = CHANNEL_SETTLED_IFACE.getEvent('ChannelSettled')!.topicHash;

/** Cap log-scan chunk size to stay under common RPC `eth_getLogs` limits. */
const LOG_SCAN_CHUNK = 9_500;
/** Hard cap so a 90-day mainnet scan still terminates. ~16M blocks ~= a year on Base. */
const LOG_SCAN_MAX_BLOCKS = 4_000_000;
/**
 * Conservative (fast) lower bound on block time, in seconds. Used to estimate
 * how deep we need to scan back to cover `days * 86400` seconds. Base is ~2s,
 * but we assume 1s to never under-scan on faster chains or during temporary
 * speed-ups.
 */
const FASTEST_SECS_PER_BLOCK = 1;

export interface VolumeBucket {
  /** UTC day, ISO YYYY-MM-DD. */
  date: string;
  /** Sum of delta amounts settled in this bucket, formatted USDC (6dp). */
  volumeUsdc: string;
  /** Number of settle events in this bucket. */
  settlements: number;
}

export interface SellerVolumeSeries {
  days: number;
  buckets: VolumeBucket[];
  totalVolumeUsdc: string;
  totalSettlements: number;
  configured: boolean;
}

/** Pad a 20-byte address into a 32-byte topic for getLogs `topics` filters. */
function addressTopic(addr: string): string {
  return '0x' + addr.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

/** Fill a bucket map with zero-valued days so the chart has a continuous x-axis. */
function buildEmptyBuckets(days: number): Map<string, VolumeBucket> {
  const buckets = new Map<string, VolumeBucket>();
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayUtc);
    d.setUTCDate(d.getUTCDate() - i);
    const date = d.toISOString().slice(0, 10);
    buckets.set(date, { date, volumeUsdc: '0', settlements: 0 });
  }
  return buckets;
}

async function fetchVolumeSeries(
  channels: ChannelsClient,
  sellerAddr: string,
  days: number,
): Promise<SellerVolumeSeries> {
  const provider = channels.provider;
  const head = await provider.getBlockNumber();
  const headBlock = await provider.getBlock(head);
  const nowTs = headBlock?.timestamp ?? Math.floor(Date.now() / 1000);
  const cutoffTs = nowTs - days * 86400;

  const buckets = buildEmptyBuckets(days);
  // Track raw bigints separately to avoid string-formatted arithmetic; we
  // serialize to formatted USDC once at the end of the scan.
  const bucketRaw = new Map<string, bigint>();
  let totalVolume = 0n;
  let totalSettlements = 0;

  const sellerTopic = addressTopic(sellerAddr);
  const channelsAddress = await channels.readAddress;

  // Walk backwards from head in fixed-size chunks. Stop once we've crossed the
  // cutoff timestamp; bail at LOG_SCAN_MAX_BLOCKS as a hard safety cap.
  // `minBlock` is bounded by the time window (assuming the fastest plausible
  // block time) so an idle seller with no settlements stops near the cutoff
  // instead of scanning the full 4M-block cap.
  let toBlock = head;
  const estimatedBlocksInWindow = Math.ceil((days * 86400) / FASTEST_SECS_PER_BLOCK);
  const minBlock = Math.max(0, head - Math.min(estimatedBlocksInWindow, LOG_SCAN_MAX_BLOCKS));
  const blockTimestampCache = new Map<number, number>();

  while (toBlock >= minBlock) {
    const fromBlock = Math.max(minBlock, toBlock - LOG_SCAN_CHUNK + 1);
    const logs = await provider.getLogs({
      address: channelsAddress,
      // [eventSig, channelId, buyer, seller]
      topics: [CHANNEL_SETTLED_TOPIC, null, null, sellerTopic],
      fromBlock,
      toBlock,
    });

    // Resolve unique block timestamps for this chunk in parallel.
    const uniqueBlocks = Array.from(new Set(logs.map((l) => l.blockNumber)))
      .filter((b) => !blockTimestampCache.has(b));
    if (uniqueBlocks.length > 0) {
      const fetched = await Promise.all(uniqueBlocks.map((b) => provider.getBlock(b)));
      for (let i = 0; i < uniqueBlocks.length; i++) {
        const block = fetched[i];
        if (block) blockTimestampCache.set(uniqueBlocks[i]!, Number(block.timestamp));
      }
    }

    let chunkOldestTs = Infinity;
    for (const log of logs) {
      const ts = blockTimestampCache.get(log.blockNumber);
      if (ts == null) continue;
      if (ts < chunkOldestTs) chunkOldestTs = ts;
      if (ts < cutoffTs) continue;

      let delta = 0n;
      try {
        const parsed = CHANNEL_SETTLED_IFACE.parseLog({
          topics: [...log.topics],
          data: log.data,
        });
        delta = parsed!.args.delta as bigint;
      } catch {
        continue;
      }

      const dayDate = new Date(ts * 1000);
      dayDate.setUTCHours(0, 0, 0, 0);
      const dayKey = dayDate.toISOString().slice(0, 10);
      const bucket = buckets.get(dayKey);
      if (!bucket) continue; // older than the window
      bucketRaw.set(dayKey, (bucketRaw.get(dayKey) ?? 0n) + delta);
      bucket.settlements += 1;
      totalVolume += delta;
      totalSettlements += 1;
    }

    // Decide whether to stop. For non-empty chunks we already know the
    // oldest log timestamp. For empty chunks `chunkOldestTs` is Infinity —
    // peek at `fromBlock`'s timestamp once so an idle seller doesn't keep
    // scanning the full window (one extra getBlock per empty chunk beats
    // hundreds of empty getLogs).
    let cutoffReached = chunkOldestTs <= cutoffTs;
    if (!cutoffReached && chunkOldestTs === Infinity) {
      const fb = await provider.getBlock(fromBlock);
      if (fb && Number(fb.timestamp) <= cutoffTs) cutoffReached = true;
    }
    if (cutoffReached) break;
    if (fromBlock <= minBlock) break;
    toBlock = fromBlock - 1;
  }

  for (const [date, raw] of bucketRaw.entries()) {
    const bucket = buckets.get(date);
    if (bucket) bucket.volumeUsdc = formatUsdc(raw);
  }

  return {
    days,
    buckets: Array.from(buckets.values()),
    totalVolumeUsdc: formatUsdc(totalVolume),
    totalSettlements,
    configured: true,
  };
}

// Retry helper for on-chain view calls. Base RPC occasionally returns an
// unparseable response (ethers surfaces it as CALL_EXCEPTION with null
// revert data even though the call didn't actually revert); view calls are
// idempotent, so retrying clears these transient failures.
async function retryRead<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 150 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

function createClient(config: PaymentCryptoConfig, evmChainId?: number): DepositsClient {
  return new DepositsClient({
    rpcUrl: config.rpcUrl,
    ...(config.fallbackRpcUrls ? { fallbackRpcUrls: config.fallbackRpcUrls } : {}),
    contractAddress: config.depositsContractAddress,
    usdcAddress: config.usdcContractAddress,
    evmChainId,
  });
}

export function registerRoutes(fastify: FastifyInstance, ctx: RouteContext): void {
  // Shared deposits client — reused across requests (stateless, only holds RPC URL + ABI)
  let depositsClient: DepositsClient | null = null;
  function getClient(): DepositsClient | null {
    if (!depositsClient) depositsClient = createClient(ctx.cryptoConfig, ctx.chainConfig.evmChainId);
    return depositsClient;
  }

  let emissionsClient: EmissionsClient | null = null;
  function getEmissionsClient(): EmissionsClient | null {
    if (!ctx.chainConfig.emissionsContractAddress) return null;
    if (!emissionsClient) {
      emissionsClient = new EmissionsClient({
        rpcUrl: ctx.cryptoConfig.rpcUrl,
        ...(ctx.cryptoConfig.fallbackRpcUrls ? { fallbackRpcUrls: ctx.cryptoConfig.fallbackRpcUrls } : {}),
        contractAddress: ctx.chainConfig.emissionsContractAddress,
        evmChainId: ctx.chainConfig.evmChainId,
      });
    }
    return emissionsClient;
  }

  let channelsClient: ChannelsClient | null = null;
  function getChannelsClient(): ChannelsClient | null {
    if (!ctx.cryptoConfig.channelsContractAddress) return null;
    if (!channelsClient) {
      channelsClient = new ChannelsClient({
        rpcUrl: ctx.cryptoConfig.rpcUrl,
        ...(ctx.cryptoConfig.fallbackRpcUrls ? { fallbackRpcUrls: ctx.cryptoConfig.fallbackRpcUrls } : {}),
        contractAddress: ctx.cryptoConfig.channelsContractAddress,
        evmChainId: ctx.chainConfig.evmChainId,
      });
    }
    return channelsClient;
  }

  let stakingClient: StakingClient | null = null;
  function getStakingClient(): StakingClient | null {
    if (!ctx.chainConfig.stakingContractAddress) return null;
    if (!stakingClient) {
      stakingClient = new StakingClient({
        rpcUrl: ctx.cryptoConfig.rpcUrl,
        ...(ctx.cryptoConfig.fallbackRpcUrls ? { fallbackRpcUrls: ctx.cryptoConfig.fallbackRpcUrls } : {}),
        contractAddress: ctx.chainConfig.stakingContractAddress,
        usdcAddress: ctx.cryptoConfig.usdcContractAddress,
        evmChainId: ctx.chainConfig.evmChainId,
      });
    }
    return stakingClient;
  }

  let antsTokenClient: ANTSTokenClient | null = null;
  function getAntsTokenClient(): ANTSTokenClient | null {
    // ANTSToken address is typically fetched via the registry, but for v1 we
    // plumb it through the chain config. Fall back to null if unavailable.
    const addr = ctx.chainConfig.antsTokenAddress;
    if (!addr) return null;
    if (!antsTokenClient) {
      antsTokenClient = new ANTSTokenClient({
        rpcUrl: ctx.cryptoConfig.rpcUrl,
        contractAddress: addr,
        evmChainId: ctx.chainConfig.evmChainId,
      });
    }
    return antsTokenClient;
  }

  fastify.get('/api/balance', async (_request, reply) => {
    if (!ctx.cryptoCtx) {
      return reply.status(503).send({ ok: false, error: 'Identity not configured — set ANTSEED_IDENTITY_HEX or run antseed seller setup' });
    }

    try {
      const client = getClient()!;
      const buyerAddress = ctx.cryptoCtx.evmAddress;

      const [balance, creditLimit] = await Promise.all([
        retryRead(() => client.getBuyerBalance(buyerAddress)),
        retryRead(() => client.getBuyerCreditLimit(buyerAddress)),
      ]);

      return {
        evmAddress: ctx.cryptoCtx.evmAddress,
        available: formatUsdc6(balance.available),
        reserved: formatUsdc6(balance.reserved),
        total: formatUsdc6(balance.available + balance.reserved),
        creditLimit: formatUsdc6(creditLimit),
      };
    } catch (err) {
      return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.get('/api/config', async () => {
    return {
      chainId: ctx.chainConfig.chainId,
      evmChainId: ctx.chainConfig.evmChainId,
      rpcUrl: ctx.cryptoConfig.rpcUrl,
      depositsContractAddress: ctx.cryptoConfig.depositsContractAddress,
      channelsContractAddress: ctx.cryptoConfig.channelsContractAddress,
      usdcContractAddress: ctx.cryptoConfig.usdcContractAddress,
      emissionsContractAddress: ctx.chainConfig.emissionsContractAddress ?? null,
      antsTokenAddress: ctx.chainConfig.antsTokenAddress ?? null,
      networkStatsUrl: ctx.chainConfig.networkStatsUrl ?? null,
      evmAddress: ctx.cryptoCtx?.evmAddress ?? null,
    };
  });

  fastify.get('/api/transactions', async () => {
    // TODO: Read deposit/withdrawal events from on-chain logs
    return { transactions: [] };
  });

  // Withdrawals are now submitted directly from the connected wallet
  // (see apps/payments/web/src/hooks/use-withdraw.ts). The contract requires
  // msg.sender == operator and sends funds to msg.sender, so the server-side
  // signer cannot execute withdraw once a separate wallet is authorized.

  fastify.get('/api/channels', async () => {
    if (!ctx.cryptoCtx) return { channels: [] };
    try {
      const url = `http://127.0.0.1:${ctx.proxyPort}/_antseed/channels?all=1`;
      const resp = await fetch(url);
      if (!resp.ok) {
        fastify.log.warn(`[/api/channels] buyer proxy returned ${resp.status}`);
        return { channels: [] };
      }
      const body = await resp.json() as { ok: boolean; channels: unknown[] };
      return { channels: body.channels ?? [] };
    } catch (err) {
      fastify.log.warn(`[/api/channels] buyer proxy unreachable: ${err instanceof Error ? err.message : String(err)}`);
      return { channels: [] };
    }
  });

  fastify.get('/api/buyer-usage', async (): Promise<BuyerUsageTotals> => {
    try {
      const url = `http://127.0.0.1:${ctx.proxyPort}/_antseed/buyer-usage`;
      const resp = await fetch(url);
      if (!resp.ok) {
        fastify.log.warn(`[/api/buyer-usage] buyer proxy returned ${resp.status}`);
        return EMPTY_BUYER_USAGE;
      }
      const body = await resp.json() as { ok: boolean; totals: BuyerUsageTotals };
      return body.totals;
    } catch (err) {
      fastify.log.warn(`[/api/buyer-usage] buyer proxy unreachable: ${err instanceof Error ? err.message : String(err)}`);
      return EMPTY_BUYER_USAGE;
    }
  });

  fastify.get('/api/operator', async (_request, reply) => {
    if (!ctx.cryptoCtx) {
      return reply.status(503).send({ ok: false, error: 'Identity not configured — set ANTSEED_IDENTITY_HEX or run antseed seller setup' });
    }

    try {
      const client = getClient();
      if (!client) {
        return { operator: '0x0000000000000000000000000000000000000000', nonce: 0 };
      }

      const buyerAddress = ctx.cryptoCtx.evmAddress;
      const [operator, nonce] = await Promise.all([
        retryRead(() => client.getOperator(buyerAddress)),
        retryRead(() => client.getOperatorNonce(buyerAddress)),
      ]);

      return { operator, nonce: Number(nonce) };
    } catch (err) {
      return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.post('/api/operator/sign', async (request, reply) => {
    if (!ctx.cryptoCtx) {
      return reply.status(503).send({ ok: false, error: 'Identity not configured' });
    }

    const body = request.body as { operator?: string } | null;
    const operator = body?.operator?.trim();
    if (!operator || !/^0x[0-9a-fA-F]{40}$/.test(operator)) {
      return reply.status(400).send({ ok: false, error: 'Invalid operator address' });
    }

    try {
      const dc = getClient();
      if (!dc) {
        return reply.status(503).send({ ok: false, error: 'Deposits contract not configured' });
      }
      const nonce = await dc.getOperatorNonce(ctx.cryptoCtx.evmAddress);
      const domain = makeDepositsDomain(ctx.chainConfig.evmChainId, ctx.cryptoConfig.depositsContractAddress);
      const signature = await signSetOperator(ctx.cryptoCtx.wallet, domain, {
        operator,
        nonce,
      });
      return { ok: true, signature, nonce: Number(nonce), buyer: ctx.cryptoCtx.evmAddress };
    } catch (err) {
      return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.get('/api/seller-status', async (_request, reply) => {
    if (!ctx.cryptoCtx) {
      return reply.status(503).send({ ok: false, error: 'Identity not configured — set ANTSEED_IDENTITY_HEX or run antseed seller setup' });
    }
    const client = getStakingClient();
    if (!client) {
      // Staking contract not configured on this chain — treat user as not-a-seller.
      // The frontend collapses seller UI when isSeller=false, so this is the safe
      // default rather than returning an error.
      return {
        evmAddress: ctx.cryptoCtx.evmAddress,
        isSeller: false,
        stake: '0',
        agentId: 0,
        stakedAt: 0,
        configured: false,
      };
    }
    try {
      const sellerAddr = ctx.cryptoCtx.evmAddress;
      const [stake, agentId, stakedAt] = await Promise.all([
        retryRead(() => client.getStake(sellerAddr)),
        retryRead(() => client.getAgentId(sellerAddr).catch(() => 0)),
        retryRead(() => client.getStakedAt(sellerAddr).catch(() => 0)),
      ]);
      return {
        evmAddress: sellerAddr,
        isSeller: stake > 0n,
        stake: formatUsdc6(stake),
        agentId: Number(agentId),
        stakedAt: Number(stakedAt),
        configured: true,
      };
    } catch (err) {
      return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.get('/api/seller-activity', async (_request, reply) => {
    if (!ctx.cryptoCtx) {
      return reply.status(503).send({ ok: false, error: 'Identity not configured' });
    }
    const stake = getStakingClient();
    const channels = getChannelsClient();
    if (!stake || !channels) {
      // One of the contracts isn't configured for this chain. Mirror
      // seller-status's behaviour: respond with a structured empty payload
      // so the frontend can render "no activity yet" instead of erroring.
      return {
        evmAddress: ctx.cryptoCtx.evmAddress,
        agentId: 0,
        channelCount: 0,
        totalVolumeUsdc: '0',
        lastSettledAt: 0,
        activeChannels: 0,
        configured: false,
      };
    }
    try {
      const sellerAddr = ctx.cryptoCtx.evmAddress;
      const agentId = await retryRead(() => stake.getAgentId(sellerAddr).catch(() => 0));
      // Channel agent-stats read keys on agentId. For a not-yet-registered
      // seller (agentId === 0) we'd revert on read — short-circuit to zero.
      if (!agentId || agentId === 0) {
        return {
          evmAddress: sellerAddr,
          agentId: 0,
          channelCount: 0,
          totalVolumeUsdc: '0',
          lastSettledAt: 0,
          activeChannels: 0,
          configured: true,
        };
      }
      const [agentStats, activeChannels] = await Promise.all([
        retryRead(() => channels.getAgentStats(agentId)),
        retryRead(() => channels.getActiveChannelCount(sellerAddr).catch(() => 0)),
      ]);
      return {
        evmAddress: sellerAddr,
        agentId,
        channelCount: agentStats.channelCount,
        totalVolumeUsdc: formatUsdc6(agentStats.totalVolumeUsdc),
        lastSettledAt: agentStats.lastSettledAt,
        activeChannels: Number(activeChannels),
        configured: true,
      };
    } catch (err) {
      return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // In-memory cache for the volume series. Keyed by `${seller}-${days}` so
  // a buyer-and-seller's two windows don't share an entry. 60s TTL — log
  // scans are heavy on mainnet RPC and the data is per-day-bucketed anyway,
  // so a stale-by-a-minute response is fine.
  const VOLUME_SERIES_TTL_MS = 60_000;
  const volumeSeriesCache = new Map<string, { at: number; data: SellerVolumeSeries }>();

  fastify.get('/api/seller-volume-series', async (request, reply) => {
    if (!ctx.cryptoCtx) {
      return reply.status(503).send({ ok: false, error: 'Identity not configured' });
    }
    const channels = getChannelsClient();
    if (!channels) {
      return {
        days: 0,
        buckets: [],
        totalVolumeUsdc: '0',
        totalSettlements: 0,
        configured: false,
      } satisfies SellerVolumeSeries;
    }
    const query = request.query as { days?: string } | undefined;
    const daysParam = Math.min(Math.max(parseInt(query?.days ?? '30', 10) || 30, 1), 90);
    const sellerAddr = ctx.cryptoCtx.evmAddress;
    const cacheKey = `${sellerAddr.toLowerCase()}-${daysParam}`;
    const cached = volumeSeriesCache.get(cacheKey);
    if (cached && Date.now() - cached.at < VOLUME_SERIES_TTL_MS) {
      return cached.data;
    }
    try {
      const data = await fetchVolumeSeries(channels, sellerAddr, daysParam);
      volumeSeriesCache.set(cacheKey, { at: Date.now(), data });
      return data;
    } catch (err) {
      return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.get('/api/emissions', async (_request, reply) => {
    const client = getEmissionsClient();
    if (!client) {
      return reply.status(503).send({ ok: false, error: 'Emissions contract not configured for this chain' });
    }
    try {
      const [info, genesis, halving] = await Promise.all([
        retryRead(() => client.getEpochInfo()),
        retryRead(() => client.getGenesis()),
        retryRead(() => client.getHalvingInterval()),
      ]);
      const emission = await retryRead(() => client.getEpochEmission(info.epoch));
      return {
        currentEpoch: info.epoch,
        epochDuration: info.epochDuration,
        currentRate: info.emission.toString(),
        epochEmission: emission.toString(),
        genesis,
        halvingInterval: halving,
      };
    } catch (err) {
      return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.get('/api/emissions/pending', async (request, reply) => {
    const client = getEmissionsClient();
    if (!client) {
      return reply.status(503).send({ ok: false, error: 'Emissions contract not configured for this chain' });
    }
    const query = request.query as { address?: string; epochs?: string } | undefined;
    const address = query?.address;
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return reply.status(400).send({ ok: false, error: 'Invalid address' });
    }
    const scanN = Math.min(Math.max(parseInt(query?.epochs ?? '10', 10) || 10, 1), 104);
    try {
      const info = await retryRead(() => client.getEpochInfo());
      const current = info.epoch;
      const startEpoch = Math.max(0, current - (scanN - 1));
      const epochList = Array.from({ length: current - startEpoch + 1 }, (_, i) => startEpoch + i);

      const rows = await Promise.all(
        epochList.map(async (epoch) => {
          const [pending, userSP, userBP, sellerClaimed, buyerClaimed, totalSP, totalBP, epEmission] = await Promise.all([
            retryRead(() => client.pendingEmissions(address, [epoch])),
            retryRead(() => client.userSellerPoints(address, epoch)),
            retryRead(() => client.userBuyerPoints(address, epoch)),
            retryRead(() => client.sellerEpochClaimed(address, epoch)),
            retryRead(() => client.buyerEpochClaimed(address, epoch)),
            retryRead(() => client.epochTotalSellerPoints(epoch)),
            retryRead(() => client.epochTotalBuyerPoints(epoch)),
            retryRead(() => client.getEpochEmission(epoch)),
          ]);
          return {
            epoch,
            epochEmission: epEmission.toString(),
            seller: {
              amount: pending.seller.toString(),
              userPoints: userSP.toString(),
              totalPoints: totalSP.toString(),
              claimed: sellerClaimed,
            },
            buyer: {
              amount: pending.buyer.toString(),
              userPoints: userBP.toString(),
              totalPoints: totalBP.toString(),
              claimed: buyerClaimed,
            },
            isCurrent: epoch === current,
          };
        }),
      );

      return { currentEpoch: current, rows };
    } catch (err) {
      return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.get('/api/emissions/shares', async (_request, reply) => {
    const client = getEmissionsClient();
    if (!client) {
      return reply.status(503).send({ ok: false, error: 'Emissions contract not configured for this chain' });
    }
    try {
      return await retryRead(() => client.getShares());
    } catch (err) {
      return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  fastify.get('/api/emissions/transfers-enabled', async (_request, reply) => {
    const client = getAntsTokenClient();
    if (!client) {
      // When the ANTS token address isn't configured, treat as "not enabled yet"
      // — the UI uses this to decide whether to show the locked banner.
      return { enabled: false, configured: false };
    }
    try {
      const enabled = await client.transfersEnabled();
      return { enabled, configured: true };
    } catch (err) {
      return reply.status(500).send({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
