// cspell: words AQID

import { describe, expect, it } from 'vite-plus/test';

import { toAcpPrompt } from './prompt.ts';

import type { PromptMessage } from '../ai-sdk/ai-sdk.types.ts';

describe('toAcpPrompt', () => {
  it('sends only the user input after the last assistant message', () => {
    const prompt: PromptMessage[] = [
      { role: 'system', content: 'OpenCode instructions' },
      { role: 'user', content: [{ type: 'text', text: 'first question' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'first answer' }] },
      { role: 'user', content: [{ type: 'text', text: 'second question' }] },
    ];

    expect(toAcpPrompt(prompt)).toEqual([{ type: 'text', text: 'second question' }]);
  });

  it('sends the whole first turn, without the system prompt', () => {
    const prompt: PromptMessage[] = [
      { role: 'system', content: 'OpenCode instructions' },
      { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    ];

    expect(toAcpPrompt(prompt)).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('turns images into image blocks and text files into embedded resources', () => {
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

    expect(toAcpPrompt(prompt)).toEqual([
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

  it('leaves out the checkpoint OpenCode replays after a compaction, whole or split', () => {
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

    expect(toAcpPrompt(whole)).toEqual([{ type: 'text', text: 'next question' }]);
    expect(toAcpPrompt(split)).toEqual([{ type: 'text', text: 'next question' }]);
  });

  it('returns nothing when the prompt ends with the assistant', () => {
    const prompt: PromptMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'question' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'answer' }] },
    ];

    expect(toAcpPrompt(prompt)).toEqual([]);
  });
});
