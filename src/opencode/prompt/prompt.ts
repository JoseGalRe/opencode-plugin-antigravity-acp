import type { PromptMessage } from '../ai-sdk/ai-sdk.types.ts';
import type { FilePart } from './prompt.types.ts';
import type { ContentBlock } from '@agentclientprotocol/sdk';

/**
 * Converts the new user input of an OpenCode prompt into ACP content blocks. `agy` keeps the conversation itself,
 * so only the user messages after the last assistant message are sent: earlier turns, OpenCode's system prompt and
 * its tool definitions are not.
 *
 * @param prompt The prompt of one model call, as OpenCode sends it to `doStream`.
 *
 * @returns The blocks for `session/prompt`, empty when the prompt ends without new user input.
 */
export function toAcpPrompt(prompt: readonly PromptMessage[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  let start = prompt.length;

  while (start > 0 && prompt[start - 1]?.role !== 'assistant') {
    start -= 1;
  }

  for (const message of prompt.slice(start)) {
    if (message.role !== 'user') {
      continue;
    }

    for (const part of message.content) {
      const block = part.type === 'text' ? textBlock(part.text) : fileBlock(part);

      if (block) {
        blocks.push(block);
      }
    }
  }

  return blocks;
}

function textBlock(text: string): ContentBlock | undefined {
  return text.length > 0 ? { type: 'text', text } : undefined;
}

function fileBlock(part: FilePart): ContentBlock | undefined {
  const { data, mediaType, filename } = part;

  if (data instanceof URL) {
    return { type: 'resource_link', uri: data.href, name: filename ?? data.href, mimeType: mediaType };
  }

  const base64 = typeof data === 'string' ? data : Buffer.from(data).toString('base64');

  if (mediaType.startsWith('image/')) {
    return { type: 'image', data: base64, mimeType: mediaType };
  }

  if (mediaType.startsWith('text/') || mediaType === 'application/json') {
    return {
      type: 'resource',
      resource: {
        uri: `file:///${encodeURIComponent(filename ?? 'attachment')}`,
        mimeType: mediaType,
        text: Buffer.from(base64, 'base64').toString('utf8'),
      },
    };
  }

  return {
    type: 'resource',
    resource: {
      uri: `file:///${encodeURIComponent(filename ?? 'attachment')}`,
      mimeType: mediaType,
      blob: base64,
    },
  };
}
