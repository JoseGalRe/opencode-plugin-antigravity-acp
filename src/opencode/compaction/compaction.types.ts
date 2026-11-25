/**
 * The prompt that makes `agy` compact a session: its `/compact` command, which it announces through ACP. Only a
 * leading `/compact` compacts; anywhere else it is plain text.
 */
export const COMPACT_COMMAND = '/compact';

/**
 * What `agy` reported while compacting a session.
 */
export type AgyCompaction = {
  /**
   * The text `agy` streamed while compacting, trimmed; empty when it streamed none.
   */
  readonly text: string;
  /**
   * The context used after compacting, from the last `usage_update`; `undefined` when `agy` sent none.
   */
  readonly contextTokens: number | undefined;
};

/**
 * Why OpenCode compacts a session, as its `session.compaction.started` event says: the user asked (`manual`) or
 * OpenCode decided on its own (`auto`).
 */
export type CompactionReason = 'auto' | 'manual';

/**
 * Pairs OpenCode's compaction hook with the `session.compaction.started` event that says why it runs. The hook does
 * not carry the reason, and the event reaches plugins a few milliseconds after the hook starts (OpenCode 2.4.1), so
 * the hook waits for it.
 */
export type CompactionReasons = {
  /**
   * Records a `session.compaction.started` event, handing its reason to the hook waiting for that session or keeping
   * it for the hook still to come.
   *
   * @param sessionID The OpenCode session being compacted.
   * @param reason Why it is compacted.
   *
   * @example
   * ```ts
   * reasons.started(event.data.sessionID, event.data.reason);
   * ```
   */
  readonly started: (sessionID: string, reason: CompactionReason) => void;
  /**
   * Forgets a session's compaction once it ended or failed, so a reason never outlives its compaction.
   *
   * @param sessionID The OpenCode session.
   *
   * @example
   * ```ts
   * reasons.finished(event.data.sessionID);
   * ```
   */
  readonly finished: (sessionID: string) => void;
  /**
   * The reason of the compaction a hook is running for, waiting for its event when it has not arrived yet.
   *
   * @param sessionID The OpenCode session the hook runs for.
   * @param timeout How long to wait for the event, in milliseconds.
   *
   * @returns The reason, or `undefined` when no event arrived in time.
   *
   * @example
   * ```ts
   * if ((await reasons.reasonFor(event.sessionID, 2_000)) === 'manual') {
   *   await compactAgySession(session);
   * }
   * ```
   */
  readonly reasonFor: (sessionID: string, timeout: number) => Promise<CompactionReason | undefined>;
};
