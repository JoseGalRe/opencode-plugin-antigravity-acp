// A stand-in for `agy acp`: an ACP server on stdio shaped like agy 1.5.16. `session/new` offers Gemini, Claude
// and GPT-OSS models and the thinking levels; each turn thinks, runs one tool and answers with the prompt's text.
// A prompt containing "permission" asks for permission first and reports the outcome. It reports the arguments it
// was started with in `initialize`, and the options set on a session in its answer.
import { Readable, Writable } from 'node:stream';

import { agent, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';

import type { SessionUpdate } from '@agentclientprotocol/sdk';

const input = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;
const output = Writable.toWeb(process.stdout) as WritableStream<Uint8Array>;
const options = new Map<string, Map<string, string>>();

let sessions = 0;

process.stderr.write(`fake-agy started with: ${process.argv.slice(2).join(' ')}\n`);

agent()
  .onRequest('initialize', () => ({
    protocolVersion: PROTOCOL_VERSION,
    agentInfo: { name: 'Fake ACP Server', version: '0.0.0' },
    _meta: { args: process.argv.slice(2), cwd: process.cwd() },
  }))
  .onRequest('session/new', ({ params }) => {
    sessions += 1;

    const sessionId = `fake-session-${sessions}`;

    options.set(
      sessionId,
      new Map([
        ['model', 'gemini-4-neon'],
        ['thought_level', 'high'],
      ]),
    );

    return {
      sessionId,
      _meta: { cwd: params.cwd },
      configOptions: [
        {
          id: 'model',
          name: 'Model',
          type: 'select',
          currentValue: 'gemini-4-neon',
          options: [
            { value: 'gemini-4-neon', name: 'Gemini 4 Neon' },
            { value: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
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
            { value: 'high', name: 'High' },
          ],
        },
      ],
    };
  })
  .onRequest('session/close', ({ params }) => {
    options.delete(params.sessionId);
  })
  .onRequest('session/set_config_option', ({ params }) => {
    if ('value' in params && typeof params.value === 'string') {
      options.get(params.sessionId)?.set(params.configId, params.value);
    }

    return { configOptions: [] };
  })
  .onRequest('session/prompt', async ({ params, client }) => {
    const { sessionId } = params;
    const text = params.prompt.map((block) => (block.type === 'text' ? block.text : `[${block.type}]`)).join(' ');
    const selected = Object.fromEntries(options.get(sessionId) ?? []);

    const update = (value: SessionUpdate) => client.notify('session/update', { sessionId, update: value });

    await update({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'Thinking.' } });

    if (text.includes('permission')) {
      const answer = await client.request('session/request_permission', {
        sessionId,
        toolCall: { toolCallId: 'perm-1', title: 'Run rm -rf build', kind: 'execute', rawInput: { command: 'rm -rf build' } },
        options: [
          { optionId: 'yes', name: 'Allow', kind: 'allow_once' },
          { optionId: 'no', name: 'Deny', kind: 'reject_once' },
        ],
      });

      await update({
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text: `permission: ${answer.outcome.outcome === 'selected' ? answer.outcome.optionId : 'cancelled'}. `,
        },
      });
    }

    await update({
      sessionUpdate: 'tool_call',
      toolCallId: 'call-1',
      title: 'List files',
      kind: 'execute',
      status: 'in_progress',
      rawInput: { command: 'ls' },
    });
    await update({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call-1',
      status: 'completed',
      content: [{ type: 'content', content: { type: 'text', text: 'a.txt' } }],
    });
    await update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `echo: ${text}` } });
    await update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: ` (${JSON.stringify(selected)})` } });
    await update({ sessionUpdate: 'usage_update', used: 1234, size: 1_048_576 });

    // Like agy 1.5.16: per-turn counts, input without the cache reads, output with the thoughts.
    const usage = {
      inputTokens: 1000,
      outputTokens: 34,
      cachedReadTokens: 200,
      cachedWriteTokens: 0,
      thoughtTokens: 30,
      totalTokens: 1234,
    };

    return { stopReason: 'end_turn', usage };
  })
  .connect(ndJsonStream(output, input));
