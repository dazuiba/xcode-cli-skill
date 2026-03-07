#!/usr/bin/env node
import { Command } from 'commander';
import {
  DEFAULT_SERVICE_PORT,
  installService,
  uninstallService,
  startService,
  stopService,
  restartService,
  printServiceStatus,
  tailLogs,
  killPortOccupant,
} from './xcode-service.ts';
import { startMcpBridge } from './xcode-mcp.ts';
import { installSkill, uninstallSkill } from './xcode-skill.ts';
import os from 'node:os';
import path from 'node:path';

const program = new Command();
program
  .name('xcode-cli-ctl')
  .description('Setup and manage the xcode-cli MCP bridge service.');

program
  .command('install')
  .description('Install and start bridge as a macOS launchd service')
  .option('--port <port>', 'Bridge port', String(DEFAULT_SERVICE_PORT))
  .action(async (options: { port: string }) => {
    await installService({ port: Number(options.port) });
  });

program
  .command('uninstall')
  .description('Stop and remove bridge launchd service')
  .action(async () => {
    await uninstallService();
  });

program
  .command('start')
  .description('Start the installed bridge service')
  .action(async () => {
    await startService();
  });

program
  .command('stop')
  .description('Stop the bridge service')
  .action(async () => {
    await stopService();
  });

program
  .command('restart')
  .description('Restart the bridge service')
  .action(async () => {
    await restartService();
  });

program
  .command('status')
  .description('Show bridge service status and health')
  .option('--port <port>', 'Bridge port for health check', String(DEFAULT_SERVICE_PORT))
  .action(async (options: { port: string }) => {
    await printServiceStatus(Number(options.port));
  });

program
  .command('logs')
  .description('Show bridge service logs')
  .option('-n, --lines <n>', 'Number of lines', '50')
  .option('-f, --follow', 'Follow log output')
  .action((options: { lines: string; follow?: boolean }) => {
    tailLogs({ lines: Number(options.lines), follow: options.follow });
  });

program
  .command('run')
  .description('Run the MCP bridge in the foreground (for debugging or launchd)')
  .option('--host <host>', 'Bind host', '127.0.0.1')
  .option('--port <port>', 'Bind port', String(DEFAULT_SERVICE_PORT))
  .option('--path <path>', 'MCP endpoint path', '/mcp')
  .action(async (options: { host: string; port: string; path: string }) => {
    const port = Number(options.port);
    await killPortOccupant(port);
    await startMcpBridge({
      host: options.host,
      port,
      path: options.path,
    });
  });

// ── skill ────────────────────────────────────────────────────────────

const skill = program.command('skill').description('Manage xcode-cli skill for agents');

skill
  .command('install')
  .description('Install xcode-cli skill (default: both Claude and Codex)')
  .option('--claude', 'Install to ~/.claude/skills only')
  .option('--codex', 'Install to ~/.codex/skills only')
  .option('--skill-root-dir <path>', 'Install to a custom skills directory')
  .action(async (options: { claude?: boolean; codex?: boolean; skillRootDir?: string }) => {
    const dirs = resolveSkillDirs(options);
    for (const dir of dirs) {
      await installSkill(dir);
    }
  });

skill
  .command('uninstall')
  .description('Uninstall xcode-cli skill (default: both Claude and Codex)')
  .option('--claude', 'Uninstall from ~/.claude/skills only')
  .option('--codex', 'Uninstall from ~/.codex/skills only')
  .option('--skill-root-dir <path>', 'Uninstall from a custom skills directory')
  .action(async (options: { claude?: boolean; codex?: boolean; skillRootDir?: string }) => {
    const dirs = resolveSkillDirs(options);
    for (const dir of dirs) {
      await uninstallSkill(dir);
    }
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

function resolveSkillDirs(options: { claude?: boolean; codex?: boolean; skillRootDir?: string }): string[] {
  if (options.skillRootDir) {
    return [options.skillRootDir];
  }
  const home = os.homedir();
  const claude = path.join(home, '.claude', 'skills');
  const codex = path.join(home, '.codex', 'skills');
  if (options.claude) return [claude];
  if (options.codex) return [codex];
  return [claude, codex];
}
