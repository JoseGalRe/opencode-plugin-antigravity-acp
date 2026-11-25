import type { PromptMessage } from '../ai-sdk/ai-sdk.types.ts';

/**
 * One content part of an OpenCode user message: text or a file.
 */
export type UserPart = Extract<PromptMessage, { role: 'user' }>['content'][number];

/**
 * A file part of an OpenCode user message, such as an attached image or document.
 */
export type FilePart = Extract<UserPart, { type: 'file' }>;

/**
 * A file attached to a user message that `agy` only reads from disk: anything but text and images. `agy` 1.5.16
 * ignores such files embedded in the prompt, and reads one it is given a `resource_link` to.
 */
export type StagedFile = {
  /**
   * The file's bytes.
   */
  readonly data: Uint8Array;
  /**
   * Its media type (`application/pdf`).
   */
  readonly mediaType: string;
  /**
   * The name OpenCode gave it (`report.pdf`); `undefined` when it has none.
   */
  readonly filename: string | undefined;
};

/**
 * Writes an attached file where `agy` can read it, and says where.
 *
 * @param file The file to write.
 *
 * @returns The absolute path of the written file.
 *
 * @example
 * ```ts
 * const stageFile: StageFile = (file) => attachments.write(file);
 * ```
 */
export type StageFile = (file: StagedFile) => Promise<string>;
