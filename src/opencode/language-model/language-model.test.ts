import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import { DEFAULT_AGY_ARGS } from '../../agy/process/process.ts';
import { createAgyRuntime } from '../../agy/runtime/runtime.ts';

import { createLanguageModel } from './language-model.ts';
import { SESSION_HEADER, VARIANT_HEADER } from './language-model.types.ts';

import type { AgyRuntime } from '../../agy/runtime/runtime.types.ts';
import type { CallOptions, StreamPart } from '../ai-sdk/ai-sdk.types.ts';
import type { RequestPermissionRequest } from '@agentclientprotocol/sdk';

const FAKE_AGY = fileURLToPath(new URL('../../../tests/fixtures/fake-agy.ts', import.meta.url));

const DIRECTORY = realpathSync(tmpdir());

let runtime: AgyRuntime | undefined;

afterEach(async () => {
  await runtime?.dispose();
  runtime = undefined;
});

function startRuntime(decide: (request: RequestPermissionRequest, sessionID: string) => boolean = () => false) {
  runtime = createAgyRuntime({
    process: { command: process.execPath, args: [FAKE_AGY, ...DEFAULT_AGY_ARGS], cwd: DIRECTORY },
    requestPermission: (request, sessionID) => {
      const optionId = decide(request, sessionID) ? 'yes' : 'no';

      return Promise.resolve({ outcome: { outcome: 'selected', optionId } });
    },
    log: () => {},
  });

  return runtime;
}

function call(text: string, headers: Record<string, string>): CallOptions {
  return { prompt: [{ role: 'user', content: [{ type: 'text', text }] }], headers };
}

async function collect(stream: ReadableStream<StreamPart>): Promise<StreamPart[]> {
  const parts: StreamPart[] = [];

  for await (const part of stream) {
    parts.push(part);
  }

  return parts;
}

function text(parts: readonly StreamPart[]): string {
  return parts.map((part) => (part.type === 'text-delta' ? part.delta : '')).join('');
}

describe('createAgyRuntime', () => {
  it('offers only the Gemini models and the thinking levels', async () => {
    await expect(startRuntime().catalog()).resolves.toEqual({
      models: [
        { id: 'gemini-4-neon', name: 'Gemini 4 Neon' },
        { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
      ],
      thoughtLevels: ['low', 'high'],
    });
  });

  it('keeps one ACP session per OpenCode session', async () => {
    const agy = startRuntime();

    const [first, again, other] = await Promise.all([
      agy.session('ses_a', DIRECTORY),
      agy.session('ses_a', DIRECTORY),
      agy.session('ses_b', DIRECTORY),
    ]);

    expect(again.id).toBe(first.id);
    expect(other.id).not.toBe(first.id);
  });
});

describe('createLanguageModel', () => {
  it('streams a turn: reasoning, agy’s tool, text and the finish, with the model and variant selected', async () => {
    const model = createLanguageModel('gemini-3.8-flash', { runtime: startRuntime(), directory: DIRECTORY });

    const { stream } = await model.doStream(call('hello', { [SESSION_HEADER]: 'ses_a', [VARIANT_HEADER]: 'low' }));

    const parts = await collect(stream);

    expect(parts.map((part) => part.type)).toEqual([
      'stream-start',
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'tool-call',
      'tool-result',
      'text-start',
      'text-delta',
      'text-delta',
      'text-end',
      'finish',
    ]);

    expect(text(parts)).toBe('echo: hello ({"model":"gemini-3.8-flash","thought_level":"low"})');

    expect(parts).toContainEqual(expect.objectContaining({ type: 'tool-call', toolName: 'execute', providerExecuted: true }));
    expect(parts.at(-1)).toMatchObject({ type: 'finish', usage: { inputTokens: { total: 1234 } } });
  });

  it('asks OpenCode on behalf of the session whose turn needs permission', async () => {
    const asked: string[] = [];

    const agy = startRuntime((request, sessionID) => {
      asked.push(`${sessionID}: ${request.toolCall.title ?? ''}`);

      return true;
    });

    const model = createLanguageModel('gemini-4-neon', { runtime: agy, directory: DIRECTORY });

    const { stream } = await model.doStream(call('needs permission', { [SESSION_HEADER]: 'ses_perm' }));

    expect(text(await collect(stream))).toContain('permission: yes.');
    expect(asked).toEqual(['ses_perm: Run rm -rf build']);
  });

  it('refuses a call without the OpenCode session, or without new user input', async () => {
    const model = createLanguageModel('gemini-4-neon', { runtime: startRuntime(), directory: DIRECTORY });

    await expect(model.doStream(call('hello', {}))).rejects.toThrow(SESSION_HEADER);

    await expect(
      model.doStream({
        prompt: [{ role: 'assistant', content: [{ type: 'text', text: 'done' }] }],
        headers: { [SESSION_HEADER]: 's' },
      }),
    ).rejects.toThrow('new user input');
  });

  it('does not offer doGenerate', async () => {
    const model = createLanguageModel('gemini-4-neon', { runtime: startRuntime(), directory: DIRECTORY });

    await expect(model.doGenerate(call('hello', { [SESSION_HEADER]: 's' }))).rejects.toThrow('doStream');
  });
});
