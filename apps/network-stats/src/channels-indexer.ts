import type { ChannelsClient, DecodedChannelEvent } from '@antseed/node';
import type { SqliteStore } from './store.js';
import { BlockRangeIndexer } from './block-range-indexer.js';

export interface ChannelsIndexerOptions {
  store: SqliteStore;
  channelsClient: Pick<ChannelsClient, 'getChannelEvents' | 'getBlockNumber'>;
  chainId: string;
  contractAddress: string;
  deployBlock: number;
  tickIntervalMs: number;
  reorgSafetyBlocks: number;
  maxBlocksPerTick?: number;
  rpcUrl?: string;
}

/**
 * Indexer for AntseedChannels lifecycle events. Runs on the same tick cadence
 * as MetadataIndexer but with its own checkpoint row in `indexer_checkpoint`
 * (keyed on (chainId, channelsContractAddress)). The two indexers don't share
 * state and can advance independently.
 */
export class ChannelsIndexer extends BlockRangeIndexer<DecodedChannelEvent> {
  constructor(opts: ChannelsIndexerOptions) {
    super({
      chainId: opts.chainId,
      contractAddress: opts.contractAddress,
      deployBlock: opts.deployBlock,
      tickIntervalMs: opts.tickIntervalMs,
      reorgSafetyBlocks: opts.reorgSafetyBlocks,
      ...(opts.maxBlocksPerTick !== undefined ? { maxBlocksPerTick: opts.maxBlocksPerTick } : {}),
      ...(opts.rpcUrl !== undefined ? { rpcUrl: opts.rpcUrl } : {}),
      logTag: '[channels-indexer]',
      strategy: {
        fetchEvents: (range) => opts.channelsClient.getChannelEvents(range),
        getBlockNumber: () => opts.channelsClient.getBlockNumber(),
        getCheckpoint: (chainId, contract) => opts.store.getCheckpoint(chainId, contract),
        apply: (events, checkpoint, ts, cpTs) =>
          opts.store.applyChannelBatch(opts.chainId, opts.contractAddress, events, checkpoint, ts, cpTs),
      },
    });
  }
}
