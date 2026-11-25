import type { PromptMessage } from '../ai-sdk/ai-sdk.types.ts';

/**
 * One content part of an OpenCode user message: text or a file.
 */
export type UserPart = Extract<PromptMessage, { role: 'user' }>['content'][number];

/**
 * A file part of an OpenCode user message, such as an attached image or document.
 */
export type FilePart = Extract<UserPart, { type: 'file' }>;
