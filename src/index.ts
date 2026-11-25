import { setup } from './plugin/setup/setup.ts';

import type { Plugin } from '@opencode/plugin';

/**
 * The OpenCode server plugin. OpenCode loads it from this package's default export; it exports nothing else.
 */
const plugin: Plugin.Plugin = {
  id: 'opencode-plugin-antigravity-acp',
  setup,
};

export default plugin;
