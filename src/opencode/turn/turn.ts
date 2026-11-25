import type { FinishReason, StreamPart } from '../ai-sdk/ai-sdk.types.ts';
import type { TurnTranslator } from './turn.types.ts';
import type { StopReason, ToolCall, ToolCallContent, ToolCallUpdate } from '@agentclientprotocol/sdk';

type BlockKind = 'text' | 'reasoning';

type OpenBlock = {
  readonly kind: BlockKind;
  readonly id: string;
};

type ToolState = {
  name: string;
  title: string;
  settled: boolean;
};

type ToolResult = Extract<StreamPart, { type: 'tool-result' }>['result'];

const FINISH_REASONS: Readonly<Record<StopReason, FinishReason['unified']>> = {
  end_turn: 'stop',
  max_tokens: 'length',
  max_turn_requests: 'length',
  refusal: 'content-filter',
  cancelled: 'other',
};

/**
 * Creates the translator for one turn.
 *
 * @returns A translator with no open block and no tool calls.
 */
export function createTurnTranslator(): TurnTranslator {
  const tools = new Map<string, ToolState>();

  let open: OpenBlock | undefined;
  let blocks = 0;
  let contextTokens: number | undefined;

  function close(): StreamPart[] {
    if (!open) {
      return [];
    }

    const { kind, id } = open;

    open = undefined;

    return [kind === 'text' ? { type: 'text-end', id } : { type: 'reasoning-end', id }];
  }

  function delta(kind: BlockKind, text: string): StreamPart[] {
    const parts: StreamPart[] = [];

    if (open?.kind !== kind) {
      parts.push(...close());
      blocks += 1;
      open = { kind, id: `${kind}-${blocks}` };
      parts.push(kind === 'text' ? { type: 'text-start', id: open.id } : { type: 'reasoning-start', id: open.id });
    }

    const { id } = open;

    parts.push(kind === 'text' ? { type: 'text-delta', id, delta: text } : { type: 'reasoning-delta', id, delta: text });

    return parts;
  }

  function toolCall(call: ToolCall | ToolCallUpdate): StreamPart[] {
    const name = call.name ?? call.kind ?? 'tool';
    const title = call.title ?? name;

    tools.set(call.toolCallId, { name, title, settled: false });

    return [
      ...close(),
      {
        type: 'tool-call',
        toolCallId: call.toolCallId,
        toolName: name,
        input: JSON.stringify(toolInput(title, call.rawInput)),
        providerExecuted: true,
        dynamic: true,
      },
    ];
  }

  function toolResult(toolCallId: string, result: ToolResult, isError: boolean): StreamPart[] {
    const tool = tools.get(toolCallId);

    if (!tool || tool.settled) {
      return [];
    }

    tool.settled = true;

    return [{ type: 'tool-result', toolCallId, toolName: tool.name, result, isError, dynamic: true }];
  }

  function settle(call: ToolCall | ToolCallUpdate): StreamPart[] {
    if (call.status !== 'completed' && call.status !== 'failed') {
      return [];
    }

    return toolResult(call.toolCallId, resultOf(call), call.status === 'failed');
  }

  return {
    update: (update) => {
      switch (update.sessionUpdate) {
        case 'agent_message_chunk': {
          return update.content.type === 'text' ? delta('text', update.content.text) : [];
        }

        case 'agent_thought_chunk': {
          return update.content.type === 'text' ? delta('reasoning', update.content.text) : [];
        }

        case 'tool_call': {
          return [...toolCall(update), ...settle(update)];
        }

        case 'tool_call_update': {
          const known = tools.get(update.toolCallId);

          if (known && update.title) {
            known.title = update.title;
          }

          return [...(known ? [] : toolCall(update)), ...settle(update)];
        }

        case 'usage_update': {
          contextTokens = update.used;

          return [];
        }

        default: {
          return [];
        }
      }
    },
    finish: (response) => {
      const parts = close();

      for (const toolCallId of tools.keys()) {
        parts.push(...toolResult(toolCallId, { output: `Not finished: the turn ended (${response.stopReason}).` }, true));
      }

      parts.push({
        type: 'finish',
        finishReason: { unified: FINISH_REASONS[response.stopReason], raw: response.stopReason },
        usage: {
          inputTokens: { total: contextTokens, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: undefined, text: undefined, reasoning: undefined },
        },
      });

      return parts;
    },
  };
}

function toolInput(title: string, rawInput: unknown): Record<string, unknown> {
  if (rawInput !== null && typeof rawInput === 'object' && !Array.isArray(rawInput)) {
    return { title, ...rawInput };
  }

  return rawInput === undefined ? { title } : { title, input: rawInput };
}

function resultOf(call: ToolCall | ToolCallUpdate): ToolResult {
  const output = (call.content ?? []).map(describeContent).filter((text) => text.length > 0);

  if (output.length > 0) {
    return { output: output.join('\n\n') };
  }

  if (typeof call.rawOutput === 'string') {
    return { output: call.rawOutput };
  }

  return { output: call.rawOutput === undefined ? '' : JSON.stringify(call.rawOutput) };
}

function describeContent(content: ToolCallContent): string {
  switch (content.type) {
    case 'content': {
      return content.content.type === 'text' ? content.content.text : `[${content.content.type}]`;
    }

    case 'diff': {
      return `${content.oldText == null ? 'Created' : 'Edited'} ${content.path}`;
    }

    case 'terminal': {
      return `[terminal ${content.terminalId}]`;
    }

    default: {
      // A subagent session reference: nothing to show in the result.
      return '';
    }
  }
}
