/**
 * The plugin's options, read from its entry in `opencode.json(c)`:
 * `{ "package": "opencode-plugin-antigravity-acp", "options": { "command": "agy", "args": ["--sandbox"] } }`.
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
};
