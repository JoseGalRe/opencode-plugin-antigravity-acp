# opencode-plugin-antigravity-acp

## 0.2.1

### Patch Changes

- Token usage reaches OpenCode: each turn records `agy`'s input, output, reasoning and cache-read tokens, so the
  session's context and token totals are no longer 0.

## 0.2.0

### Minor Changes

- One `agy` process per OpenCode server instead of one per open project: projects share it, each ACP session works in
  its own project's directory, and permission requests go to the project whose session asked.
- `agy` no longer starts with OpenCode once the model list is saved: it starts with the first Antigravity turn, and
  the session that turn opens refreshes the list.
- Each model's context window comes from what `agy` reports in its turns (`usage_update`), saved with the model list,
  instead of a fixed figure.

## 0.1.0

### Minor Changes

- First release: an `antigravity` provider for OpenCode 2.4 whose turns run in your own `agy acp`, the official ACP
  server of Antigravity CLI. The plugin is an ACP client, like Zed; it never contacts Google itself.
- The Gemini models `agy` offers appear as `antigravity/<model>`, with `agy`'s thinking levels as variants
  (`antigravity/gemini-4-neon#high`). The list is read from `agy` on the first start, saved, and refreshed on each
  start.
- One ACP session per OpenCode session: `agy` keeps the conversation, its thoughts stream as reasoning and its tools
  show as completed tool calls.
- `agy`'s permission requests go through OpenCode's permission rules: commands as `shell`, edits as `edit`, reads as
  `read`, searches as `grep`, fetches as `webfetch`, anything else as `antigravity`.
- Only your own turns reach `agy`: titles come from your first message, compaction records a note, and background
  generation and subagents with an `antigravity` model are refused (see Terms of service in the README).
- Options: `command` (the Antigravity CLI, `agy` by default) and `args` (extra `agy acp` flags such as
  `--sandbox`; `--cloud_code_endpoint` is refused).
- Ships as one self-contained `opencode-plugin-antigravity-acp-<version>.js`, with its dependencies' licenses in the
  file.
