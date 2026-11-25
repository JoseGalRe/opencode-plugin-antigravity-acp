import type { Stream } from '@agentclientprotocol/sdk';

/**
 * How to start the ACP server. `command` is `agy` on PATH unless configured otherwise.
 */
export type AgyProcessOptions = {
  /**
   * The executable to run: `agy` on PATH, or an absolute path to it.
   */
  readonly command: string;
  /**
   * Arguments after the executable, normally `DEFAULT_AGY_ARGS` and any extra `agy acp` flags.
   */
  readonly args: readonly string[];
  /**
   * The working directory of the process, which `agy` takes as its workspace.
   */
  readonly cwd: string;
  /**
   * Variables added to this process's environment for `agy`, such as `AGY_CLI_AUTO_COMPACT_OVERRIDE`; they win over
   * inherited ones. None when omitted.
   */
  readonly extraEnv?: Readonly<Record<string, string>>;
  /**
   * Receives the server's stderr as UTF-8 text, in chunks as they arrive. `agy` writes its own diagnostics there;
   * stdout is reserved for ACP.
   *
   * @param text The next chunk of stderr, not necessarily a whole line.
   *
   * @example
   * ```ts
   * const agy = spawnAgy({
   *   command: 'agy',
   *   args: [...DEFAULT_AGY_ARGS],
   *   cwd: '/repo',
   *   onStderr: (text) => log.debug('agy stderr', { text }),
   * });
   * ```
   */
  readonly onStderr?: (text: string) => void;
};

/**
 * How the `agy acp` process ended, as Node reports it.
 */
export type AgyExit = {
  /**
   * The exit code, or `null` when a signal ended the process.
   */
  readonly code: number | null;
  /**
   * The signal that ended the process, or `null` when it exited on its own.
   */
  readonly signal: NodeJS.Signals | null;
};

/**
 * A running `agy acp` subprocess and the ACP stream over its stdio.
 */
export type AgyProcess = {
  /**
   * The ACP stream over the process's stdin and stdout, ready for `connectAgyClient`.
   */
  readonly stream: Stream;
  /**
   * The process ID, or `undefined` when the process could not start.
   */
  readonly pid: number | undefined;
  /**
   * Settles once the process has exited, or rejects when it could not start (for example `ENOENT` when `command` is
   * missing).
   */
  readonly exited: Promise<AgyExit>;
  /**
   * Ends the process with SIGTERM. Does nothing once it has exited, so it is safe to call more than once.
   *
   * @example
   * ```ts
   * const agy = spawnAgy({ command: 'agy', args: [...DEFAULT_AGY_ARGS], cwd: '/repo' });
   *
   * try {
   *   const acp = await connectAgyClient(agy.stream, handlers);
   * } finally {
   *   agy.kill();
   * }
   *
   * const { signal } = await agy.exited; // 'SIGTERM'
   * ```
   */
  readonly kill: () => void;
};
