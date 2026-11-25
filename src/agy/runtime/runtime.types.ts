import type { AgyCatalog } from '../../opencode/models/models.types.ts';
import type { AgyProcessOptions } from '../process/process.types.ts';
import type {
  ContentBlock,
  PromptResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionUpdate,
} from '@agentclientprotocol/sdk';

/**
 * Decides a permission request from `agy`, on behalf of the OpenCode session whose turn asked. Each OpenCode
 * session registers its own when its ACP session opens, so one `agy` process can serve several OpenCode locations.
 *
 * @param request The `session/request_permission` request.
 * @param sessionID The OpenCode session the ACP session belongs to.
 * @param signal Aborts when the turn is cancelled.
 *
 * @returns The selected option, or `cancelled`.
 *
 * @example
 * ```ts
 * const requestPermission: RequestPermission = async (request, sessionID) => {
 *   const check = permissionCheckFor(request);
 *
 *   try {
 *     await ctx.permission.assert({ sessionID, action: check.action, resources: [...check.resources] });
 *
 *     return answerPermission(request.options, true);
 *   } catch {
 *     return answerPermission(request.options, false);
 *   }
 * };
 * ```
 */
export type RequestPermission = (
  request: RequestPermissionRequest,
  sessionID: string,
  signal: AbortSignal,
) => Promise<RequestPermissionResponse>;

/**
 * How the runtime starts `agy acp` and where its diagnostics go.
 */
export type AgyRuntimeOptions = {
  /**
   * How to start the process: the executable, its arguments, working directory and environment. Its stderr goes to
   * `log`. The working directory only matters to `agy` itself: every ACP session names its own.
   */
  readonly process: Omit<AgyProcessOptions, 'onStderr'>;
  /**
   * Receives diagnostics: `agy`'s stderr, process exits and failures that do not reach a turn.
   *
   * @param message What happened.
   * @param detail The error or extra data, when there is one.
   *
   * @example
   * ```ts
   * log: (message, detail) => console.warn(`[antigravity] ${message}`, detail ?? ''),
   * ```
   */
  readonly log: (message: string, detail?: unknown) => void;
};

/**
 * One ACP session, bound to one OpenCode session.
 */
export type AgySession = {
  /**
   * The ACP session ID `agy` returned from `session/new`.
   */
  readonly id: string;
  /**
   * Sets a session config option, such as the model or the thinking level, when it differs from its current value.
   * Setting the current value again sends nothing.
   *
   * @param configId The option ID (`model`, `thought_level`).
   * @param value The value to select (`gemini-4-neon`, `high`).
   *
   * @returns Resolves once `agy` has applied it.
   *
   * @example
   * ```ts
   * await session.configure('model', 'gemini-4-neon');
   * ```
   */
  readonly configure: (configId: string, value: string) => Promise<void>;
  /**
   * Runs one turn and passes its updates to `onUpdate` while it runs.
   *
   * @param prompt The user's content blocks.
   * @param onUpdate Receives each `session/update` of the turn, in order.
   * @param signal Cancels the turn when aborted (`session/cancel`).
   *
   * @returns The `session/prompt` response, with the turn's `stopReason`.
   *
   * @example
   * ```ts
   * const translator = createTurnTranslator();
   * const response = await session.prompt(blocks, (update) => emit(translator.update(update)), signal);
   * ```
   */
  readonly prompt: (
    prompt: readonly ContentBlock[],
    onUpdate: (update: SessionUpdate) => void,
    signal?: AbortSignal,
  ) => Promise<PromptResponse>;
};

/**
 * The `agy acp` process this plugin talks to, started on first use and restarted after it exits.
 */
export type AgyRuntime = {
  /**
   * Reads what `agy` offers this client by opening and closing a session; no prompt, so no quota is spent. The
   * answer is kept; a failed read is retried on the next call. Listeners of `watchCatalog` hear it too.
   *
   * @returns The Gemini models and the thinking levels.
   *
   * @example
   * ```ts
   * const { models, thoughtLevels } = await runtime.catalog();
   * ```
   */
  readonly catalog: () => Promise<AgyCatalog>;
  /**
   * Follows the catalog: the listener hears it each time `agy` sends it, from `catalog()` or from any new session's
   * config options, so a saved catalog is refreshed by the first real session without a separate read.
   *
   * @param listener Receives the catalog, never with an empty model list.
   *
   * @returns A function that stops the listener; safe to call more than once.
   *
   * @example
   * ```ts
   * const stop = runtime.watchCatalog((catalog) => saveAndRegister(catalog));
   * ```
   */
  readonly watchCatalog: (listener: (catalog: AgyCatalog) => void) => () => void;
  /**
   * The ACP session of an OpenCode session, created on first use in `cwd`. Concurrent calls for the same OpenCode
   * session share one `session/new`. Sessions are lost when the process exits: the next call creates a new one.
   *
   * @param sessionID The OpenCode session ID.
   * @param cwd The absolute directory the session works in.
   * @param requestPermission Decides the session's permission requests; the first call's handler is kept.
   *
   * @returns The ACP session.
   *
   * @example
   * ```ts
   * const session = await runtime.session(sessionID, ctx.location.directory, requestPermission);
   * ```
   */
  readonly session: (sessionID: string, cwd: string, requestPermission: RequestPermission) => Promise<AgySession>;
  /**
   * Closes the ACP session of an OpenCode session, if it has one. Safe to call for unknown sessions.
   *
   * @param sessionID The OpenCode session ID.
   *
   * @returns Resolves once `agy` has closed it.
   *
   * @example
   * ```ts
   * await runtime.forget(event.data.sessionID);
   * ```
   */
  readonly forget: (sessionID: string) => Promise<void>;
  /**
   * Ends the `agy` process and forgets every session and catalog listener. Safe to call more than once.
   *
   * @returns Resolves once the process has been told to stop.
   *
   * @example
   * ```ts
   * await runtime.dispose();
   * ```
   */
  readonly dispose: () => Promise<void>;
};
