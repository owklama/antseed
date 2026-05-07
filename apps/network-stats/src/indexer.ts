import type { DecodedMetadataRecorded, StatsClient } from '@antseed/node';
import type { SqliteStore } from './store.js';
import { BlockRangeIndexer } from './block-range-indexer.js';

export interface MetadataIndexerOptions {
  store: SqliteStore;
  statsClient: Pick<StatsClient, 'getMetadataRecordedEvents' | 'getBlockNumber'>;
  chainId: string;
  contractAddress: string;
  deployBlock: number;
  tickIntervalMs: number;
  reorgSafetyBlocks: number;
  maxBlocksPerTick?: number;
  rpcUrl?: string;
}

/**
 * Indexer for AntseedStats MetadataRecorded events. Thin wrapper around
 * BlockRangeIndexer — the only specifics are the events client method and
 * the SqliteStore.applyBatch write.
 */
export class MetadataIndexer extends BlockRangeIndexer<DecodedMetadataRecorded> {
  constructor(opts: MetadataIndexerOptions) {
    super({
      chainId: opts.chainId,
      contractAddress: opts.contractAddress,
      deployBlock: opts.deployBlock,
      tickIntervalMs: opts.tickIntervalMs,
      reorgSafetyBlocks: opts.reorgSafetyBlocks,
      ...(opts.maxBlocksPerTick !== undefined ? { maxBlocksPerTick: opts.maxBlocksPerTick } : {}),
      ...(opts.rpcUrl !== undefined ? { rpcUrl: opts.rpcUrl } : {}),
      logTag: '[indexer]',
      strategy: {
        fetchEvents: (range) => opts.statsClient.getMetadataRecordedEvents(range),
        getBlockNumber: () => opts.statsClient.getBlockNumber(),
        getCheckpoint: (chainId, contract) => opts.store.getCheckpoint(chainId, contract),
        apply: (events, checkpoint, ts, cpTs) =>
          opts.store.applyBatch(opts.chainId, opts.contractAddress, events, checkpoint, ts, cpTs),
      },
    });
  }
}
