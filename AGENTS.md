# AGENTS.md

## Purpose

This repository provides a user-friendly CLI (`xcode-cli`) for interacting with Xcode MCP tools via a local HTTP bridge.

## Hard Rules

- Do **not** hand-edit generated bindings in `src/mcpbridge.ts`.
- Prefer minimal, focused edits that preserve existing CLI behavior.

## Repository Map

- `src/xcode.ts`: main CLI entrypoint and command definitions.
- `src/xcode-output.ts`: text/json result formatting.
- `src/xcode-mcp.ts`: HTTP bridge server that proxies to `xcrun mcpbridge`.
- `src/xcode-service.ts`: launchd service management (install/uninstall/status/logs).
- `src/xcode-skill.ts`: skill install/uninstall for agent skill directories.
- `src/mcpbridge.ts`: generated MCP client/bindings (generated, not hand-maintained).
- `skills/xcode-cli/SKILL.md`: agent skill definition shipped with the package.
- `tests/*.test.ts`: Node test suite.
- `bin/xcode-cli`: runtime launcher.

## Preferred Workflow

1. Inspect current behavior first:
   - `./bin/xcode-cli --help`
   - targeted command help (for example: `./bin/xcode-cli doc --help`)
2. Make the smallest viable code change.
3. Run verification:
   - `npm test`
   - targeted smoke check using `./bin/xcode-cli --help` (and command-specific help if relevant)
4. Update docs/help text when command UX changes.

## Command/UX Conventions

- Keep command names and flags consistent with existing style in `src/xcode.ts`.
- Preserve text output readability by default; `--json` should remain machine-friendly.
- For new user-facing commands:
  - include clear `.description(...)`
  - add practical help examples when useful
  - consider help ordering (`applyCommandOrder(...)`) so common commands stay near the top

## Formatting and Output Guidance

- When adding new output shaping, prefer extending `src/xcode-output.ts` with explicit payload formatters.
- Avoid dropping structured fields in text mode unless clearly noisy/redundant.
- Keep truncation and diagnostics messages explicit.

## Generation Notes

- `src/mcpbridge.ts` is generated from MCP metadata.
- Regeneration command:
  - `npm run generate`
- If behavior changes require regenerated bindings, regenerate instead of manual edits.

## Documentation Expectations

- Keep README usage-first (quick start, common commands, agent setup).

## Pre-Completion Checklist

- Code compiles/tests pass via `npm test`.
- Help output reflects new or changed behavior.
- No accidental edits to unrelated files.
- No use of `xcodebuild` introduced.
