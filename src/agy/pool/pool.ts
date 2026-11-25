import { createAgyRuntime } from '../runtime/runtime.ts';

import type { AgyRuntimeOptions } from '../runtime/runtime.types.ts';
import type { AgyRuntimeLease, PoolEntry } from './pool.types.ts';

/**
 * Where the pool lives on `globalThis`. OpenCode imports the plugin module afresh for each location of the same server
 * process (verified with OpenCode 2.4.1), so a module-level map would hold one runtime per location. The `v1` names
 * the shape of the entries, so a later plugin version with a different runtime never picks up this one.
 */
const POOL_KEY = Symbol.for('opencode-plugin-antigravity-acp.pool.v1');

/**
 * The runtimes this server process shares, by how they start `agy`. OpenCode sets the plugin up once per location in
 * the same process; each ACP session names its own directory, so one `agy` serves them all. Ownership is explicit:
 * every `acquireAgyRuntime` takes a lease and the last release disposes the runtime.
 */
const POOL = sharedPool();

function sharedPool(): Map<string, PoolEntry> {
  const holder: typeof globalThis & { [POOL_KEY]?: Map<string, PoolEntry> } = globalThis;

  holder[POOL_KEY] ??= new Map();

  return holder[POOL_KEY];
}

/**
 * Takes a lease on the runtime that starts `agy` the way `options` says, creating it on first use. Plugin instances
 * with the same `command`, `args`, working directory and `extraEnv` share one runtime and so one `agy` process.
 *
 * @param options How to start `agy acp`; the first caller's `log` is kept for the shared runtime.
 *
 * @returns The lease: the runtime and the function that gives it back.
 */
export function acquireAgyRuntime(options: AgyRuntimeOptions): AgyRuntimeLease {
  const { command, args, cwd, extraEnv = {} } = options.process;

  const key = JSON.stringify([command, args, cwd, Object.entries(extraEnv).toSorted(([a], [b]) => a.localeCompare(b))]);

  let entry = POOL.get(key);

  if (!entry) {
    entry = { runtime: createAgyRuntime(options), leases: 0 };
    POOL.set(key, entry);
  }

  entry.leases += 1;

  const held = entry;

  let released = false;

  return {
    runtime: held.runtime,
    release: async () => {
      if (released) {
        return;
      }

      released = true;
      held.leases -= 1;

      if (held.leases === 0) {
        if (POOL.get(key) === held) {
          POOL.delete(key);
        }

        await held.runtime.dispose();
      }
    },
  };
}
