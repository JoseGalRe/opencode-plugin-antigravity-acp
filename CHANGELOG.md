# opencode-plugin-antigravity-acp

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
