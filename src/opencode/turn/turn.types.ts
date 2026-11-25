import type { StreamPart } from '../ai-sdk/ai-sdk.types.ts';
import type { PromptResponse, SessionUpdate } from '@agentclientprotocol/sdk';

/**
 * Turns one ACP turn into the stream parts of one OpenCode model call. It keeps the state a turn needs: the open
 * text or reasoning block, the tool calls seen and the latest context usage. Create one per turn.
 */
export type TurnTranslator = {
  /**
   * Translates one `session/update` of the turn, in the order `agy` sent them.
   *
   * @param update The update, without its session ID.
   *
   * @returns The parts to stream for it, often none (plans, commands and mode changes are not streamed).
   *
   * @example
   * ```ts
   * for (const part of translator.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hi' } })) {
   *   controller.enqueue(part);
   * }
   * ```
   */
  readonly update: (update: SessionUpdate) => StreamPart[];
  /**
   * Ends the turn: closes the open block, settles tool calls that never finished as errors, and adds the `finish`
   * part. Call it once, after `session/prompt` resolved.
   *
   * @param response The `session/prompt` response with the turn's `stopReason`.
   *
   * @returns The closing parts, the last one being `finish`.
   *
   * @example
   * ```ts
   * const response = await acp.prompt({ sessionId, prompt }, signal);
   *
   * for (const part of translator.finish(response)) {
   *   controller.enqueue(part);
   * }
   * ```
   */
  readonly finish: (response: PromptResponse) => StreamPart[];
};

/**
 * The kind of streamed block a turn can have open: `agy`'s answer or its thoughts.
 */
export type BlockKind = 'text' | 'reasoning';

/**
 * The text or reasoning block a turn is streaming into; deltas of another kind close it first.
 */
export type OpenBlock = {
  /**
   * Whether it holds the answer (`text`) or the thoughts (`reasoning`).
   */
  readonly kind: BlockKind;
  /**
   * The block's stream ID, unique in the turn (`text-1`, `reasoning-2`).
   */
  readonly id: string;
};

/**
 * What a turn knows about one of `agy`'s tool calls.
 */
export type ToolState = {
  /**
   * The tool name streamed to OpenCode, from the ACP tool kind (`execute`, `edit`).
   */
  name: string;
  /**
   * The latest human-readable title `agy` gave the call (`Run ls`).
   */
  title: string;
  /**
   * Whether its `tool-result` was already streamed, so it is never settled twice.
   */
  settled: boolean;
};

/**
 * The result of a provider-executed tool call, as the AI SDK `tool-result` part carries it.
 */
export type ToolResult = Extract<StreamPart, { type: 'tool-result' }>['result'];

/**
 * The token usage of the AI SDK `finish` part, the shape OpenCode records per message.
 */
export type FinishUsage = Extract<StreamPart, { type: 'finish' }>['usage'];

/**
 * The token counts `agy` returns with each turn in `PromptResponse.usage` (unstable in ACP, so absent from the stable
 * SDK types), once validated. Verified with agy 1.5.16: the counts are per turn and add up to `totalTokens`.
 */
export type TurnUsage = {
  /**
   * Input tokens not read from the cache: `agy` counts cache reads apart.
   */
  readonly inputTokens: number;
  /**
   * Output tokens, thoughts included.
   */
  readonly outputTokens: number;
  /**
   * The thought tokens within `outputTokens`; `undefined` when `agy` does not report them.
   */
  readonly thoughtTokens: number | undefined;
  /**
   * Input tokens read from the cache; `undefined` when not reported.
   */
  readonly cachedReadTokens: number | undefined;
  /**
   * Input tokens written to the cache; `undefined` when not reported.
   */
  readonly cachedWriteTokens: number | undefined;
};
