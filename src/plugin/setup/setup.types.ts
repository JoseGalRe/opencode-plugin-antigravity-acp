import type { Plugin } from '@opencode/plugin';

/**
 * A session's messages, as `ctx.session.context` returns them; the title is taken from the first user message.
 */
export type SessionMessages = Awaited<ReturnType<Plugin.Context['session']['context']>>;
