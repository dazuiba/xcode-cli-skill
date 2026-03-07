import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const DEFAULT_SERVICE_PORT = 48321;

const LAUNCHD_LABEL = 'com.xcode-cli.bridge';
const PLIST_FILENAME = `${LAUNCHD_LABEL}.plist`;
const LAUNCH_AGENTS_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const PLIST_PATH = path.join(LAUNCH_AGENTS_DIR, PLIST_FILENAME);
const LOG_DIR = path.join(os.homedir(), 'Library', 'Logs');
const STDOUT_LOG = path.join(LOG_DIR, 'xcode-cli.stdout.log');
const STDERR_LOG = path.join(LOG_DIR, 'xcode-cli.stderr.log');

export type ServiceStatus = {
  installed: boolean;
  running: boolean;
  pid?: number;
  healthy?: boolean;
  endpoint?: string;
};

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function generatePlist(binaryPath: string, port: number): string {
  const envPath = process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin';
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"',
    '  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key>`,
    `  <string>${escapeXml(LAUNCHD_LABEL)}</string>`,
    `  <key>ProgramArguments</key>`,
    `  <array>`,
    `    <string>${escapeXml(binaryPath)}</string>`,
    `    <string>run</string>`,
    `    <string>--port</string>`,
    `    <string>${port}</string>`,
    `  </array>`,
    `  <key>RunAtLoad</key>`,
    `  <true/>`,
    `  <key>StandardOutPath</key>`,
    `  <string>${escapeXml(STDOUT_LOG)}</string>`,
    `  <key>StandardErrorPath</key>`,
    `  <string>${escapeXml(STDERR_LOG)}</string>`,
    `  <key>EnvironmentVariables</key>`,
    `  <dict>`,
    `    <key>PATH</key>`,
    `    <string>${escapeXml(envPath)}</string>`,
    `  </dict>`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

function exec(command: string, args: string[], ignoreErrors = false): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error && !ignoreErrors) {
        reject(new Error(`${command} ${args.join(' ')} failed: ${stderr || error.message}`));
      } else {
        resolve(stdout);
      }
    });
  });
}

function uid(): string {
  return String(process.getuid?.() ?? 501);
}

async function resolveCtlBinaryPath(): Promise<string> {
  const argv1 = process.argv[1];
  if (argv1) {
    const root = path.resolve(path.dirname(argv1), '..');
    const candidate = path.join(root, 'bin', 'xcode-cli-ctl');
    try {
      await fs.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // fall through
    }
  }

  try {
    const result = (await exec('which', ['xcode-cli-ctl'])).trim();
    if (result) return result;
  } catch {
    // fall through
  }

  throw new Error(
    'Cannot resolve xcode-cli-ctl binary path. Ensure xcode-cli is installed globally.',
  );
}

