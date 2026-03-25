# Changelog

## 1.0.12 – 2026-03-25 – fix: `snippet` command now passes required `purpose` parameter

### Fixed
- `snippet` command was missing the required `purpose` parameter for the MCP `ExecuteSnippet` tool, causing all snippet calls to fail with "The data couldn't be read because it is missing."
- Added `--purpose <description>` option (defaults to "Execute code snippet")
- Updated SKILL.md to document `--purpose` option

---

## 1.0.10 – 2026-03-24 – feat: `run` now builds via MCP before launching

### Changed
- `run` command now calls `BuildProject` via MCP first; if the build fails, returns the build error JSON as-is and exits with code 1
- On build success, triggers run-without-build via AppleScript and returns JSON result `{ buildResult, runTriggered }`
- All `run` output (success and failure) is now JSON-capable (`--json` flag)
- Updated SKILL.md to reflect new `run` behavior

---

## 1.0.9 – 2026-03-15 – fix: auto-reconnect when Xcode restarts

### Fixed
- Bridge now auto-reconnects to `xcrun mcpbridge` when the upstream connection drops (e.g. Xcode restart), with exponential backoff (1s → 30s)
- Health endpoint `/health` now reflects actual upstream state (`connected`, `reconnecting`) instead of always returning `ok: true`
- New session requests return HTTP 503 with "Reconnecting to Xcode..." during reconnection instead of generic `-32603`

---

## 1.0.8 – 2026-03-10 – fix: add timestamps to stderr logs

### Fixed
- All stderr log lines now include ISO 8601 timestamps (e.g. `[2026-03-10T12:00:00.000Z] MCP bridge listening on …`)

---

## [e7b2bef] – 2026-03-10 – fix: resolve "No tab identifier found"

### Fixed
- `--tab <tabIdentifier>` is now mandatory for all commands; SKILL.md instructs users to run `windows` first to obtain the identifier

### Added
- `run` command: build and run the active scheme via AppleScript (like Cmd+R in Xcode)
- `run-without-build` command: run without building via AppleScript (like Ctrl+Cmd+R in Xcode)
- `call` command: invoke any MCP tool directly with JSON args (replaces the old ambiguous `run <toolName>`)

### Changed
- SKILL.md: added `run`, `run-without-build`, corrected `call` command reference, added Accessibility grant note

---

## [db14b86] – 2026-03-10 – feat: upgrade bridge to xcode-cli@1.0.5, symlink skill install

### Added
- Skill installation now uses a symlink so upgrades are reflected automatically without reinstalling
- Install script links SKILL.md to `~/.claude2/skills/xcode-cli` in addition to Claude and Codex dirs

### Changed
- Regenerated `mcpbridge.ts` from `xcode-mcp@1.0.0` (node/rolldown) to `xcode-cli@1.0.5` (bun)
- Skill install uses `lstat` instead of `access` to correctly detect existing symlinks

---

## [0636a79] – 2026-03-09 – fix: compress SKILL.md from 3000 to 776 token

- Rewrote SKILL.md as a compact reference table (776 tokens vs. 3000 before)

## [3463333] – 2026-03-07 – update readme

- Updated README with current usage and command reference

## [59fba10] – 2026-03-06 – new command arch

- Introduced new command architecture for xcode-cli CLI

## [784d6df] – 2026-03-04 – Translate SKILL.md from Chinese to English

- Translated SKILL.md documentation from Chinese to English
