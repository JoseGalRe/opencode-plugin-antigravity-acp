import type { AgyRuntime, RequestPermission } from '../../agy/runtime/runtime.types.ts';
import type { StageFile } from '../prompt/prompt.types.ts';

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
  /**
   * Decides the permission requests of the sessions this location opens, so a runtime shared by several locations
   * asks the right one.
   */
  readonly requestPermission: RequestPermission;
  /**
   * Writes an attached file `agy` has to read from disk (anything but text and images), and returns its path.
   *
   * @param file The attached file.
   *
   * @returns The absolute path `agy` is given a link to.
   *
   * @example
   * ```ts
   * stageFile: (file) => attachments.write(file),
   * ```
   */
  readonly stageFile: StageFile;
  /**
   * Hears the context window `agy` reports in a turn's `usage_update` (`size`), on every report.
   *
   * @param modelId The `agy` model that ran the turn (`gemini-4-neon`).
   * @param contextWindow The window in tokens (`1048576`).
   *
   * @example
   * ```ts
   * onContextWindow: (modelId, contextWindow) => learnContextWindow(modelId, contextWindow),
   * ```
   */
  readonly onContextWindow: (modelId: string, contextWindow: number) => void;
};
