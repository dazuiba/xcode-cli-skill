# xcode-cli-skill

[English](./README.md)

对 [Xcode 26.3+ 官方 MCP 工具](https://developer.apple.com/xcode/mcp/) 的 CLI + Skill 封装：通过常驻的本地 bridge 服务，避免每次调用都反复弹出「允许访问 Xcode」，同时提供面向 Claude Code / Codex 的 `xcode-cli` Skill，让 Xcode 工作流按需加载，而不是把整套原始 MCP 用法塞进每次对话里。

| 问题 | 这个仓库提供什么 |
|------|------------------|
| AI 代理调用 Xcode MCP 时反复弹出「允许访问 Xcode」 | 由 `xcode-cli-ctl` 管理的常驻本地 bridge 服务，让代理始终连接同一个稳定端点，而不是每次都起新的 bridge 进程 |
| Xcode MCP 功能很多，但通常不该把原始 MCP 直接作为默认接入方式 | 打包好的 `xcode-cli` Skill，让代理按需加载 Xcode 工作流；raw MCP 只是手动备用方案 |

## 详细说明

### 问题一：权限弹窗

<img src="alert.jpg" width="360" alt="macOS 权限弹窗：允许 Codex 访问 Xcode？">

AI 代理（Claude Code、Codex、Cursor）调用 Xcode 26.3 MCP 工具时，macOS 可能会反复弹出「允许访问 Xcode」。如果桥接进程不断变化，系统就不会把它当成同一个长期集成来处理。

### 根本原因

Xcode MCP bridge 的授权是和进程形态绑定的。如果每次调用都经过新的短生命周期进程，日常使用时就更容易遇到重复授权弹窗。

### 解决方案

本仓库在 `xcrun mcpbridge` 前面提供一个常驻的本地 bridge 服务。终端和 agent 都只需要连到这个稳定的 HTTP 端点，后台服务由 `xcode-cli-ctl` 负责安装和管理。

```text
Agent / CLI ──HTTP──▶ 本地 bridge 服务 ──▶ xcrun mcpbridge ──▶ Xcode
                         ▲
                由 xcode-cli-ctl 管理
```

### 问题二：不要把原始 MCP 塞进每个对话

Raw MCP 直连仍然可用，但这不是推荐默认路径。对 Claude Code 和 Codex 来说，这个仓库的主要卖点仍然是打包好的 `xcode-cli` Skill：只有在真正需要 Xcode 的时候，才按需加载这套工作流。

## 前置条件

- **macOS** + **Xcode 26.3+**
- **Node.js** 18+
- 需要编译、测试、预览或查看诊断时，先在 Xcode 中打开目标项目或工作区

## 快速开始

```bash
# 1. 通过 npm 安装
npm install -g xcode-cli

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

### Claude Code（Skill 方式）

为 Claude Code 安装打包好的 skill，让它按需调用 `xcode-cli`：

```bash
xcode-cli-ctl skill install --claude
```

如果不传 `--claude` / `--codex`，默认会同时安装到两个 agent。

### Codex（Skill 方式）

为 Codex 安装打包好的 skill：

```bash
xcode-cli-ctl skill install --codex
```

或者同时安装到两个 agent：

```bash
xcode-cli-ctl skill install
```

### MCP Server 方式（不推荐）

如果你确实想直接接 raw MCP，而不是走 skill-first 的方式，可以手动把本地 bridge 注册进去：

```bash
# Claude Code
claude mcp add --transport http xcode http://localhost:48321/mcp

# Codex
codex mcp add xcode --url http://localhost:48321/mcp
```

> **注意：** 这是手动备用方式，不是本仓库的推荐主路径。本仓库主打的仍然是基于 skill 的使用方式。

### 常用 `xcode-cli` 命令

```bash
xcode-cli windows
xcode-cli status
xcode-cli build
xcode-cli build-log --severity error
xcode-cli test list
xcode-cli test all
xcode-cli test some --target MyTests "FeatureTests#testExample"
xcode-cli file-issues "Sources/App.swift"
xcode-cli preview "Sources/MyView.swift" --out ./preview-out
xcode-cli doc "SwiftUI NavigationStack" --frameworks SwiftUI
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

## 工作原理

```text
AI Agent ──skill / bash──▶ xcode-cli ──HTTP──▶ 本地 bridge 服务 ──▶ xcrun mcpbridge ──▶ Xcode IDE
```

| 组件 | 职责 |
|------|------|
| `xcrun mcpbridge` | Xcode 内置 MCP bridge |
| 本地 bridge 服务 | 由 `xcode-cli-ctl` 管理、监听 `48321` 端口的常驻 HTTP bridge |
| `xcode-cli` | 面向日常 Xcode MCP 工作流的友好 CLI |
| `xcode-cli` Skill | Claude Code / Codex 的推荐接入方式 |

## License

MIT
