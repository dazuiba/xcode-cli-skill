# xcode-cli-skill

[中文文档](./README_CN.md)

CLI + Skill wrapper for the [official Xcode 26.3+ MCP tools](https://developer.apple.com/xcode/mcp/): a persistent local bridge service so the "Allow access to Xcode?" popup stops showing up on every call, plus a Claude Code / Codex Skill that keeps the full Xcode MCP tool surface out of every conversation by default.

| Problem | What this repo gives you |
|---------|--------------------------|
| AI agents get a "Allow access to Xcode?" popup over and over when talking to Xcode MCP | A long-lived local bridge service managed by `xcode-cli-ctl`, so the agent talks to one stable endpoint instead of spawning a fresh bridge every time |
| Xcode MCP tools are powerful, but you usually do not want all of them loaded into every conversation | A packaged `xcode-cli` Skill, so agents can load the workflow on demand instead of treating raw MCP as the default path |

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

### Claude Code (Skill)

Install the packaged skill so Claude Code can use `xcode-cli` as an on-demand workflow:

```bash
xcode-cli-ctl skill install --claude
```

If you omit `--claude` / `--codex`, the skill installs to both by default.

### Codex (Skill)

Install the packaged skill for Codex:

```bash
xcode-cli-ctl skill install --codex
```

Or install to both agents at once:

```bash
xcode-cli-ctl skill install
```

### MCP Server (not recommended)

If you really want raw MCP wiring instead of the skill-first workflow, add the local bridge manually:

```bash
# Claude Code
claude mcp add --transport http xcode http://localhost:48321/mcp

# Codex
codex mcp add xcode --url http://localhost:48321/mcp
```

> **Note:** This is available as a manual fallback, but the main point of this repo is the skill-based workflow, not raw MCP as the default integration path.

### Common `xcode-cli` Commands

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

### Available Tools (20) provided by Xcode 26.3+

| Category | Tools |
|----------|-------|
| **Build & Diagnostics** | `BuildProject`, `GetBuildLog`, `XcodeRefreshCodeIssuesInFile`, `XcodeListNavigatorIssues` |
| **File Operations** | `XcodeRead`, `XcodeWrite`, `XcodeUpdate`, `XcodeRM`, `XcodeMV`, `XcodeMakeDir`, `XcodeLS` |
| **Search** | `XcodeGrep`, `XcodeGlob`, `DocumentationSearch` |
| **Testing** | `GetTestList`, `RunAllTests`, `RunSomeTests` |
| **Preview & Execution** | `RenderPreview`, `ExecuteSnippet` |
| **Workspace** | `XcodeListWindows` |

## How It Works

```text
AI Agent ──skill / bash──▶ xcode-cli ──HTTP──▶ local bridge service ──▶ xcrun mcpbridge ──▶ Xcode IDE
```

| Component | Role |
|-----------|------|
| `xcrun mcpbridge` | Xcode's built-in MCP bridge |
| local bridge service | Persistent HTTP bridge managed via `xcode-cli-ctl` on port `48321` |
| `xcode-cli` | Friendly CLI surface for Xcode MCP workflows |
| `xcode-cli` Skill | The recommended integration path for Claude Code / Codex |

## License

MIT
