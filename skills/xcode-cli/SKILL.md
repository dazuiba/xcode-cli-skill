---
name: xcode-cli
version: 1.0.0
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
- The bridge is running via one of:
  - Background service: `xcode-cli-ctl install`
  - Foreground (in a separate terminal): `xcode-cli-ctl run`
- The bridge listens on `http://127.0.0.1:48321/mcp`

## Workflow

### 1. Discover tab identifier
```bash
xcode-cli windows
```
Returns the `tabIdentifier` (e.g. `windowtab1`) and corresponding workspace path.
If exactly one Xcode tab is open, `--tab` is auto-detected for all commands.

### 2. Build
```bash
xcode-cli build
```

### 3. View build errors
```bash
xcode-cli build-log --severity error
```

### 4. Single-file diagnostics (no full build required)
```bash
xcode-cli file-issues "MyApp/Sources/Controllers/MyFile.swift"
```

### 5. View all Navigator issues
```bash
xcode-cli issues --severity error
```

### 6. Quick project status (windows + issues)
```bash
xcode-cli status
```

### 7. SwiftUI preview (requires #Preview macro)
```bash
xcode-cli preview "MyApp/Sources/Views/MyView.swift" --out ./preview-out
```

### 8. Execute code snippet
```bash
xcode-cli snippet "MyApp/Sources/SomeFile.swift" "print(someExpression)"
```

### 9. Testing
```bash
xcode-cli test all
xcode-cli test list --json
xcode-cli test some "TargetName::ClassName/testMethod()"
xcode-cli test some --target TargetName "ClassName#testMethod"
xcode-cli test list
```
For exact MCP parity, use `targetName` + `identifier` from `test list --json`:
- `targetName` maps to `RunSomeTests.tests[].targetName`
- `identifier` maps to `RunSomeTests.tests[].testIdentifier`

`RunSomeTests` only runs tests from the active scheme's active test plan in Xcode.
If a target is missing (for example you need `DashProxyMac` while `DashProxy` is active), switch scheme in Xcode first, then run `xcode-cli test list --json` again.

### 10. Search Apple documentation
```bash
xcode-cli doc "SwiftUI NavigationStack" --frameworks SwiftUI
```

### 11. File operations (within Xcode project structure)
```bash
xcode-cli read "path/to/file"
xcode-cli ls /
xcode-cli ls -r /
xcode-cli grep "TODO|FIXME"
xcode-cli glob "**/*.swift"
xcode-cli write "path/to/file" "content"
xcode-cli update "path/to/file" "oldText" "newText" --replace-all
xcode-cli mv "Old.swift" "New.swift"
xcode-cli mkdir "MyApp/Sources/Feature"
xcode-cli rm "MyApp/Sources/Unused.swift"
```

### 12. Service management
```bash
xcode-cli-ctl install         # Install and start as background service (launchd)
xcode-cli-ctl status          # Check if bridge is running
xcode-cli-ctl logs -f         # Follow bridge logs
xcode-cli-ctl uninstall       # Stop and remove service
```

## Notes
- File paths are relative to the Xcode project structure, not absolute filesystem paths.
- Use `--tab <tabIdentifier>` if multiple Xcode tabs are open.
- If the bridge is not responding: `xcode-cli-ctl status` then `xcode-cli-ctl uninstall && xcode-cli-ctl install`.
- For JSON output, add `--json` to any command.
- Use `xcode-cli run <toolName> --args '{"key":"value"}'` to invoke any MCP tool directly.

## CLI to MCP Mapping
- `status` -> `XcodeListWindows` + `XcodeListNavigatorIssues`
- `build` -> `BuildProject`
- `build-log` -> `GetBuildLog`
- `test all` -> `RunAllTests`
- `test list` -> `GetTestList`
- `test some` -> `RunSomeTests`
- `issues` -> `XcodeListNavigatorIssues`
- `file-issues` -> `XcodeRefreshCodeIssuesInFile`
- `windows` -> `XcodeListWindows`
- `read` -> `XcodeRead`
- `grep` -> `XcodeGrep`
- `ls` -> `XcodeLS`
- `glob` -> `XcodeGlob`
- `write` -> `XcodeWrite`
- `update` -> `XcodeUpdate`
- `mv` -> `XcodeMV`
- `mkdir` -> `XcodeMakeDir`
- `rm` -> `XcodeRM`
- `preview` -> `RenderPreview`
- `snippet` -> `ExecuteSnippet`
- `doc` -> `DocumentationSearch`
