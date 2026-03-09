---
name: xcode-cli
description: >-
  Xcode IDE interaction skill. Uses the xcode-cli CLI to build, diagnose,
  test, preview, and edit Xcode projects via MCP. Use when the user asks to
  build an Xcode project, view build errors, run diagnostics, run tests,
  render SwiftUI previews, search Apple documentation, or manage project files.
---

# xcode-cli Skill

Interact with Xcode through the `xcode-cli` CLI backed by the Xcode MCP bridge.

## Prerequisites

- Xcode 26.3 or later is installed and open with the target project
- `xcode-cli` is installed: `npm install -g xcode-cli`
- Bridge running: `xcode-cli-ctl install` (background) or `xcode-cli-ctl run` (foreground)

## Commands

All commands: `xcode-cli <cmd> [args]`. Use `--tab <tabIdentifier>` if multiple Xcode tabs are open; auto-detected when only one tab is open. Add `--json` for JSON output.

| Command | Usage | Notes |
|---------|-------|-------|
| `windows` | `windows` | List tabs/workspaces; get `tabIdentifier` |
| `status` | `status` | Quick project status (windows + issues) |
| `build` | `build` | Build project |
| `build-log` | `build-log --severity error` | View build errors |
| `issues` | `issues --severity error` | Navigator issues |
| `file-issues` | `file-issues "MyApp/Sources/MyFile.swift"` | Single-file diagnostics, no full build |
| `test` | `test all` / `test list [--json]` / `test some "Target::Class/method()"` | Run/list tests |
| `preview` | `preview "MyApp/Sources/MyView.swift" --out ./out` | SwiftUI preview (requires `#Preview` macro) |
| `snippet` | `snippet "MyApp/Sources/File.swift" "print(expr)"` | Execute code snippet |
| `doc` | `doc "SwiftUI NavigationStack" --frameworks SwiftUI` | Search Apple documentation |
| `read` | `read "path/to/file"` | Read file |
| `ls` | `ls [-r] /` | List directory |
| `grep` | `grep "TODO\|FIXME"` | Search files |
| `glob` | `glob "**/*.swift"` | Find files by pattern |
| `write` | `write "path/to/file" "content"` | Write file |
| `update` | `update "path/to/file" "old" "new" [--replace-all]` | Edit file |
| `mv` | `mv "Old.swift" "New.swift"` | Move/rename file |
| `mkdir` | `mkdir "MyApp/Sources/Feature"` | Create directory |
| `rm` | `rm "MyApp/Sources/Unused.swift"` | Delete file |

## Notes

- File paths are relative to the Xcode project structure, not absolute filesystem paths.
- If the bridge is not responding: `xcode-cli-ctl status` then `xcode-cli-ctl uninstall && xcode-cli-ctl install`.
- Use `xcode-cli run <toolName> --args '{"key":"value"}'` to invoke any MCP tool directly.
- Testing: use `targetName` + `identifier` from `test list --json` for exact test targeting. `test some` only runs tests from the active scheme's active test plan — switch scheme in Xcode if a target is missing.
