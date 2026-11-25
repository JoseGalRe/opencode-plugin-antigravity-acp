import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vite-plus/test';

import { DEFAULT_AGY_ARGS } from '../../agy/process/process.ts';
import { createAgyRuntime } from '../../agy/runtime/runtime.ts';

import { createLanguageModel } from './language-model.ts';
import { SESSION_HEADER, VARIANT_HEADER } from './language-model.types.ts';

import type { AgyRuntime, RequestPermission } from '../../agy/runtime/runtime.types.ts';
import type { CallOptions, StreamPart } from '../ai-sdk/ai-sdk.types.ts';
import type { AgyCatalog } from '../models/models.types.ts';
import type { LanguageModelContext } from './language-model.types.ts';
import type { RequestPermissionRequest } from '@agentclientprotocol/sdk';

const FAKE_AGY = fileURLToPath(new URL('../../../tests/fixtures/fake-agy.ts', import.meta.url));

const DIRECTORY = realpathSync(tmpdir());

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

function permissions(decide: (request: RequestPermissionRequest, sessionID: string) => boolean): RequestPermission {
  return (request, sessionID) => {
    const optionId = decide(request, sessionID) ? 'yes' : 'no';

    return Promise.resolve({ outcome: { outcome: 'selected', optionId } });
  };
}

function modelContext(agy: AgyRuntime, overrides: Partial<LanguageModelContext> = {}): LanguageModelContext {
  return {
    runtime: agy,
    directory: DIRECTORY,
    requestPermission: permissions(() => false),
    stageFile: () => Promise.reject(new Error('nothing should be staged')),
    onContextWindow: () => {},
    ...overrides,
  };
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
      agy.session(
        'ses_a',
        DIRECTORY,
        permissions(() => false),
      ),
      agy.session(
        'ses_a',
        DIRECTORY,
        permissions(() => false),
      ),
      agy.session(
        'ses_b',
        DIRECTORY,
        permissions(() => false),
      ),
    ]);

    expect(again.id).toBe(first.id);
    expect(other.id).not.toBe(first.id);
  });

  it('announces the catalog each new session carries to its watchers', async () => {
    const agy = startRuntime();
    const heard: AgyCatalog[] = [];

    const stop = agy.watchCatalog((catalog) => heard.push(catalog));

    await agy.session(
      'ses_watch',
      DIRECTORY,
      permissions(() => false),
    );
    stop();
    await agy.session(
      'ses_after',
      DIRECTORY,
      permissions(() => false),
    );

    expect(heard).toHaveLength(1);
    expect(heard[0]?.models.map(({ id }) => id)).toEqual(['gemini-4-neon', 'gemini-3.8-flash']);
  });
});

describe('createLanguageModel', () => {
  it('streams a turn: reasoning, agy’s tool, text and the finish, with the model and variant selected', async () => {
    const windows: string[] = [];
    const model = createLanguageModel(
      'gemini-3.8-flash',
      modelContext(startRuntime(), { onContextWindow: (id, size) => windows.push(`${id}: ${size}`) }),
    );

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
    expect(parts.at(-1)).toMatchObject({
      type: 'finish',
      usage: { inputTokens: { total: 1200, noCache: 1000, cacheRead: 200 }, outputTokens: { total: 34, reasoning: 30 } },
    });
    expect(windows).toEqual(['gemini-3.8-flash: 1048576']);
  });

  it('asks the location that opened the session, when locations share one runtime', async () => {
    const asked: string[] = [];
    const agy = startRuntime();

    const record = (location: string, answer: boolean) =>
      permissions((request, sessionID) => {
        asked.push(`${location} ${sessionID}: ${request.toolCall.title ?? ''}`);

        return answer;
      });

    const allowing = createLanguageModel('gemini-4-neon', modelContext(agy, { requestPermission: record('a', true) }));
    const refusing = createLanguageModel('gemini-4-neon', modelContext(agy, { requestPermission: record('b', false) }));

    const first = await allowing.doStream(call('needs permission', { [SESSION_HEADER]: 'ses_a' }));
    const firstText = text(await collect(first.stream));
    const second = await refusing.doStream(call('needs permission', { [SESSION_HEADER]: 'ses_b' }));
    const secondText = text(await collect(second.stream));

    expect(firstText).toContain('permission: yes.');
    expect(secondText).toContain('permission: no.');
    expect(asked).toEqual(['a ses_a: Run rm -rf build', 'b ses_b: Run rm -rf build']);
  });

  it('refuses a call without the OpenCode session, or without new user input', async () => {
    const model = createLanguageModel('gemini-4-neon', modelContext(startRuntime()));

    await expect(model.doStream(call('hello', {}))).rejects.toThrow(SESSION_HEADER);

    await expect(
      model.doStream({
        prompt: [{ role: 'assistant', content: [{ type: 'text', text: 'done' }] }],
        headers: { [SESSION_HEADER]: 's' },
      }),
    ).rejects.toThrow('new user input');
  });

  it('refuses a prompt that starts with a background command of agy, and lets skills through', async () => {
    const model = createLanguageModel('gemini-4-neon', modelContext(startRuntime()));

    await expect(model.doStream(call('/schedule every 5m say hi', { [SESSION_HEADER]: 'ses_a' }))).rejects.toThrow(
      '/schedule runs outside your turn',
    );

    const { stream } = await model.doStream(call('/papita do it', { [SESSION_HEADER]: 'ses_a' }));

    expect(text(await collect(stream))).toContain('echo: /papita do it');
  });

  it('does not offer doGenerate', async () => {
    const model = createLanguageModel('gemini-4-neon', modelContext(startRuntime()));

    await expect(model.doGenerate(call('hello', { [SESSION_HEADER]: 's' }))).rejects.toThrow('doStream');
  });
});