export async function killPortOccupant(port: number): Promise<boolean> {
  let lsofOutput: string;
  try {
    lsofOutput = (await exec('lsof', ['-ti', `:${port}`], true)).trim();
  } catch {
    return false;
  }
  if (!lsofOutput) return false;

  const pids = lsofOutput.split('\n').map((s) => s.trim()).filter(Boolean);
  for (const pid of pids) {
    // Only kill if it's our own process
    try {
      const psOutput = await exec('ps', ['-p', pid, '-o', 'command='], true);
      if (psOutput.includes('xcode-cli') || psOutput.includes('xcode.ts') || psOutput.includes('xcode-ctl')) {
        await exec('kill', [pid], true);
      } else {
        throw new Error(
          `Port ${port} is occupied by another process (pid ${pid}). Cannot start bridge.`,
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('occupied by another')) {
        throw error;
      }
      // ps/kill failed, ignore
    }
  }
  return true;
}

export async function installService(options: { port?: number } = {}): Promise<void> {
  const port = options.port ?? DEFAULT_SERVICE_PORT;
  const binaryPath = await resolveCtlBinaryPath();

  await fs.mkdir(LAUNCH_AGENTS_DIR, { recursive: true });

  // Unload existing if present
  try {
    await fs.access(PLIST_PATH);
    await exec('launchctl', ['bootout', `gui/${uid()}`, PLIST_PATH], true);
  } catch {
    // not installed yet
  }

  const plist = generatePlist(binaryPath, port);
  await fs.writeFile(PLIST_PATH, plist, 'utf8');

  // bootstrap loads and starts (RunAtLoad=true)
  await exec('launchctl', ['bootstrap', `gui/${uid()}`, PLIST_PATH]);

  console.log(`Installed launchd service: ${LAUNCHD_LABEL}`);
  console.log(`Plist: ${PLIST_PATH}`);
  console.log(`Bridge: http://127.0.0.1:${port}/mcp`);
  console.log(`Logs:  ${STDERR_LOG}`);
}

export async function uninstallService(): Promise<void> {
  try {
    await fs.access(PLIST_PATH);
  } catch {
    console.log('Service is not installed.');
    return;
  }

  await exec('launchctl', ['bootout', `gui/${uid()}`, PLIST_PATH], true);
  await fs.unlink(PLIST_PATH);
  console.log(`Removed launchd service: ${LAUNCHD_LABEL}`);
}

export async function startService(): Promise<void> {
  try {
    await fs.access(PLIST_PATH);
  } catch {
    throw new Error('Service is not installed. Run: xcode-cli-ctl install');
  }

  await exec('launchctl', ['bootstrap', `gui/${uid()}`, PLIST_PATH], true);
  console.log(`Started service: ${LAUNCHD_LABEL}`);
}

export async function stopService(): Promise<void> {
  try {
    await fs.access(PLIST_PATH);
  } catch {
    console.log('Service is not installed.');
    return;
  }

  await exec('launchctl', ['bootout', `gui/${uid()}`, PLIST_PATH], true);
  console.log(`Stopped service: ${LAUNCHD_LABEL}`);
}

export async function restartService(): Promise<void> {
  try {
    await fs.access(PLIST_PATH);
  } catch {
    throw new Error('Service is not installed. Run: xcode-cli-ctl install');
  }

  await exec('launchctl', ['bootout', `gui/${uid()}`, PLIST_PATH], true);
  await exec('launchctl', ['bootstrap', `gui/${uid()}`, PLIST_PATH]);
  console.log(`Restarted service: ${LAUNCHD_LABEL}`);
}

export async function getServiceStatus(port = DEFAULT_SERVICE_PORT): Promise<ServiceStatus> {
  let installed = false;
  try {
    await fs.access(PLIST_PATH);
    installed = true;
  } catch {
    // not installed
  }

  let running = false;
  let pid: number | undefined;
  if (installed) {
    try {
      const output = await exec(
        'launchctl',
        ['print', `gui/${uid()}/${LAUNCHD_LABEL}`],
        true,
      );
      if (output.includes('state = running')) {
        running = true;
      }
      const pidMatch = output.match(/pid\s*=\s*(\d+)/);
      if (pidMatch) {
        pid = Number(pidMatch[1]);
        running = true;
      }
    } catch {
      // not loaded
    }
  }

  let healthy: boolean | undefined;
  const endpoint = `http://127.0.0.1:${port}/health`;
  try {
    const res = await fetch(endpoint);
    healthy = res.ok;
  } catch {
    healthy = false;
  }

  return { installed, running, pid, healthy, endpoint: `http://127.0.0.1:${port}/mcp` };
}

export async function printServiceStatus(port = DEFAULT_SERVICE_PORT): Promise<void> {
  const status = await getServiceStatus(port);

  if (!status.installed) {
    console.log('Service: not installed');
    console.log(`Run: xcode-cli-ctl install`);
    return;
  }

  console.log(`Service: ${status.running ? 'running' : 'stopped'}${status.pid ? ` (pid ${status.pid})` : ''}`);
  console.log(`Healthy: ${status.healthy ? 'yes' : 'no'}`);
  console.log(`Endpoint: ${status.endpoint}`);
  console.log(`Plist: ${PLIST_PATH}`);
  console.log(`Logs: ${STDERR_LOG}`);
}

export function tailLogs(options: { lines?: number; follow?: boolean } = {}): void {
  const lines = String(options.lines ?? 50);
  const args = ['-n', lines];
  if (options.follow) args.push('-f');
  args.push(STDOUT_LOG, STDERR_LOG);

  const child = spawn('tail', args, { stdio: 'inherit' });
  child.on('error', (err) => {
    console.error(`Failed to tail logs: ${err.message}`);
  });
}
