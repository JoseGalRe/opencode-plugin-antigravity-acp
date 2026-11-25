import packageJson from '../../../package.json' with { type: 'json' };

import type {
  CloseSessionRequest,
  Implementation,
  InitializeResponse,
  LoadSessionRequest,
  LoadSessionResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  ReadTextFileRequest,
  ReadTextFileResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ResumeSessionRequest,
  ResumeSessionResponse,
  SessionNotification,
  SetSessionConfigOptionRequest,
  SetSessionConfigOptionResponse,
  WriteTextFileRequest,
} from '@agentclientprotocol/sdk';

/**
 * Who this client is, sent as is in `initialize`. It names this plugin and never
 * another editor: `agy` decides what to offer from it, and that stays its call.
 */
export const CLIENT_INFO: Implementation = {
  name: '@josegalre/opencode-plugin-antigravity-acp',
  title: 'OpenCode (Antigravity ACP)',
  version: packageJson.version,
};

/**
 * File access `agy` delegates to the client; advertised only when given.
 */
export type FileSystemHandlers = {
  /**
   * Answers `fs/read_text_file`: the contents of a file as the client sees it, unsaved changes included.
   *
   * @param request The absolute `path` to read, and optionally the 1-based `line` to start at and how many lines
   * (`limit`) to return.
   * @param signal Aborts when `agy` cancels the request or the connection closes.
   *
   * @returns The text read, as `{ content }`.
   *
   * @example
   * ```ts
   * readTextFile: async ({ path, line, limit }, signal) => {
   *   const text = await readFile(path, { encoding: 'utf8', signal });
   *   const lines = text.split('\n').slice((line ?? 1) - 1);
   *
   *   return { content: (limit == null ? lines : lines.slice(0, limit)).join('\n') };
   * },
   * ```
   */
  readonly readTextFile: (request: ReadTextFileRequest, signal: AbortSignal) => Promise<ReadTextFileResponse>;
  /**
   * Answers `fs/write_text_file`: writes a whole file, creating it when missing.
   *
   * @param request The absolute `path` to write and its full new `content`.
   * @param signal Aborts when `agy` cancels the request or the connection closes.
   *
   * @returns Resolves once the file is written.
   *
   * @example
   * ```ts
   * writeTextFile: async ({ path, content }, signal) => {
   *   await writeFile(path, content, { encoding: 'utf8', signal });
   * },
   * ```
   */
  readonly writeTextFile: (request: WriteTextFileRequest, signal: AbortSignal) => Promise<void>;
};

/**
 * What the client does with what `agy` sends it: updates, permission requests and, optionally, file access.
 */
export type AgyClientHandlers = {
  /**
   * Receives every `session/update`, synchronously and in the order `agy` sent them: message and thought chunks,
   * tool calls, plans, commands, mode and option changes. Updates arrive outside turns too, such as the available
   * commands after `session/new`.
   *
   * @param notification The update and the `sessionId` it belongs to.
   *
   * @example
   * ```ts
   * onSessionUpdate: ({ sessionId, update }) => {
   *   if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
   *     turns.get(sessionId)?.appendText(update.content.text);
   *   }
   * },
   * ```
   */
  readonly onSessionUpdate: (notification: SessionNotification) => void;
  /**
   * Decides a `session/request_permission` by choosing one of the request's `options`. The client answers
   * `cancelled` instead, whatever this returns, once the turn is cancelled.
   *
   * @param request The tool call that needs permission, and the options to choose from (`allow_once`,
   * `allow_always`, `reject_once`, `reject_always`).
   * @param signal Aborts when the turn is cancelled or `agy` withdraws the request.
   *
   * @returns The chosen option as `{ outcome: { outcome: 'selected', optionId } }`, or `{ outcome: { outcome:
   * 'cancelled' } }`.
   *
   * @example
   * ```ts
   * requestPermission: async ({ toolCall, options }, signal) => {
   *   const allowed = await askUser(toolCall.title, signal);
   *   const option = options.find(({ kind }) => kind === (allowed ? 'allow_once' : 'reject_once'));
   *
   *   return option
   *     ? { outcome: { outcome: 'selected', optionId: option.optionId } }
   *     : { outcome: { outcome: 'cancelled' } };
   * },
   * ```
   */
  readonly requestPermission: (request: RequestPermissionRequest, signal: AbortSignal) => Promise<RequestPermissionResponse>;
  /**
   * Serves `fs/read_text_file` and `fs/write_text_file`. When omitted, the client does not advertise file access and
   * `agy` uses the disk itself.
   */
  readonly fileSystem?: FileSystemHandlers;
};

