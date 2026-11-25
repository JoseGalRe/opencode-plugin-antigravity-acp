import type { AISDKHooks } from '@opencode/plugin/promise/aisdk';

/**
 * The AI SDK `LanguageModelV3` that OpenCode accepts from the `aisdk` `language` hook. Derived from OpenCode's own
 * hook type, so it always matches the AI SDK version OpenCode was built with.
 */
export type LanguageModel = NonNullable<AISDKHooks['language']['language']>;

/**
 * What OpenCode passes to `doStream` for one model call: the prompt, its tools, headers and abort signal.
 */
export type CallOptions = Parameters<LanguageModel['doStream']>[0];

/**
 * One message of the prompt OpenCode sends: system, user, assistant or tool.
 */
export type PromptMessage = CallOptions['prompt'][number];

/**
 * What `doStream` resolves with: the stream of parts for one model call.
 */
export type StreamResult = Awaited<ReturnType<LanguageModel['doStream']>>;

/**
 * One part of a model call's stream: text, reasoning, a tool call or result, the finish or an error.
 */
export type StreamPart = StreamResult['stream'] extends ReadableStream<infer Part> ? Part : never;

/**
 * The token usage a `finish` part reports.
 */
export type Usage = Extract<StreamPart, { type: 'finish' }>['usage'];

/**
 * Why a model call finished, as a `finish` part reports it.
 */
export type FinishReason = Extract<StreamPart, { type: 'finish' }>['finishReason'];
