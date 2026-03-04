---
name: xcode-cli
version: 0.1.0
description: Xcode IDE interaction skill. Invokes Xcode MCP tools via the xcode-cli CLI, supporting build, diagnostics, testing, and previews. Use when the user asks to build an Xcode project, view build errors, run single-file diagnostics, run tests, render SwiftUI previews, or search Apple documentation.
---

# xcode-cli Skill

Xcode IDE interaction skill. Invokes Xcode MCP tools via the `xcode-cli` CLI, supporting build, diagnostics, testing, previews, and more.

## Prerequisites
- mcp-proxy is running via pm2 on localhost:9876 (`pm2 start xcode-mcp-proxy`)
- Xcode has the target project open

## Workflow

### 1. Get tab-identifier
```bash
xcode-cli XcodeListWindows
```
Returns the `tabIdentifier` (e.g. `windowtab1`) and the corresponding workspace path.

### 2. Build
```bash
xcode-cli BuildProject --tab-identifier windowtab1
```

### 3. View build errors
```bash
xcode-cli GetBuildLog --tab-identifier windowtab1 --severity error
```

### 4. Single-file diagnostics (no full build required)
```bash
xcode-cli XcodeRefreshCodeIssuesInFile --tab-identifier windowtab1 \
  --file-path "MapApp/Sources/Controllers/MyFile.swift"
```

### 5. View all Navigator Issues
```bash
xcode-cli XcodeListNavigatorIssues --tab-identifier windowtab1
```

### 6. SwiftUI preview (requires a #Preview macro in the file)
```bash
xcode-cli RenderPreview --tab-identifier windowtab1 \
  --source-file-path "MapApp/Sources/Views/MyView.swift"
```

### 7. Execute code snippet
```bash
xcode-cli ExecuteSnippet --tab-identifier windowtab1 \
  --source-file-path "MapApp/Sources/SomeFile.swift" \
  --code-snippet "print(someExpression)"
```

### 8. Testing
```bash
xcode-cli RunAllTests --tab-identifier windowtab1
xcode-cli RunSomeTests --tab-identifier windowtab1 --tests "MyTestClass/testMethod"
xcode-cli GetTestList --tab-identifier windowtab1
```

### 9. Search Apple documentation
```bash
xcode-cli DocumentationSearch --query "SwiftUI NavigationStack"
```

### 10. File operations (within Xcode project structure)
```bash
xcode-cli XcodeRead --tab-identifier windowtab1 --file-path "path/to/file"
xcode-cli XcodeLS --tab-identifier windowtab1 --path "path/"
xcode-cli XcodeGrep --tab-identifier windowtab1 --pattern "searchTerm"
xcode-cli XcodeGlob --tab-identifier windowtab1 --pattern "**/*.swift"
xcode-cli XcodeWrite --tab-identifier windowtab1 --file-path "path" --content "..."
xcode-cli XcodeUpdate --tab-identifier windowtab1 --file-path "path" --old-string "old" --new-string "new"
```

## Notes
- `--file-path` uses relative paths within the Xcode project structure, not absolute filesystem paths
- For creating new files, still use `make gen` (XcodeWrite does not go through the xcodegen spec)
- If the proxy is down: `pm2 restart xcode-mcp-proxy`
