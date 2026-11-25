import type { VariantID } from './ids.types.ts';
import type { Model, Provider } from '@opencode/plugin';

/**
 * Types a string as a `Model.ID`.
 *
 * @param value The model ID (`gemini-4-neon`).
 *
 * @returns The same string, typed as a `Model.ID`.
 *
 * @example
 * ```ts
 * const id = toModelId('gemini-4-neon');
 * ```
 */
export function toModelId(value: string): Model.ID {
  if (!isModelId(value)) {
    throw new Error('A model ID cannot be empty');
  }

  return value;
}

/**
 * Types a string as a `Provider.ID`.
 *
 * @param value The provider ID (`antigravity`).
 *
 * @returns The same string, typed as a `Provider.ID`.
 *
 * @example
 * ```ts
 * const id = toProviderId(PROVIDER_ID);
 * ```
 */
export function toProviderId(value: string): Provider.ID {
  if (!isProviderId(value)) {
    throw new Error('A provider ID cannot be empty');
  }

  return value;
}

/**
 * Types a string as a model variant ID.
 *
 * @param value The variant ID, here a thinking level (`high`).
 *
 * @returns The same string, typed as a variant ID.
 *
 * @example
 * ```ts
 * const variants = ['low', 'high'].map((level) => ({ id: toVariantId(level) }));
 * ```
 */
export function toVariantId(value: string): VariantID {
  if (!isVariantId(value)) {
    throw new Error('A variant ID cannot be empty');
  }

  return value;
}

function isModelId(value: string): value is Model.ID {
  return value.length > 0;
}

function isProviderId(value: string): value is Provider.ID {
  return value.length > 0;
}

function isVariantId(value: string): value is VariantID {
  return value.length > 0;
}
