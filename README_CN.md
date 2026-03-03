# xcode-cli

[English](./README.md)

对 [Xcode 26.3+ 官方 MCP 工具](https://developer.apple.com/xcode/mcp/) 的 CLI + Skill 封装：持久化 `mcp-proxy` 让「允许访问 Xcode」弹窗**每次开机只弹一次**，同时每次对话节省 **~5K tokens** 上下文。

| 痛点 | 解法 |
|------|------|
| AI 代理调用 Xcode MCP 时权限弹窗反复弹出，无法记住授权 | 持久化 `mcp-proxy` 进程，macOS 只授权一次 |
| MCP 工具定义（20 个 ~5K tokens）占用每次对话上下文 | 封装为 Claude Code Skill，按需加载 |

## 详细说明

### 问题一：权限弹窗

<img src="alert.jpg" width="360" alt="macOS 权限弹窗：允许 Codex 访问 Xcode？">

使用 AI 代理（Claude Code、Codex、Cursor）调用 Xcode 26.3 MCP 工具时，macOS「允许访问 Xcode」弹窗每隔数秒反复弹出，且因 CLI 进程 PID 不断变化而[永远无法记住授权](https://github.com/openai/codex/issues/10741)。

### 根本原因

每次 AI 代理调用 `xcrun mcpbridge` 时，macOS 看到的是一个新进程（新 PID），于是触发新的授权弹窗。没有办法永久允许。

### 解决方案

本工具在代理和 Xcode 之间放置一个持久化的 `mcp-proxy` 进程。代理通过 HTTP 与它通信，macOS 只需授权**一次**。

```
Agent ──HTTP──▶ mcp-proxy（持久进程，固定 PID）──stdio──▶ xcrun mcpbridge ──▶ Xcode
                    ▲
              只需允许一次
```

### 问题二：节省 ~5K Tokens 上下文

MCP 工具定义（20 个工具 ~5K tokens）会加载到**每次对话**中，无论是否使用。将其封装为 [Claude Code Skill](https://docs.anthropic.com/en/docs/claude-code/skills) 后，上下文中仅保留 ~30 词的描述，完整工具文档按需加载。

## 前置条件

- **macOS** + **Xcode 26.3+**（自带 `xcrun mcpbridge`）
- **Node.js** 18+
- **[mcp-proxy](https://github.com/sparfenyuk/mcp-proxy)**（将 stdio MCP 桥接为 HTTP）
- **pm2**（保持 mcp-proxy 常驻）

## 快速开始

```bash
# 1. 安装依赖
uv tool install mcp-proxy   # 或: pip install mcp-proxy
npm install -g pm2

# 2. 克隆并安装 CLI
git clone https://github.com/dazuiba/xcode-cli-skill.git
cd xcode-cli-skill
npm link

# 3. 启动持久化代理
pm2 start xcode-mcp-proxy.config.cjs
pm2 save
```

弹窗出现时点击「允许」，此后不再弹出。

### 验证

```bash
# 确保 Xcode 已打开项目
xcode-cli XcodeListWindows
xcode-cli BuildProject --tab-identifier windowtab1
```

## AI 代理集成

### Claude Code（Skill 方式）

安装 skill，让 Claude Code 知道如何使用 `xcode-cli`：

```bash
mkdir -p ~/.claude/skills/xcode-cli
cp skills/xcode-cli/SKILL.md ~/.claude/skills/xcode-cli/SKILL.md
```

重启 Claude Code，skill 将以 `/xcode-cli` 形式可用。

### Codex（Skill 方式）

与 Claude Code 安装方式相同：

```bash
mkdir -p ~/.codex/skills/xcode-cli
cp skills/xcode-cli/SKILL.md ~/.codex/skills/xcode-cli/SKILL.md
```

### MCP Server 方式（不推荐）

Claude Code 和 Codex 均支持直接将代理注册为 MCP server：

```bash
# Claude Code
claude mcp add --transport http xcode-mcp http://localhost:9876/mcp

# Codex
codex mcp add --url http://localhost:9876/mcp xcode-mcp
```

> **注意：** 此方式会将全部 20 个工具定义加载到每次对话，无法享受每次对话节省 **~5K tokens** 上下文的优势，因此不推荐。

## 工作原理

```
AI Agent ──bash──▶ xcode-cli ──HTTP──▶ mcp-proxy ──stdio──▶ xcrun mcpbridge ──▶ Xcode IDE
```

| 组件 | 职责 |
|------|------|
| `xcrun mcpbridge` | Xcode 内置 MCP server（stdio 传输） |
| `mcp-proxy` | stdio → HTTP 桥接（端口 9876）；消除权限弹窗的持久进程 |
| `xcode-cli` | 由 [mcporter](https://github.com/steipete/mcporter) 生成的 CLI 封装，将命令行参数转为 MCP 工具调用 |

## License

MIT
