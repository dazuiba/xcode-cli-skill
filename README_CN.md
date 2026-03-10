# xcode-cli-skill

[English](./README.md)

对 [Xcode 26.3+ 官方 MCP 工具](https://developer.apple.com/xcode/mcp/) 的 CLI + Skill 封装：通过常驻的本地 bridge 服务，避免每次调用都反复弹出「允许访问 Xcode」，同时提供 Claude Code Skill，每次对话节省约 **~5 K tokens** 的上下文。

| 痛点 | 方案 |
|------|------|
| AI 代理每次调用 Xcode MCP 都弹出「允许访问 Xcode」，且不会记住授权 | 常驻 `xcode-cli-service` 进程 — macOS 只需授权一次 |
| MCP 工具定义（20 个工具，~5 K tokens）会加载到每次对话中 | 封装为 Claude Code Skill — 按需加载 |

## 详细说明

### 问题一：权限弹窗

<img src="alert.jpg" width="360" alt="macOS 权限弹窗：允许 Codex 访问 Xcode？">

AI 代理（Claude Code、Codex、Cursor）调用 Xcode 26.3 MCP 工具时，macOS 可能会反复弹出「允许访问 Xcode」。原因是每个session都是新进程，所以xcode 授权系统无法记住的设置

### 解决方案

提供一个常驻的本地 bridge 服务`xcode-cli-service`。终端和 agent 都只需要连到这个稳定的 HTTP 端点，此服务由 `xcode-cli-ctl` 负责安装和管理。

这样一来, 只需要在 `xcode-cli-service` 启动时 做一次授权即可. 每次macos 重启,只需授权一次.


```text
Agent / CLI ──HTTP──▶ 本地 bridge 服务 ──▶ xcrun mcpbridge ──▶ Xcode
                         ▲
                由 xcode-cli-ctl 管理
```


## 前置条件

- **macOS** + **Xcode 26.3+**
- 需要编译、测试、预览或查看诊断时，先在 Xcode 中打开目标项目或工作区
- **Node.js** 18+

## 快速开始

```bash
# 1. 通过 npm 安装
npm install -g xcode-cli@latest

安装后会新增下面两个命令:
`xcode-cli` 负责和 xcode交互
`xcode-cli-ctrl` 负责 服务的安装

# 2. 安装并启动本地 bridge 服务
xcode-cli-ctl install

# 3. 检查服务状态
xcode-cli-ctl status

# 4. 安装打包好的 skill
xcode-cli-ctl skill install
```

如果 macOS 弹出访问 Xcode 的授权提示，点击允许即可。

### 验证

```bash
# 确保 Xcode 已打开项目
xcode-cli windows
xcode-cli build
```

## AI 代理集成

### Skill 安装
相比 mcp, 可节省 5k的 context
```bash
xcode-cli-ctl skill install --claude
xcode-cli-ctl skill install --codex
# 同时安装到 Claude Code 和 Codex
xcode-cli-ctl skill install

# 或者手工复制
cp skills/xcode-cli/SKILL.md ~/.claude/skills/xcode-cli/SKILL.md
```

### MCP Server 方式

使用下面转发的 mcp, 而不是`xcrun mcpbridge`, 能帮你有效地解决反复弹窗的问题

```bash
# Claude Code
claude mcp add --transport http xcode http://localhost:48321/mcp

# Codex
codex mcp add xcode --url http://localhost:48321/mcp
```
### Xcode 26.3+ 提供的 20 个工具

| 类别 | 工具 |
|------|------|
| **构建与诊断** | `BuildProject`, `GetBuildLog`, `XcodeRefreshCodeIssuesInFile`, `XcodeListNavigatorIssues` |
| **文件操作** | `XcodeRead`, `XcodeWrite`, `XcodeUpdate`, `XcodeRM`, `XcodeMV`, `XcodeMakeDir`, `XcodeLS` |
| **搜索** | `XcodeGrep`, `XcodeGlob`, `DocumentationSearch` |
| **测试** | `GetTestList`, `RunAllTests`, `RunSomeTests` |
| **预览与执行** | `RenderPreview`, `ExecuteSnippet` |
| **工作区** | `XcodeListWindows` |

## 组件列表

|  | 职责 |
|------|------|
| `xcrun mcpbridge` | Xcode 26.3 内置 MCP bridge |
| `xcode-cli-service` | 由 `xcode-cli-ctl` 管理、监听 `48321` 端口的常驻 HTTP bridge，解决反复授权弹框问题 |
| `xcode-cli` | 面向 Xcode MCP 工作流的 CLI，供 Skill 和终端直接使用 |
| [`SKILL.md`](skills/xcode-cli/SKILL.md) | Claude Code / Codex 的推荐接入方式，通过 `xcode-cli-ctl skill install` 安装 |
| `xcode-cli-ctl` | 管理服务启停、Skill 安装 |

## License

MIT
