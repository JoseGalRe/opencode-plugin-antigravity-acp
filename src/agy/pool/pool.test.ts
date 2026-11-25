import { describe, expect, it, vi } from 'vite-plus/test';

import { acquireAgyRuntime } from './pool.ts';

import type { AgyRuntimeOptions } from '../runtime/runtime.types.ts';

function options(command: string): AgyRuntimeOptions {
  return { process: { command, args: ['acp'], cwd: '/' }, log: () => {} };
}

describe('acquireAgyRuntime', () => {
  it('shares one runtime among plugin instances that start agy the same way', async () => {
    const first = acquireAgyRuntime(options('agy-shared'));
    const second = acquireAgyRuntime(options('agy-shared'));
    const other = acquireAgyRuntime(options('agy-other'));

    expect(second.runtime).toBe(first.runtime);
    expect(other.runtime).not.toBe(first.runtime);

    await Promise.all([first.release(), second.release(), other.release()]);
  });

  it('shares the runtime with another import of the module, as OpenCode imports the plugin once per location', async () => {
    vi.resetModules();

    const copy = await import('./pool.ts');

    expect(copy.acquireAgyRuntime).not.toBe(acquireAgyRuntime);

    const first = acquireAgyRuntime(options('agy-imports'));
    const second = copy.acquireAgyRuntime(options('agy-imports'));

    expect(second.runtime).toBe(first.runtime);

    await Promise.all([first.release(), second.release()]);
  });

  it('keeps the runtime while a lease remains, and starts afresh after the last release', async () => {
    const first = acquireAgyRuntime(options('agy-leases'));
    const second = acquireAgyRuntime(options('agy-leases'));

    await first.release();
    await first.release();

    const third = acquireAgyRuntime(options('agy-leases'));

    expect(third.runtime).toBe(second.runtime);

    await second.release();
    await third.release();

    const fresh = acquireAgyRuntime(options('agy-leases'));

    expect(fresh.runtime).not.toBe(second.runtime);

    await fresh.release();
  });
});
