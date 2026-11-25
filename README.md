# opencode-plugin-antigravity-acp

Use your Google Antigravity subscription in [OpenCode](https://opencode.ai) through the official `agy acp` server.

Antigravity CLI ships an [Agent Client Protocol](https://agentclientprotocol.com/) (ACP) server, `agy acp`, which
editors such as Zed, JetBrains IDEs and Xcode start as a subprocess to run the Antigravity agent in their own UI. This
plugin does the same for OpenCode: it is an ACP **client** that starts `agy acp` and speaks JSON-RPC over its stdio.

> **Status: early development.** The ACP client works and is tested: it starts `agy acp`, initializes, manages
> sessions and runs turns with cancellation, permission requests and file access. The OpenCode provider that puts it
> in OpenCode's model picker is not written yet, so the plugin cannot be used from OpenCode today.

## How it works

```text
OpenCode ──▶ this plugin (ACP client) ──stdio, JSON-RPC──▶ agy acp ──▶ Google Antigravity
```

- **Only `agy` talks to Google.** The plugin has no Google or Antigravity URL and never makes a network request to
  them; a lint rule rejects network modules in `src/`. Sign-in, tokens, model calls and telemetry all stay inside
  `agy`, exactly as when you use it in a terminal or in Zed.
- **No borrowed credentials.** The plugin never reads `agy`'s credential files and never calls its backend directly.
- **Honest identity.** In `initialize` the plugin names itself (`opencode-plugin-antigravity-acp`), never another
  editor. With that identity `agy` 1.5.16 offers every model of the account, Gemini, Claude and GPT-OSS alike.
- **Telemetry off.** `agy` is started as `agy acp --disable-telemetry`.

Whether driving `agy` from a third-party ACP client fits Google's terms is Google's call. This plugin stays on the
path Google documents for editors (the official `agy acp` binary) and does nothing that path does not. Check the
current Antigravity terms for your account before you use it.

## Requirements

- [Antigravity CLI](https://antigravity.google/docs/install?tab=cli) 1.5.0 or later, which has `agy acp`. Check with
  `agy acp --help`.
- Signed in once: run `agy` interactively, or `agy acp --login` (works over SSH).
- Node.js 26.13.1 or later and pnpm 12.16.1 or later, to build.

## Development

```bash
pnpm install       # also points git at the hooks in .vite-hooks/
pnpm ready         # format check, lint, type check and tests
pnpm build         # dist/index.js, dependencies included, and dist/index.d.ts
pnpm smoke         # talks to your real `agy` without prompting: no quota spent
```

| Script                        | What it runs                                                |
| ----------------------------- | ----------------------------------------------------------- |
| `test`                        | `vp test` (Vitest)                                          |
| `lint:check` / `lint:fix`     | `vp lint`: Oxlint with type-aware rules and type check      |
| `format:check` / `format:fix` | `vp format`: Oxfmt                                          |
| `build`                       | `vp pack`: one self-contained ESM file and its declarations |
| `smoke`                       | `scripts/smoke-agy.ts --session` against the real `agy`     |

The toolchain is [Vite+](https://viteplus.dev): formatting, linting, the type check (tsrs, the Rust port of the
TypeScript 7 compiler, so there is no `typescript` package), tests and git hooks. Conventions for code and comments
are in [AGENTS.md](AGENTS.md).

Tests run against an ACP server that stands in for `agy` (`tests/fixtures/fake-agy.ts`), so they need neither `agy`
nor a network.

## Using the client

The package currently exports the ACP client on its own:

```ts
import { connectAgyClient, DEFAULT_AGY_ARGS, spawnAgy } from 'opencode-plugin-antigravity-acp';

const agy = spawnAgy({ command: 'agy', args: [...DEFAULT_AGY_ARGS], cwd: '/repo' });

try {
  const acp = await connectAgyClient(agy.stream, {
    onSessionUpdate: ({ update }) => {
      if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
        process.stdout.write(update.content.text);
      }
    },
    requestPermission: async () => ({ outcome: { outcome: 'cancelled' } }),
  });
  const { sessionId } = await acp.newSession({ cwd: '/repo', mcpServers: [] });

  await acp.prompt({ sessionId, prompt: [{ type: 'text', text: 'Summarize this repository' }] });
  acp.close();
} finally {
  agy.kill();
}
```

## Roadmap

1. An OpenCode provider that lists `agy`'s models and thinking levels and streams each turn's text, reasoning and
   tool calls into OpenCode.
2. `agy`'s permission requests answered through OpenCode's permission rules and prompts.
3. File access, terminals and questions (ACP elicitation) served by OpenCode.
4. Sessions kept across restarts with `session/load` and `session/resume`.
