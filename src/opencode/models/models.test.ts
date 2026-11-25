import { describe, expect, it } from 'vite-plus/test';

import { parseCatalog, readCatalog, toModelInfo } from './models.ts';

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
