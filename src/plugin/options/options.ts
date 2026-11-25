import type { AntigravityOptions } from './options.types.ts';

/**
 * Flags the plugin never passes on: they would point `agy` at another backend.
 */
const REFUSED_FLAGS = ['--cloud_code_endpoint', '--cloud-code-endpoint'] as const;

/**
 * The forms `AGY_CLI_AUTO_COMPACT_OVERRIDE` accepts, per agy 1.5.16's release notes: a token count, a `K` or `M`
 * shorthand, or a percentage. `agy` checks the value against the model's window itself.
 */
const AUTO_COMPACT_PATTERN = /^(?:\d+|\d+(?:\.\d+)?[KM]|\d+(?:\.\d+)?%)$/;

/**
 * Reads and checks the plugin's options.
 *
 * @param options The `options` of the plugin's entry in `opencode.json(c)`, as OpenCode passes them.
 *
 * @returns The options with their defaults.
 */
export function readOptions(options: Readonly<Record<string, unknown>>): AntigravityOptions {
  const { command = 'agy', args = [], autoCompact } = options;

  if (typeof command !== 'string' || command.length === 0) {
    throw new Error('The antigravity plugin option `command` must be a non-empty string');
  }

  if (!Array.isArray(args) || !args.every((arg) => typeof arg === 'string')) {
    throw new Error('The antigravity plugin option `args` must be an array of strings');
  }

  const refused = args.find((arg) => REFUSED_FLAGS.some((flag) => arg === flag || arg.startsWith(`${flag}=`)));

  if (refused) {
    throw new Error(`The antigravity plugin does not pass ${refused} to agy: it only talks to the default backend`);
  }

  if (autoCompact === undefined) {
    return { command, args };
  }

  return { command, args, autoCompact: readAutoCompact(autoCompact) };
}

function readAutoCompact(value: unknown): string {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return String(value);
  }

  if (typeof value === 'string' && AUTO_COMPACT_PATTERN.test(value)) {
    return value;
  }

  throw new Error(
    'The antigravity plugin option `autoCompact` must be a token count (700000), a K or M shorthand (800K, 0.5M) or a percentage (80%)',
  );
}
