import { COMPACT_COMMAND } from './compaction.types.ts';

import type { AgySession } from '../../agy/runtime/runtime.types.ts';
import type { AgyCompaction, CompactionReason, CompactionReasons } from './compaction.types.ts';
import type { SessionUpdate } from '@agentclientprotocol/sdk';

/**
 * Compacts an ACP session with `agy`'s own `/compact`: `agy` replaces older turns with a checkpoint summary in its
 * session, which is where the conversation's context lives. It runs one `agy` turn, so it spends quota.
 *
 * @param session The ACP session to compact.
 * @param signal Cancels the compaction (`session/cancel`); a cancelled compaction writes no checkpoint.
 *
 * @returns What `agy` reported.
 */
export async function compactAgySession(session: AgySession, signal?: AbortSignal): Promise<AgyCompaction> {
  const chunks: string[] = [];

  let contextTokens: number | undefined;

  function onUpdate(update: SessionUpdate): void {
    if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
      chunks.push(update.content.text);
    } else if (update.sessionUpdate === 'usage_update') {
      contextTokens = update.used;
    }
  }

  const response = await session.prompt([{ type: 'text', text: COMPACT_COMMAND }], onUpdate, signal);

  if (response.stopReason !== 'end_turn') {
    throw new Error(`Antigravity did not compact the conversation: the turn ended with ${response.stopReason}`);
  }

  return { text: chunks.join('').trim(), contextTokens };
}

/**
 * Creates the pairing of compaction hooks with their `session.compaction.started` events.
 *
 * @returns The pairing, with no reason recorded and no hook waiting.
 */
export function createCompactionReasons(): CompactionReasons {
  // Reasons whose event came before their hook, and hooks waiting for their event, by OpenCode session.
  const early = new Map<string, CompactionReason>();
  const waiting = new Map<string, (reason: CompactionReason | undefined) => void>();

  return {
    started: (sessionID, reason) => {
      const resolve = waiting.get(sessionID);

      if (resolve) {
        resolve(reason);
      } else {
        early.set(sessionID, reason);
      }
    },
    finished: (sessionID) => {
      early.delete(sessionID);
      waiting.get(sessionID)?.(undefined);
    },
    reasonFor: (sessionID, timeout) => {
      const known = early.get(sessionID);

      if (known) {
        early.delete(sessionID);

        return Promise.resolve(known);
      }

      // A newer hook for the same session takes over; the older one gives up.
      waiting.get(sessionID)?.(undefined);

      return new Promise((resolve) => {
        const settle = (reason: CompactionReason | undefined) => {
          clearTimeout(timer);

          if (waiting.get(sessionID) === settle) {
            waiting.delete(sessionID);
          }

          resolve(reason);
        };

        const timer = setTimeout(() => settle(undefined), timeout);

        timer.unref();
        waiting.set(sessionID, settle);
      });
    },
  };
}
