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
