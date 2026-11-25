import type { AntigravityOptions } from './options.types.ts';

/**
 * Flags the plugin never passes on: they would point `agy` at another backend.
 */
const REFUSED_FLAGS = ['--cloud_code_endpoint', '--cloud-code-endpoint'] as const;

/**
 * Reads and checks the plugin's options.
 *
 * @param options The `options` of the plugin's entry in `opencode.json(c)`, as OpenCode passes them.
 *
 * @returns The options with their defaults.
 */
export function readOptions(options: Readonly<Record<string, unknown>>): AntigravityOptions {
  const { command = 'agy', args = [] } = options;

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

  return { command, args };
}
