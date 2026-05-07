import { ethers } from 'ethers';

/**
 * Strategy that adapts a domain-specific events client + store-write method
 * to the generic block-range indexer below. All four members are dispatched
 * once per tick.
 */
export interface IndexerStrategy<E extends { blockNumber: number }> {
  fetchEvents(range: { fromBlock: number; toBlock: number }): Promise<E[]>;
  getBlockNumber(): Promise<number>;
  getCheckpoint(chainId: string, contractAddress: string): number | null;
  apply(
    events: E[],
    newCheckpoint: number,
    blockTimestamps?: Map<number, number>,
    newCheckpointTimestamp?: number | null,
  ): void;
}

export interface BlockRangeIndexerOptions<E extends { blockNumber: number }> {
  strategy: IndexerStrategy<E>;
  chainId: string;              // e.g. 'base-mainnet'
  contractAddress: string;      // canonical contract — lowercased externally
  deployBlock: number;          // one-time seed for cold start
  tickIntervalMs: number;       // e.g. 60_000
  reorgSafetyBlocks: number;    // e.g. 12
  maxBlocksPerTick?: number;    // default 2_000
  // When set, fetch block headers for each event block so the apply callback
  // can stamp block_timestamp on rows for windowed reads. Omitted in unit
  // tests that mock the events client.
  rpcUrl?: string;
  logTag: string;               // e.g. '[indexer]', '[channels-indexer]'
}

/**
 * Reusable polling indexer for any contract that emits a stream of events
 * over a monotonically advancing block range. Every concrete indexer in
 * network-stats (MetadataIndexer, ChannelsIndexer) wraps this — the only
 * differences are the events fetched, the apply method on the store, and
 * the log tag.
 *
 * Tick flow per iteration:
 *   1. Read chain head, compute safeTo = head − reorgSafetyBlocks.
 *   2. Read checkpoint via the strategy; fromBlock = checkpoint+1 or deployBlock.
 *   3. Bail out if the range is empty.
 *   4. Fetch events via the strategy in (fromBlock, toBlock).
 *   5. If rpcUrl is set, fetch block headers for unique event blocks +
 *      the toBlock checkpoint timestamp.
 *   6. Hand events + timestamps to the strategy's apply method, which writes
 *      atomically (the store implementations wrap in a transaction).
 *
 * Re-entrancy: a guard short-circuits the next interval fire if the previous
 * tick is still running. Without it, two concurrent ticks would read the
 * same checkpoint, fetch the same range, and both apply deltas — permanently
 * doubling every affected row's cumulative totals.
 */
export class BlockRangeIndexer<E extends { blockNumber: number }> {
  private readonly _strategy: IndexerStrategy<E>;
  private readonly _chainId: string;
  private readonly _contractAddress: string;
  private readonly _deployBlock: number;
  private readonly _tickIntervalMs: number;
  private readonly _reorgSafetyBlocks: number;
  private readonly _maxBlocksPerTick: number;
  private readonly _provider: ethers.JsonRpcProvider | undefined;
  private readonly _logTag: string;
  private _timer: ReturnType<typeof setInterval> | undefined;
  private _running = false;
  private _latestBlock: number | null = null;

  constructor(options: BlockRangeIndexerOptions<E>) {
    if (options.deployBlock < 0) {
      throw new Error('deployBlock must be >= 0');
    }
    if (options.tickIntervalMs <= 0) {
      throw new Error('tickIntervalMs must be > 0');
    }

    this._strategy = options.strategy;
    this._chainId = options.chainId;
    this._contractAddress = options.contractAddress;
    this._deployBlock = options.deployBlock;
    this._tickIntervalMs = options.tickIntervalMs;
    this._reorgSafetyBlocks = options.reorgSafetyBlocks;
    this._logTag = options.logTag;

    const provided = options.maxBlocksPerTick;
    this._maxBlocksPerTick = (provided !== undefined && provided > 0) ? provided : 2_000;

    this._provider = options.rpcUrl ? new ethers.JsonRpcProvider(options.rpcUrl) : undefined;
  }

  start(): void {
    void this.tick().catch((err) => console.error(`${this._logTag} error:`, err));
    this._timer = setInterval(
      () => void this.tick().catch((err) => console.error(`${this._logTag} error:`, err)),
      this._tickIntervalMs,
    );
  }

  stop(): void {
    clearInterval(this._timer);
  }

  /**
   * Returns the chain head observed on the most recent tick plus the
   * indexer's reorg safety buffer. Null latestBlock means no tick has run
   * yet (process just started and the first eth_blockNumber is still in flight).
   */
  getChainHead(): { latestBlock: number | null; reorgSafetyBlocks: number } {
    return { latestBlock: this._latestBlock, reorgSafetyBlocks: this._reorgSafetyBlocks };
  }

  /** Exposed for tests — runs one iteration end-to-end. Never throws out. */
  async tick(): Promise<void> {
    if (this._running) return;
    this._running = true;
    try {
      const latest = await this._strategy.getBlockNumber();
      this._latestBlock = latest;
      const safeTo = latest - this._reorgSafetyBlocks;

      if (safeTo < this._deployBlock) {
        return;
      }

      const checkpoint = this._strategy.getCheckpoint(this._chainId, this._contractAddress);
      const fromBlock = checkpoint === null ? this._deployBlock : checkpoint + 1;

      if (fromBlock > safeTo) {
        return;
      }

      const toBlock = Math.min(safeTo, fromBlock + this._maxBlocksPerTick - 1);

      const events = await this._strategy.fetchEvents({ fromBlock, toBlock });

      // Fetch block timestamps for each distinct block that carried an event,
      // so apply can stamp wall-clock timestamps onto rows. Only distinct
      // blocks matter — a block with N events costs one getBlock call.
      let blockTimestamps: Map<number, number> | undefined;
      if (this._provider && events.length > 0) {
        const uniqueBlocks = Array.from(new Set(events.map((e) => e.blockNumber)));
        const blocks = await Promise.all(uniqueBlocks.map((b) => this._provider!.getBlock(b)));
        blockTimestamps = new Map();
        for (let i = 0; i < uniqueBlocks.length; i++) {
          const block = blocks[i];
          if (block) blockTimestamps.set(uniqueBlocks[i]!, block.timestamp);
        }
      }

      // Always capture the checkpoint block's wall-clock so /stats can show
      // how fresh the indexer is. Reuse the timestamp from the event-block
      // fetch above if toBlock happened to carry an event, otherwise one
      // extra getBlock call.
      let newCheckpointTimestamp: number | null = null;
      if (this._provider) {
        if (blockTimestamps?.has(toBlock)) {
          newCheckpointTimestamp = blockTimestamps.get(toBlock)!;
        } else {
          const block = await this._provider.getBlock(toBlock);
          newCheckpointTimestamp = block?.timestamp ?? null;
        }
      }

      this._strategy.apply(events, toBlock, blockTimestamps, newCheckpointTimestamp);

      console.log(`${this._logTag} ${fromBlock}..${toBlock} events=${events.length}`);
    } catch (err) {
      console.error(`${this._logTag} tick error:`, err);
    } finally {
      this._running = false;
    }
  }
}
