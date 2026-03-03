# xcode-cli

[中文文档](./README_CN.md)

CLI wrapper for [Xcode MCP tools](https://developer.apple.com/xcode/mcp/) — build, diagnose, test, and preview Xcode projects from your terminal, without the TCC permission popup nightmare.

## The Problem

<img src="alert.jpg" width="360" alt="macOS TCC permission dialog: Allow Codex to access Xcode?">

If you use AI agents (Claude Code, Codex, Cursor...) with Xcode 26's MCP tools, you've hit this macOS permission loop:

> **Allow "Codex" to access Xcode?**
> The agent at /Applications/Codex.app/..., **PID 14225** wants to use Xcode's tools to perform actions like building, testing, or modifying code.

As [frustrated developers report](https://github.com/openai/codex/issues/10741):
- The dialog pops up **every 3 seconds**, asking permission again and again
- You're **repeatedly asked 10s of times** just to read warnings and errors
- Because CLI agents spawn new processes with different PIDs, macOS **never remembers your choice** — it's not added to Automation preferences either

### Root Cause

Each time an AI agent calls `xcrun mcpbridge`, macOS sees a fresh process (new PID) and triggers a new TCC consent dialog. There's no way to permanently allow it.

### The Fix

This tool interposes a persistent `mcp-proxy` process between the agent and Xcode. The proxy holds a **long-lived connection** to `xcrun mcpbridge`, so macOS only asks for permission **once**. The agent talks to the proxy over HTTP — no new PIDs, no more popups.

```
Agent ──HTTP──▶ mcp-proxy (persistent, single PID) ──stdio──▶ xcrun mcpbridge ──▶ Xcode
                    ▲
              Allow once, done forever
```

## Bonus: Save ~5K Tokens of Context

MCP tool definitions (~5K tokens for 20 tools) load into **every conversation**, whether you use them or not. By wrapping them as a [Claude Code Skill](https://docs.anthropic.com/en/docs/claude-code/skills), only a ~30-word description stays in context — full tool docs load on-demand.

## Prerequisites

- **macOS** with **Xcode 26+** (ships `xcrun mcpbridge`)
- **Node.js** 18+
- **[mcp-proxy](https://github.com/sparfenyuk/mcp-proxy)** (bridges stdio MCP to HTTP)
- **pm2** (optional, keeps mcp-proxy alive)

## Quick Start

### 1. Install mcp-proxy

```bash
pip install mcp-proxy
# or
uv tool install mcp-proxy
```

### 2. Start the MCP proxy

```bash
# One-off
mcp-proxy --port 9876 -- xcrun mcpbridge

# Or use pm2 to keep it running (recommended)
pm2 start xcode-mcp-proxy.config.cjs
pm2 save
```

Click "Allow" once when the TCC dialog appears. That's it — never again.

### 3. Install xcode-cli

```bash
git clone https://github.com/nicklama/xcode-cli.git
cd xcode-cli
npm link
```

### 4. Verify

```bash
# Make sure Xcode is open with a project
xcode-cli XcodeListWindows
xcode-cli BuildProject --tab-identifier windowtab1
```

## Usage

```bash
xcode-cli <ToolName> [--param value ...]
```

Most commands need `--tab-identifier`. Get it first:

```bash
xcode-cli XcodeListWindows
```

### Available Tools (20)

| Category | Tools |
|----------|-------|
| **Build & Diagnostics** | `BuildProject`, `GetBuildLog`, `XcodeRefreshCodeIssuesInFile`, `XcodeListNavigatorIssues` |
| **File Operations** | `XcodeRead`, `XcodeWrite`, `XcodeUpdate`, `XcodeRM`, `XcodeMV`, `XcodeMakeDir`, `XcodeLS` |
| **Search** | `XcodeGrep`, `XcodeGlob`, `DocumentationSearch` |
| **Testing** | `GetTestList`, `RunAllTests`, `RunSomeTests` |
| **Preview & Execution** | `RenderPreview`, `ExecuteSnippet` |
| **Workspace** | `XcodeListWindows` |

### Examples

```bash
# Build and check errors
xcode-cli BuildProject --tab-identifier windowtab1
xcode-cli GetBuildLog --tab-identifier windowtab1 --severity error

# Quick single-file diagnostics (no full build)
xcode-cli XcodeRefreshCodeIssuesInFile --tab-identifier windowtab1 \
  --file-path "MyApp/Sources/ContentView.swift"

# Render SwiftUI preview
xcode-cli RenderPreview --tab-identifier windowtab1 \
  --source-file-path "MyApp/Sources/Views/HomeView.swift"

# Search Apple docs
xcode-cli DocumentationSearch --query "SwiftUI NavigationStack"

# Run all tests
xcode-cli RunAllTests --tab-identifier windowtab1
```

Run `xcode-cli --help` for the full command list.

## Claude Code Integration

### As a Skill (recommended)

Copy the provided `SKILL.md` to your Claude Code skills directory:

```bash
mkdir -p ~/.claude/skills/xcode-mcp
cp SKILL.md ~/.claude/skills/xcode-mcp/SKILL.md
```

Then disable the MCP server in `~/.claude/.claude.json` to stop loading 20 tool definitions:

```json
{
  "projects": {
    "/path/to/your/project": {
      "disabledMcpServers": ["xcode-proxy"]
    }
  }
}
```

### As MCP server (traditional)

If you prefer the MCP approach (still benefits from the TCC fix):

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

## How It Works

```
AI Agent ──bash──▶ xcode-cli ──HTTP──▶ mcp-proxy ──stdio──▶ xcrun mcpbridge ──▶ Xcode IDE
```

| Component | Role |
|-----------|------|
| `xcrun mcpbridge` | Xcode's built-in MCP server (stdio transport) |
| `mcp-proxy` | Bridges stdio → HTTP on port 9876; the persistent process that solves TCC |
| `xcode-cli` | CLI wrapper generated by [mcporter](https://github.com/steipete/mcporter), converts CLI args → MCP tool calls |

## Regenerating the CLI

When Xcode adds new MCP tools:

```bash
npx mcporter generate-cli \
  --command "http://localhost:9876/mcp" \
  --output bin/xcode-cli.ts \
  --bundle bin/xcode-cli \
  --runtime node
```

## License

MIT