/**
 * A connected, initialized ACP client for one `agy acp` server.
 */
export type AgyClient = {
  /**
   * The server's `initialize` answer: its capabilities, identity and sign-in methods.
   */
  readonly agent: InitializeResponse;
  /**
   * Sends `session/new`: starts a session in `cwd`, with the MCP servers `agy` should connect to.
   *
   * @param request The absolute `cwd`, the `mcpServers` (may be empty) and optionally `additionalDirectories`.
   *
   * @returns The new `sessionId`, with the session's modes and config options (model, thinking level, mode).
   *
   * @example
   * ```ts
   * const { sessionId, configOptions } = await acp.newSession({ cwd: '/repo', mcpServers: [] });
   * ```
   */
  readonly newSession: (request: NewSessionRequest) => Promise<NewSessionResponse>;
  /**
   * Sends `session/load`: reopens a saved session and replays its history as `session/update` notifications before
   * resolving.
   *
   * @param request The `sessionId` to load, its `cwd` and `mcpServers`.
   *
   * @returns The session's modes and config options.
   *
   * @example
   * ```ts
   * await acp.loadSession({ sessionId: saved.sessionId, cwd: '/repo', mcpServers: [] });
   * ```
   */
  readonly loadSession: (request: LoadSessionRequest) => Promise<LoadSessionResponse>;
  /**
   * Sends `session/resume`: reopens a saved session without replaying its history.
   *
   * @param request The `sessionId` to resume, its `cwd` and `mcpServers`.
   *
   * @returns The session's modes and config options.
   *
   * @example
   * ```ts
   * await acp.resumeSession({ sessionId: saved.sessionId, cwd: '/repo', mcpServers: [] });
   * ```
   */
  readonly resumeSession: (request: ResumeSessionRequest) => Promise<ResumeSessionResponse>;
  /**
   * Sends `session/close`: ends a session on the server and frees what it holds. Closing an unknown session
   * resolves too.
   *
   * @param request The `sessionId` to close.
   *
   * @returns Resolves once the server has closed it.
   *
   * @example
   * ```ts
   * await acp.closeSession({ sessionId });
   * ```
   */
  readonly closeSession: (request: CloseSessionRequest) => Promise<void>;
  /**
   * Sends `session/set_config_option`: selects a value of one of the session's config options, such as the model or
   * the thinking level.
   *
   * @param request The `sessionId`, the option's `configId` and the `value` to select.
   *
   * @returns All the session's config options, with their current values after the change.
   *
   * @example
   * ```ts
   * await acp.setConfigOption({ sessionId, configId: 'model', value: 'gemini-4-neon' });
   * ```
   */
  readonly setConfigOption: (request: SetSessionConfigOptionRequest) => Promise<SetSessionConfigOptionResponse>;
  /**
   * Runs one turn. Aborting `signal` sends `session/cancel` and answers the
   * turn's pending permission requests with `cancelled`; the promise still
   * settles with `agy`'s own response, normally `stopReason: "cancelled"`.
   *
   * @param request The `sessionId` and the `prompt` content blocks (text, images, embedded resources).
   * @param signal Cancels the turn when aborted.
   *
   * @returns Why the turn stopped: `end_turn`, `max_tokens`, `max_turn_requests`, `refusal` or `cancelled`.
   *
   * @example
   * ```ts
   * const turn = new AbortController();
   * const { stopReason } = await acp.prompt({ sessionId, prompt: [{ type: 'text', text: 'Fix the test' }] }, turn.signal);
   * ```
   */
  readonly prompt: (request: PromptRequest, signal?: AbortSignal) => Promise<PromptResponse>;
  /**
   * Settles when the connection has closed, from either side.
   */
  readonly closed: Promise<void>;
  /**
   * Closes the connection and rejects its pending requests. Does nothing once it is closed. It does not end the
   * `agy` process: call `AgyProcess.kill` for that.
   *
   * @param error The reason pending requests reject with; a generic closed-connection error when omitted.
   *
   * @example
   * ```ts
   * acp.close();
   * agy.kill();
   * ```
   */
  readonly close: (error?: unknown) => void;
};
