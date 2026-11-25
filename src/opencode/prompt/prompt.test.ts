// cspell: words AQID JVBE

import { describe, expect, it } from 'vite-plus/test';

import { backgroundCommand, toAcpPrompt } from './prompt.ts';

import type { PromptMessage } from '../ai-sdk/ai-sdk.types.ts';
import type { StagedFile, StageFile } from './prompt.types.ts';

const refuseStaging: StageFile = () => Promise.reject(new Error('nothing should be staged'));

describe('toAcpPrompt', () => {
  it('sends only the user input after the last assistant message', async () => {
    const prompt: PromptMessage[] = [
      { role: 'system', content: 'OpenCode instructions' },
      { role: 'user', content: [{ type: 'text', text: 'first question' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'first answer' }] },
      { role: 'user', content: [{ type: 'text', text: 'second question' }] },
    ];

    await expect(toAcpPrompt(prompt, refuseStaging)).resolves.toEqual([{ type: 'text', text: 'second question' }]);
  });

  it('sends the whole first turn, without the system prompt', async () => {
    const prompt: PromptMessage[] = [
      { role: 'system', content: 'OpenCode instructions' },
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    ];

    await expect(toAcpPrompt(prompt, refuseStaging)).resolves.toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('turns images into image blocks and text files into embedded resources', async () => {
    const prompt: PromptMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'file', mediaType: 'image/png', data: new Uint8Array([1, 2, 3]) },
          { type: 'file', mediaType: 'text/plain', filename: 'notes.txt', data: Buffer.from('hi').toString('base64') },
          { type: 'file', mediaType: 'application/pdf', data: new URL('https://example.com/a.pdf') },
        ],
      },
    ];

    await expect(toAcpPrompt(prompt, refuseStaging)).resolves.toEqual([
      { type: 'text', text: 'look' },
      { type: 'image', mimeType: 'image/png', data: 'AQID' },
      { type: 'resource', resource: { uri: 'file:///notes.txt', mimeType: 'text/plain', text: 'hi' } },
      {
        type: 'resource_link',
        uri: 'https://example.com/a.pdf',
        name: 'https://example.com/a.pdf',
        mimeType: 'application/pdf',
      },
    ]);
  });

  it('writes other files with stageFile and links them, since agy ignores them embedded', async () => {
    const staged: StagedFile[] = [];

    const stageFile: StageFile = (file) => {
      staged.push(file);

      return Promise.resolve('/tmp/opencode-antigravity-x/1-report.pdf');
    };

    const prompt: PromptMessage[] = [
      {
        role: 'user',
        content: [{ type: 'file', mediaType: 'application/pdf', filename: 'report.pdf', data: 'JVBERg==' }],
      },
    ];

    await expect(toAcpPrompt(prompt, stageFile)).resolves.toEqual([
      {
        type: 'resource_link',
        uri: 'file:///tmp/opencode-antigravity-x/1-report.pdf',
        name: 'report.pdf',
        mimeType: 'application/pdf',
      },
    ]);
    expect(staged).toEqual([{ data: Buffer.from('%PDF'), mediaType: 'application/pdf', filename: 'report.pdf' }]);
  });

  it('leaves out the checkpoint OpenCode replays after a compaction, whole or split', async () => {
    const checkpoint =
      '<conversation-checkpoint>\nThe following is a summary.\n<summary>\nDone.\n</summary>\n</conversation-checkpoint>';

    const whole: PromptMessage[] = [
      { role: 'user', content: [{ type: 'text', text: checkpoint }] },
      { role: 'user', content: [{ type: 'text', text: 'next question' }] },
    ];

    const split: PromptMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: '<conversation-checkpoint>\nThe following is a summary.' },
          { type: 'text', text: 'user: earlier question' },
          { type: 'text', text: '</conversation-checkpoint>' },
          { type: 'text', text: 'next question' },
        ],
      },
    ];

    await expect(toAcpPrompt(whole, refuseStaging)).resolves.toEqual([{ type: 'text', text: 'next question' }]);
    await expect(toAcpPrompt(split, refuseStaging)).resolves.toEqual([{ type: 'text', text: 'next question' }]);
  });

  it('returns nothing when the prompt ends with the assistant', async () => {
    const prompt: PromptMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'question' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'answer' }] },
    ];

    await expect(toAcpPrompt(prompt, refuseStaging)).resolves.toEqual([]);
  });
});

describe('backgroundCommand', () => {
  it('finds a command that runs outside the turn', () => {
    expect(backgroundCommand([{ type: 'text', text: '/schedule every 5m say hi' }])).toBe('schedule');
    expect(backgroundCommand([{ type: 'text', text: '  /teamwork build it' }])).toBe('teamwork');
    expect(backgroundCommand([{ type: 'text', text: '/goal' }])).toBe('goal');
  });

  it('lets skills, other commands, paths and commands after other text through', () => {
    expect(backgroundCommand([{ type: 'text', text: '/papita do it' }])).toBeUndefined();
    expect(backgroundCommand([{ type: 'text', text: '/compact' }])).toBeUndefined();
    expect(backgroundCommand([{ type: 'text', text: '/home/me/notes.md explain this' }])).toBeUndefined();
    expect(backgroundCommand([{ type: 'text', text: '/schedules are fun' }])).toBeUndefined();
    expect(backgroundCommand([{ type: 'text', text: 'please /schedule later' }])).toBeUndefined();
    expect(backgroundCommand([{ type: 'image', data: 'AQID', mimeType: 'image/png' }])).toBeUndefined();
  });
});
