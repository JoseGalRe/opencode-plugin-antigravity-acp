import type { StagedFile } from '../prompt/prompt.types.ts';

/**
 * The private directory where attached files wait for `agy` to read them. Created on the first file, readable by this
 * user only, and removed with every file in it by `dispose`.
 */
export type Attachments = {
  /**
   * Writes an attached file into the directory, under a unique name that keeps the original one at its end.
   *
   * @param file The file to write.
   *
   * @returns The file's absolute path.
   *
   * @example
   * ```ts
   * const path = await attachments.write({ data, mediaType: 'application/pdf', filename: 'report.pdf' });
   * ```
   */
  readonly write: (file: StagedFile) => Promise<string>;
  /**
   * Removes the directory and every file in it. Safe to call more than once, and when nothing was written.
   *
   * @returns Resolves once the directory is gone.
   *
   * @example
   * ```ts
   * await attachments.dispose();
   * ```
   */
  readonly dispose: () => Promise<void>;
};
