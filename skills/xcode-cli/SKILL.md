---
name: xcode-cli
version: 0.1.0
description: Xcode IDE 交互技能。通过 xcode-cli CLI 调用 Xcode MCP 工具，支持编译、诊断、测试、预览。使用场景：用户要求编译 Xcode 项目、查看编译错误、单文件诊断、运行测试、渲染 SwiftUI 预览、搜索 Apple 文档。
---

# xcode-cli Skill

Xcode IDE 交互技能。通过 `xcode-cli` CLI 调用 Xcode MCP 工具，支持编译、诊断、测试、预览等操作。

## 前置条件
- mcp-proxy 通过 pm2 运行在 localhost:9876（`pm2 start xcode-mcp-proxy`）
- Xcode 已打开目标工程

## 使用流程

### 1. 获取 tab-identifier
```bash
xcode-cli XcodeListWindows
```
返回 `tabIdentifier`（如 `windowtab1`）和对应的 workspace 路径。

### 2. 编译
```bash
xcode-cli BuildProject --tab-identifier windowtab1
```

### 3. 查看编译错误
```bash
xcode-cli GetBuildLog --tab-identifier windowtab1 --severity error
```

### 4. 单文件诊断（无需完整编译）
```bash
xcode-cli XcodeRefreshCodeIssuesInFile --tab-identifier windowtab1 \
  --file-path "MapApp/Sources/Controllers/MyFile.swift"
```

### 5. 查看所有 Navigator Issues
```bash
xcode-cli XcodeListNavigatorIssues --tab-identifier windowtab1
```

### 6. SwiftUI 预览（需要文件中有 #Preview 宏）
```bash
xcode-cli RenderPreview --tab-identifier windowtab1 \
  --source-file-path "MapApp/Sources/Views/MyView.swift"
```

### 7. 执行代码片段
```bash
xcode-cli ExecuteSnippet --tab-identifier windowtab1 \
  --source-file-path "MapApp/Sources/SomeFile.swift" \
  --code-snippet "print(someExpression)"
```

### 8. 测试
```bash
xcode-cli RunAllTests --tab-identifier windowtab1
xcode-cli RunSomeTests --tab-identifier windowtab1 --tests "MyTestClass/testMethod"
xcode-cli GetTestList --tab-identifier windowtab1
```

### 9. 搜索 Apple 文档
```bash
xcode-cli DocumentationSearch --query "SwiftUI NavigationStack"
```

### 10. 文件操作（Xcode 项目结构内）
```bash
xcode-cli XcodeRead --tab-identifier windowtab1 --file-path "path/to/file"
xcode-cli XcodeLS --tab-identifier windowtab1 --path "path/"
xcode-cli XcodeGrep --tab-identifier windowtab1 --pattern "searchTerm"
xcode-cli XcodeGlob --tab-identifier windowtab1 --pattern "**/*.swift"
xcode-cli XcodeWrite --tab-identifier windowtab1 --file-path "path" --content "..."
xcode-cli XcodeUpdate --tab-identifier windowtab1 --file-path "path" --old-string "old" --new-string "new"
```

## 注意事项
- `--file-path` 使用 Xcode 项目结构内的相对路径，不是文件系统绝对路径
- 新建文件仍用 `make gen`（XcodeWrite 不经过 xcodegen spec）
- 如果 proxy 挂了：`pm2 restart xcode-mcp-proxy`
