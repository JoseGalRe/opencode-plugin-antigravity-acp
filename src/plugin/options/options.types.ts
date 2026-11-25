/**
 * The plugin's options, read from its entry in `opencode.json(c)`:
 * `{ "package": "@josegalre/opencode-plugin-antigravity-acp", "options": { "command": "agy", "args": ["--sandbox"], "autoCompact": "80%" } }`.
 */
export type AntigravityOptions = {
  /**
   * The Antigravity CLI executable: `agy` on PATH by default, or an absolute path.
   */
  readonly command: string;
  /**
   * Extra `agy acp` flags, added after `DEFAULT_AGY_ARGS` (`acp --disable-telemetry`), such as `--sandbox`. Empty by
   * default. `--cloud_code_endpoint` is refused.
   */
  readonly args: readonly string[];
  /**
   * When `agy` compacts a conversation on its own: a token count (`700000`), a `K` or `M` shorthand (`800K`) or a
   * percentage of the model's window (`80%`), passed as `AGY_CLI_AUTO_COMPACT_OVERRIDE`. Missing by default, which
   * keeps `agy`'s own threshold.
   */
  readonly autoCompact?: string;
};
