# xcode-cli-skill

[中文文档](./README_CN.md)

CLI + Skill wrapper for the [official Xcode 26.3+ MCP tools](https://developer.apple.com/xcode/mcp/):  a long-lived `xcode-cli-service` so the "Allow access to Xcode?" popup stops showing up on every call, plus a Claude Code Skill that saves **~5 K tokens** of context per conversation.

| Pain point | Solution |
|------------|----------|
| AI agents get a "Allow access to Xcode?" popup on every Xcode MCP call, and it never remembers | A persistent `mcp-proxy` process — macOS only asks once |
| MCP tool definitions (20 tools, ~5K tokens) load into every conversation | Wrapped as a Claude Code Skill — loads on-demand |

## Details

### Problem 1: Permission Popup Spam

<img src="alert.jpg" width="360" alt="macOS permission dialog: Allow Codex to access Xcode?">

When AI agents (Claude Code, Codex, Cursor) call Xcode 26.3 MCP tools, macOS can keep popping up "Allow access to Xcode?" every few seconds. If the bridge process keeps changing, macOS does not treat it as the same long-lived integration.

### Root Cause

The Xcode MCP bridge is process-bound. If every call goes through a fresh short-lived process, you get repeated permission prompts and a worse day-to-day workflow.

### The Fix

This repo runs a persistent local bridge service in front of `xcrun mcpbridge`. The agent or terminal CLI talks to that stable HTTP endpoint, while `xcode-cli-ctl` manages the background service for you.

```text
Agent / CLI ──HTTP──▶ local bridge service ──▶ xcrun mcpbridge ──▶ Xcode
                           ▲
                  managed by xcode-cli-ctl
```

### Problem 2: Keep MCP Out of Every Conversation by Default

Raw MCP server integration is available, but it is not the recommended default. For Claude Code and Codex, this repo is primarily about the packaged `xcode-cli` Skill: let the agent load the workflow when it actually needs Xcode, instead of wiring raw MCP tools into every session.

## Prerequisites

- **macOS** with **Xcode 26.3+**
- **Node.js** 18+
- Xcode open with the target project/workspace when you want to build, test, preview, or inspect issues

## Quick Start

```bash
# 1. Install from npm
npm install -g xcode-cli

# 2. Install and start the local bridge service
xcode-cli-ctl install

# 3. Check service health
xcode-cli-ctl status

# 4. Install the packaged skill
xcode-cli-ctl skill install
```

Click "Allow" when macOS asks for Xcode permission.

### Verify

```bash
# Make sure Xcode is open with a project
xcode-cli windows
xcode-cli build
```

## AI Agent Integration

use skill, you can saves **~5 K tokens** of context per conversation.

### Skill Installation (better)


```bash
xcode-cli-ctl skill install --claude
xcode-cli-ctl skill install --codex
# Install to both Claude Code and Codex
xcode-cli-ctl skill install

# Or copy manually
cp skills/xcode-cli/SKILL.md ~/.claude/skills/xcode-cli/SKILL.md
```

### MCP Server

```bash
# Claude Code
claude mcp add --transport http xcode http://localhost:48321/mcp

# Codex
codex mcp add xcode --url http://localhost:48321/mcp
```
### Available Tools (20) provided by Xcode 26.3+

| Category | Tools |
|----------|-------|
| **Build & Diagnostics** | `BuildProject`, `GetBuildLog`, `XcodeRefreshCodeIssuesInFile`, `XcodeListNavigatorIssues` |
| **File Operations** | `XcodeRead`, `XcodeWrite`, `XcodeUpdate`, `XcodeRM`, `XcodeMV`, `XcodeMakeDir`, `XcodeLS` |
| **Search** | `XcodeGrep`, `XcodeGlob`, `DocumentationSearch` |
| **Testing** | `GetTestList`, `RunAllTests`, `RunSomeTests` |
| **Preview & Execution** | `RenderPreview`, `ExecuteSnippet` |
| **Workspace** | `XcodeListWindows` |

## Component List
 

|  | Role |
|-----------|------|
| `xcrun mcpbridge` | Xcode's built-in MCP bridge |
| `xcode-cli-service` | Persistent HTTP bridge on port `48321`, managed by `xcode-cli-ctl` — solves the repeated permission popup |
| `xcode-cli` | CLI for Xcode MCP workflows, used by the Skill and directly from the terminal |
| [`SKILL.md`](skills/xcode-cli/SKILL.md) | Recommended integration for Claude Code / Codex, installed via `xcode-cli-ctl skill install` |
| `xcode-cli-ctl` | Manages service lifecycle and Skill installation |

## License

MIT
