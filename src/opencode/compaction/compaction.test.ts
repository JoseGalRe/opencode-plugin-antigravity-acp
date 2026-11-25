import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import { DEFAULT_AGY_ARGS } from '../../agy/process/process.ts';
import { createAgyRuntime } from '../../agy/runtime/runtime.ts';

import { compactAgySession, createCompactionReasons } from './compaction.ts';

import type { AgyRuntime, RequestPermission } from '../../agy/runtime/runtime.types.ts';

const FAKE_AGY = fileURLToPath(new URL('../../../tests/fixtures/fake-agy.ts', import.meta.url));

const DIRECTORY = realpathSync(tmpdir());

const refuse: RequestPermission = () => Promise.resolve({ outcome: { outcome: 'cancelled' } });

let runtime: AgyRuntime | undefined;

afterEach(async () => {
  await runtime?.dispose();
  runtime = undefined;
});

function startRuntime(): AgyRuntime {
  runtime = createAgyRuntime({
    process: { command: process.execPath, args: [FAKE_AGY, ...DEFAULT_AGY_ARGS], cwd: DIRECTORY },
    log: () => {},
  });

  return runtime;
}

describe('compactAgySession', () => {
  it('runs agy’s /compact on the session and reports its text and the context left', async () => {
    const agy = startRuntime();
    const session = await agy.session('ses_long', DIRECTORY, refuse);

    await expect(compactAgySession(session)).resolves.toEqual({ text: 'Conversation compacted.', contextTokens: 321 });
  });
});

describe('runtime.existing', () => {
  it('finds only sessions already opened, and never opens one', async () => {
    const agy = startRuntime();

    expect(agy.existing('ses_new')).toBeUndefined();

    const opened = await agy.session('ses_open', DIRECTORY, refuse);

    await expect(agy.existing('ses_open')).resolves.toBe(opened);
    expect(agy.existing('ses_new')).toBeUndefined();
  });
});

describe('createCompactionReasons', () => {
  it('hands the reason to a hook waiting for it, the way OpenCode orders them', async () => {
    const reasons = createCompactionReasons();
    const reason = reasons.reasonFor('ses_a', 1_000);

    reasons.started('ses_a', 'manual');

    await expect(reason).resolves.toBe('manual');
  });

  it('keeps a reason that came first for its hook, once', async () => {
    const reasons = createCompactionReasons();

    reasons.started('ses_a', 'auto');

    await expect(reasons.reasonFor('ses_a', 1_000)).resolves.toBe('auto');
    await expect(reasons.reasonFor('ses_a', 10)).resolves.toBeUndefined();
  });

  it('gives no reason when none arrives in time, or when the compaction ended without one', async () => {
    const reasons = createCompactionReasons();

    await expect(reasons.reasonFor('ses_a', 10)).resolves.toBeUndefined();

    const ending = reasons.reasonFor('ses_b', 1_000);

    reasons.finished('ses_b');
    await expect(ending).resolves.toBeUndefined();

    reasons.started('ses_c', 'manual');
    reasons.finished('ses_c');
    await expect(reasons.reasonFor('ses_c', 10)).resolves.toBeUndefined();
  });

  it('pairs each session with its own reason', async () => {
    const reasons = createCompactionReasons();
    const first = reasons.reasonFor('ses_a', 1_000);
    const second = reasons.reasonFor('ses_b', 1_000);

    reasons.started('ses_b', 'auto');
    reasons.started('ses_a', 'manual');

    await expect(Promise.all([first, second])).resolves.toEqual(['manual', 'auto']);
  });
});
