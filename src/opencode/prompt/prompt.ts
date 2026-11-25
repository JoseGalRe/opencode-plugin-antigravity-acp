import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { PromptMessage } from '../ai-sdk/ai-sdk.types.ts';
import type { FilePart, StageFile } from './prompt.types.ts';
import type { ContentBlock } from '@agentclientprotocol/sdk';

/**
 * The tags around the summary OpenCode replays after a compaction (OpenCode 2.4.1).
 */
const CHECKPOINT = {
  OPEN: '<conversation-checkpoint>',
  CLOSE: '</conversation-checkpoint>',
};

/**
 * Commands of `agy`, built in or skills it ships, that start work outside the user's turn: a schedule, a goal it runs
 * until done, teams of agents, background hand-offs. Every other command, the user's own skills included, runs within
 * the turn and passes.
 */
const BACKGROUND_COMMANDS: ReadonlySet<string> = new Set([
  'boost',
  'chief-of-staff',
  'claude-handoff',
  'goal',
  'schedule',
  'swarm',
  'teamwork',
]);

/**
 * A leading slash command: `/` and a name, then whitespace or the end.
 */
const COMMAND_PATTERN = /^\/([A-Za-z][\w-]*)(?=\s|$)/;

/**
 * Converts the new user input of an OpenCode prompt into ACP content blocks. `agy` keeps the conversation itself,
 * so only the user messages after the last assistant message are sent: earlier turns, OpenCode's system prompt and
 * its tool definitions are not. Neither is the `<conversation-checkpoint>` OpenCode replays after a compaction: the
 * compacted context lives in `agy`'s session.
 *
 * Text and images are sent in the prompt. Any other file is written with `stageFile` and sent as a `resource_link`,
 * which `agy` reads with its own tools: it ignores such files embedded in the prompt (agy 1.5.16).
 *
 * @param prompt The prompt of one model call, as OpenCode sends it to `doStream`.
 * @param stageFile Writes a file that has to be sent as a link.
 *
 * @returns The blocks for `session/prompt`, empty when the prompt ends without new user input.
 */
export async function toAcpPrompt(prompt: readonly PromptMessage[], stageFile: StageFile): Promise<ContentBlock[]> {
  const blocks: ContentBlock[] = [];

  let start = prompt.length;

  while (start > 0 && prompt[start - 1]?.role !== 'assistant') {
    start -= 1;
  }

  let inCheckpoint = false;

  for (const message of prompt.slice(start)) {
    if (message.role !== 'user') {
      continue;
    }

    for (const part of message.content) {
      // OpenCode's checkpoint can span several text parts: skip from its opening tag through its closing one.
      if (part.type === 'text' && (inCheckpoint || part.text.trimStart().startsWith(CHECKPOINT.OPEN))) {
        inCheckpoint = !part.text.trimEnd().endsWith(CHECKPOINT.CLOSE);

        continue;
      }

      const block = part.type === 'text' ? textBlock(part.text) : await fileBlock(part, stageFile);

      if (block) {
        blocks.push(block);
      }
    }
  }

  return blocks;
}

/**
 * The background command a prompt starts with, if any. `agy` runs a prompt whose text starts with one of its commands
 * as that command; the ones in `BACKGROUND_COMMANDS` run outside the user's turn. Skills and other commands, and paths
 * such as `/home/me/notes.md`, are not reported.
 *
 * @param blocks The prompt's blocks, as `toAcpPrompt` returns them.
 *
 * @returns The command name without its `/`, or `undefined` when the prompt does not start with a background one.
 */
export function backgroundCommand(blocks: readonly ContentBlock[]): string | undefined {
  const first = blocks[0];
  const name = first?.type === 'text' ? COMMAND_PATTERN.exec(first.text.trimStart())?.[1] : undefined;

  return name !== undefined && BACKGROUND_COMMANDS.has(name) ? name : undefined;
}

function textBlock(text: string): ContentBlock | undefined {
  return text.length > 0 ? { type: 'text', text } : undefined;
}

async function fileBlock(part: FilePart, stageFile: StageFile): Promise<ContentBlock | undefined> {
  const { data, mediaType, filename } = part;

  if (data instanceof URL) {
    return { type: 'resource_link', uri: data.href, name: filename ?? data.href, mimeType: mediaType };
  }

  const bytes = typeof data === 'string' ? Buffer.from(data, 'base64') : data;

  if (mediaType.startsWith('image/')) {
    return { type: 'image', data: Buffer.from(bytes).toString('base64'), mimeType: mediaType };
  }

  if (mediaType.startsWith('text/') || mediaType === 'application/json') {
    return {
      type: 'resource',
      resource: {
        uri: `file:///${encodeURIComponent(filename ?? 'attachment')}`,
        mimeType: mediaType,
        text: Buffer.from(bytes).toString('utf8'),
      },
    };
  }

  const path = await stageFile({ data: bytes, mediaType, filename });

  return { type: 'resource_link', uri: pathToFileURL(path).href, name: filename ?? basename(path), mimeType: mediaType };
}
