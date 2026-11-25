import { describe, expect, it } from 'vite-plus/test';

import { keepContextWindows, parseCatalog, readCatalog, toModelInfo, withContextWindow } from './models.ts';

import type { SessionConfigOption } from '@agentclientprotocol/sdk';

const CONFIG_OPTIONS: SessionConfigOption[] = [
  {
    id: 'model',
    name: 'Model',
    type: 'select',
    currentValue: 'gemini-4-neon',
    options: [
      { value: 'gemini-4-neon', name: 'Gemini 4 Neon' },
      { value: 'gemini-pro-orchestrator', name: 'Orchestrator (Carbon)' },
      { value: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
      { value: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)' },
    ],
  },
  {
    id: 'thought_level',
    name: 'Thinking Level',
    type: 'select',
    currentValue: 'high',
    options: [
      { value: 'low', name: 'Low' },
      { value: 'xhigh', name: 'Extra' },
    ],
  },
];

describe('readCatalog', () => {
  it('keeps only Gemini models, Orchestrator included', () => {
    expect(readCatalog(CONFIG_OPTIONS)).toEqual({
      models: [
        { id: 'gemini-4-neon', name: 'Gemini 4 Neon' },
        { id: 'gemini-pro-orchestrator', name: 'Orchestrator (Carbon)' },
      ],
      thoughtLevels: ['low', 'xhigh'],
    });
  });

  it('reads grouped options too', () => {
    const grouped: SessionConfigOption[] = [
      {
        id: 'model',
        name: 'Model',
        type: 'select',
        currentValue: 'gemini-4-neon',
        options: [{ group: 'gemini', name: 'Gemini', options: [{ value: 'gemini-4-neon', name: 'Gemini 4 Neon' }] }],
      },
    ];

    expect(readCatalog(grouped).models).toEqual([{ id: 'gemini-4-neon', name: 'Gemini 4 Neon' }]);
  });

  it('is empty when agy sends no options', () => {
    expect(readCatalog(undefined)).toEqual({ models: [], thoughtLevels: [] });
  });
});

describe('parseCatalog', () => {
  it('reads a saved catalog, dropping non-Gemini and malformed models', () => {
    expect(
      parseCatalog({
        models: [{ id: 'gemini-4-neon', name: 'Gemini 4 Neon' }, { id: 'claude-opus-5-5', name: 'Claude' }, { id: 7 }],
        thoughtLevels: ['low', 3, 'high'],
      }),
    ).toEqual({ models: [{ id: 'gemini-4-neon', name: 'Gemini 4 Neon' }], thoughtLevels: ['low', 'high'] });
  });

  it('ignores what is missing or has no usable model', () => {
    expect(parseCatalog(undefined)).toBeUndefined();
    expect(parseCatalog({ models: 'gemini', thoughtLevels: [] })).toBeUndefined();
    expect(parseCatalog({ models: [], thoughtLevels: [] })).toBeUndefined();
  });
});

describe('toModelInfo', () => {
  it('describes the model under the antigravity provider, one variant per thinking level', () => {
    expect(toModelInfo({ id: 'gemini-4-neon', name: 'Gemini 4 Neon' }, ['low', 'xhigh'])).toMatchObject({
      id: 'gemini-4-neon',
      providerID: 'antigravity',
      name: 'Gemini 4 Neon',
      variants: [{ id: 'low' }, { id: 'xhigh' }],
      enabled: true,
    });
  });
});

describe('context windows', () => {
  const catalog = {
    models: [
      { id: 'gemini-4-neon', name: 'Gemini 4 Neon', contextWindow: 2_097_152 },
      { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
    ],
    thoughtLevels: ['low'],
  };

  it('uses the window agy reported instead of the default', () => {
    expect(toModelInfo({ id: 'gemini-4-neon', name: 'Gemini 4 Neon' }, []).limit.context).toBe(1_048_576);
    expect(toModelInfo({ id: 'gemini-4-neon', name: 'Gemini 4 Neon', contextWindow: 2_097_152 }, []).limit.context).toBe(
      2_097_152,
    );
  });

  it('records a reported window, and nothing for unknown models, invalid or unchanged windows', () => {
    expect(withContextWindow(catalog, 'gemini-3.8-flash', 1_048_576)?.models[1]).toEqual({
      id: 'gemini-3.8-flash',
      name: 'Gemini 3.8 Flash',
      contextWindow: 1_048_576,
    });
    expect(withContextWindow(catalog, 'gemini-9', 1_048_576)).toBeUndefined();
    expect(withContextWindow(catalog, 'gemini-3.8-flash', 0)).toBeUndefined();
    expect(withContextWindow(catalog, 'gemini-4-neon', 2_097_152)).toBeUndefined();
  });

  it('keeps learned windows when agy sends the catalog again, and keeps them through storage', () => {
    const fresh = {
      models: [
        { id: 'gemini-4-neon', name: 'Gemini 4 Neon' },
        { id: 'gemini-4-pro', name: 'Gemini 4 Pro' },
      ],
      thoughtLevels: ['low', 'high'],
    };

    expect(keepContextWindows(fresh, catalog)).toEqual({
      models: [
        { id: 'gemini-4-neon', name: 'Gemini 4 Neon', contextWindow: 2_097_152 },
        { id: 'gemini-4-pro', name: 'Gemini 4 Pro' },
      ],
      thoughtLevels: ['low', 'high'],
    });
    expect(parseCatalog(JSON.parse(JSON.stringify(catalog)))).toEqual(catalog);
    expect(parseCatalog({ models: [{ id: 'gemini-4-neon', name: 'N', contextWindow: -1 }], thoughtLevels: [] })).toEqual({
      models: [{ id: 'gemini-4-neon', name: 'N' }],
      thoughtLevels: [],
    });
  });
});
