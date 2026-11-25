import type { AgyRuntime } from '../runtime/runtime.types.ts';

/**
 * A share of a pooled runtime. Every holder of the same runtime must release its own lease; the runtime is disposed,
 * ending its `agy` process, when the last one is released.
 */
export type AgyRuntimeLease = {
  /**
   * The shared runtime. Do not dispose it directly: release the lease instead.
   */
  readonly runtime: AgyRuntime;
  /**
   * Gives the share back, disposing the runtime when no lease is left. Releasing the same lease again does nothing.
   *
   * @returns Resolves once the runtime has been disposed, or at once while other leases remain.
   *
   * @example
   * ```ts
   * const lease = acquireAgyRuntime(options);
   *
   * return () => lease.release();
   * ```
   */
  readonly release: () => Promise<void>;
};

/**
 * A pooled runtime and how many leases hold it.
 */
export type PoolEntry = {
  /**
   * The runtime every lease of this entry shares.
   */
  readonly runtime: AgyRuntime;
  /**
   * The leases not yet released; the runtime is disposed when it reaches 0.
   */
  leases: number;
};
