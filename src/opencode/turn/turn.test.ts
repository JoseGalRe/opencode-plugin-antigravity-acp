import { describe, expect, it } from 'vite-plus/test';

import { createTurnTranslator } from './turn.ts';

describe('createTurnTranslator', () => {
  it('streams thoughts and text as separate blocks, closing each before the next opens', () => {
    const translator = createTurnTranslator();

    const parts = [
      ...translator.update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Hmm' } }),
      ...translator.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hel' } }),
      ...translator.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'lo' } }),
      ...translator.finish({ stopReason: 'end_turn' }),
    ];

    expect(parts.map((part) => part.type)).toEqual([
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'text-start',
      'text-delta',
      'text-delta',
      'text-end',
      'finish',
    ]);

    expect(parts).toContainEqual({ type: 'text-delta', id: 'text-2', delta: 'lo' });
  });

  it('reports agy’s tools as provider-executed calls with their results', () => {
    const translator = createTurnTranslator();

    const parts = [
      ...translator.update({
        sessionUpdate: 'tool_call',
        toolCallId: 'c1',
        title: 'List files',
        kind: 'execute',
        rawInput: { command: 'ls' },
      }),
      ...translator.update({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'c1',
        status: 'completed',
        content: [
          { type: 'content', content: { type: 'text', text: 'a.txt' } },
          { type: 'diff', path: '/repo/b.txt', newText: 'b' },
        ],
      }),
    ];

    expect(parts).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'c1',
        toolName: 'execute',
        input: JSON.stringify({ title: 'List files', command: 'ls' }),
        providerExecuted: true,
        dynamic: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'c1',
        toolName: 'execute',
        result: { output: 'a.txt\n\nCreated /repo/b.txt' },
        isError: false,
        dynamic: true,
      },
    ]);
  });

  it('marks failed tools as errors and settles unfinished ones when the turn ends', () => {
    const translator = createTurnTranslator();

    translator.update({ sessionUpdate: 'tool_call', toolCallId: 'failed', title: 'Read', kind: 'read' });
    translator.update({ sessionUpdate: 'tool_call', toolCallId: 'running', title: 'Build', kind: 'execute' });

    const failed = translator.update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'failed',
      status: 'failed',
      rawOutput: 'no such file',
    });

    const closing = translator.finish({ stopReason: 'cancelled' });

    expect(failed).toContainEqual(expect.objectContaining({ type: 'tool-result', toolCallId: 'failed', isError: true }));

    expect(closing[0]).toMatchObject({ type: 'tool-result', toolCallId: 'running', isError: true });
    expect(closing.at(-1)).toMatchObject({ type: 'finish', finishReason: { unified: 'other', raw: 'cancelled' } });
  });

  it('reports the context usage agy last sent', () => {
    const translator = createTurnTranslator();

    translator.update({ sessionUpdate: 'usage_update', used: 4200, size: 1_000_000 });

    expect(translator.finish({ stopReason: 'max_tokens' }).at(-1)).toMatchObject({
      finishReason: { unified: 'length' },
      usage: { inputTokens: { total: 4200 } },
    });
  });
});
