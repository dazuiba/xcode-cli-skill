# xcode-cli

[English](./README.md)

Xcode MCP 工具的 CLI 封装 — 在终端中构建、诊断、测试和预览 Xcode 项目，告别 TCC 弹窗噩梦。

## 问题

<img src="alert.jpg" width="360" alt="macOS TCC 权限弹窗：允许 Codex 访问 Xcode？">

如果你在用 AI 代理（Claude Code、Codex、Cursor...）配合 Xcode 26 的 MCP 工具，一定遇到过这个 macOS 权限弹窗循环：

> **允许 "Codex" 访问 Xcode？**
> 代理 "Codex" 位于 /Applications/Codex.app/...，**PID 14225** 想要使用 Xcode 的工具来执行构建、测试或修改代码等操作。

[开发者社区反馈](https://github.com/openai/codex/issues/10741)：
- 弹窗**每 3 秒**出现一次，反复要求授权
- 仅仅为了查看警告和错误，就要**连续点击几十次**允许
- 因为 CLI 代理不断产生新进程（不同 PID），macOS **永远不会记住你的选择** — 也不会添加到自动化偏好设置中

### 根本原因

每次 AI 代理调用 `xcrun mcpbridge` 时，macOS 看到的是一个新进程（新 PID），于是触发新的 TCC 授权弹窗。没有办法永久允许。

### 解决方案

本工具在代理和 Xcode 之间放置一个持久化的 `mcp-proxy` 进程。代理通过 HTTP 与它通信，macOS 只需授权**一次**。

```
Agent ──HTTP──▶ mcp-proxy（持久进程，固定 PID）──stdio──▶ xcrun mcpbridge ──▶ Xcode
                    ▲
              只需允许一次
```

## 额外收益：节省 ~5K Tokens 上下文

MCP 工具定义（20 个工具 ~5K tokens）会加载到**每次对话**中，无论是否使用。将其封装为 [Claude Code Skill](https://docs.anthropic.com/en/docs/claude-code/skills) 后，上下文中仅保留 ~30 词的描述，完整工具文档按需加载。

## 前置条件

- **macOS** + **Xcode 26+**（自带 `xcrun mcpbridge`）
- **Node.js** 18+
- **[mcp-proxy](https://github.com/sparfenyuk/mcp-proxy)**（将 stdio MCP 桥接为 HTTP）
- **pm2**（可选，保持 mcp-proxy 常驻）

## 快速开始

### 1. 安装 mcp-proxy

```bash
pip install mcp-proxy
# 或
uv tool install mcp-proxy
```

### 2. 启动 MCP 代理

```bash
# 一次性运行
mcp-proxy --port 9876 -- xcrun mcpbridge

# 或用 pm2 保持运行（推荐）
pm2 start xcode-mcp-proxy.config.cjs
pm2 save
```

TCC 弹窗出现时点击"允许"，此后不再弹出。

### 3. 安装 xcode-cli

```bash
git clone https://github.com/nicklama/xcode-cli.git
cd xcode-cli
npm link
```

### 4. 验证

```bash
# 确保 Xcode 已打开项目
xcode-cli XcodeListWindows
xcode-cli BuildProject --tab-identifier windowtab1
```

## 使用方法

```bash
xcode-cli <ToolName> [--param value ...]
```

大多数命令需要 `--tab-identifier`，先获取：

```bash
xcode-cli XcodeListWindows
```

### 可用工具（20 个）

| 类别 | 工具 |
|------|------|
| **构建与诊断** | `BuildProject`, `GetBuildLog`, `XcodeRefreshCodeIssuesInFile`, `XcodeListNavigatorIssues` |
| **文件操作** | `XcodeRead`, `XcodeWrite`, `XcodeUpdate`, `XcodeRM`, `XcodeMV`, `XcodeMakeDir`, `XcodeLS` |
| **搜索** | `XcodeGrep`, `XcodeGlob`, `DocumentationSearch` |
| **测试** | `GetTestList`, `RunAllTests`, `RunSomeTests` |
| **预览与执行** | `RenderPreview`, `ExecuteSnippet` |
| **工作区** | `XcodeListWindows` |

### 示例

```bash
# 编译并检查错误
xcode-cli BuildProject --tab-identifier windowtab1
xcode-cli GetBuildLog --tab-identifier windowtab1 --severity error

# 单文件快速诊断（无需完整编译）
xcode-cli XcodeRefreshCodeIssuesInFile --tab-identifier windowtab1 \
  --file-path "MyApp/Sources/ContentView.swift"

# 渲染 SwiftUI 预览
xcode-cli RenderPreview --tab-identifier windowtab1 \
  --source-file-path "MyApp/Sources/Views/HomeView.swift"

# 搜索 Apple 文档
xcode-cli DocumentationSearch --query "SwiftUI NavigationStack"
```

完整参数：`xcode-cli --help`

## Claude Code 集成

### 作为 Skill（推荐）

```bash
mkdir -p ~/.claude/skills/xcode-mcp
cp SKILL.md ~/.claude/skills/xcode-mcp/SKILL.md
```

然后在 `~/.claude/.claude.json` 中禁用 MCP server，避免加载 20 个工具定义：

```json
{
  "projects": {
    "/path/to/your/project": {
      "disabledMcpServers": ["xcode-proxy"]
    }
  }
}
```

### 作为 MCP server（传统方式）

仍然受益于 TCC 修复：

```json
{
  "mcpServers": {
    "xcode-proxy": {
      "type": "http",
      "url": "http://localhost:9876/mcp"
    }
  }
}
```

## 工作原理

```
AI Agent ──bash──▶ xcode-cli ──HTTP──▶ mcp-proxy ──stdio──▶ xcrun mcpbridge ──▶ Xcode IDE
```

| 组件 | 职责 |
|------|------|
| `xcrun mcpbridge` | Xcode 内置 MCP server（stdio 传输） |
| `mcp-proxy` | stdio → HTTP 桥接（端口 9876）；解决 TCC 的持久进程 |
| `xcode-cli` | 由 [mcporter](https://github.com/steipete/mcporter) 生成的 CLI 封装，将命令行参数转为 MCP 工具调用 |

## 重新生成 CLI

当 Xcode 新增 MCP 工具时：

```bash
npx mcporter generate-cli \
  --command "http://localhost:9876/mcp" \
  --output bin/xcode-cli.ts \
  --bundle bin/xcode-cli \
  --runtime node
```

## License

MIT
