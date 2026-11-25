import type { AgyRuntime } from '../../agy/runtime/runtime.types.ts';

/**
 * The request header that carries the OpenCode session ID to `doStream`; the `model.request` hook sets it.
 */
export const SESSION_HEADER = 'x-antigravity-session';

/**
 * The request header that carries the selected variant, which is `agy`'s thinking level; the `model.request` hook
 * sets it when a variant is selected.
 */
export const VARIANT_HEADER = 'x-antigravity-variant';

/**
 * What a language model needs to run turns.
 */
export type LanguageModelContext = {
  /**
   * The runtime that owns the `agy acp` process and its sessions.
   */
  readonly runtime: AgyRuntime;
  /**
   * The absolute directory new ACP sessions work in: the plugin's OpenCode location.
   */
  readonly directory: string;
};
