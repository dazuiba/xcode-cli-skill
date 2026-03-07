#!/usr/bin/env node
import { Command } from 'commander';
import { createRuntime, createServerProxy, describeConnectionIssue } from 'mcporter';
import type { CallResult } from 'mcporter';
import { printResult, unwrapResult } from './xcode-output.ts';
import { copyPreviewToOutput, findPreviewPath } from './xcode-preview.ts';
import { parseTestSpecifier, type ParsedTestSpecifier } from './xcode-test.ts';
import { renderLsTree } from './xcode-tree.ts';
import type { CommonOpts, ClientContext } from './xcode-types.ts';

const SERVER_NAME = 'xcode-tools';
const DEFAULT_PORT = '48321';
const DEFAULT_URL = `http://localhost:${DEFAULT_PORT}/mcp`;

const program = new Command();
program
  .name('xcode-cli')
  .description('Friendly Xcode MCP CLI for browsing, editing, building, and testing projects.')
  .option('--url <url>', `MCP endpoint (default: ${DEFAULT_URL})`)
  .option('--tab <tabIdentifier>', 'Default tab identifier for commands that need it')
  .option('-t, --timeout <ms>', 'Call timeout in milliseconds', '60000')
  .option('--json', 'Output JSON (shorthand for --output json)')
  .option('-o, --output <format>', 'text | json', parseOutputFormat, 'text');

program.addHelpText(
  'after',
  `
Tab selection:
  Commands that require tabIdentifier will use --tab (or XCODE_TAB_ID) when provided.
  If neither is provided and exactly one Xcode tab is open, that tabIdentifier is auto-selected.

Examples:
  # Discover tabIdentifier values
  xcode-cli windows

  # Build using a known Xcode tab identifier
  xcode-cli --tab <tabIdentifier> build

Setup & service management:
  Use xcode-cli-ctl to manage the bridge service and skills.
  xcode-cli-ctl install / start / stop / restart / status / logs
  xcode-cli-ctl skill install
`,
);

program
  .command('tools')
  .description('List all available Xcode MCP tools')
  .action(async () => {
    await withClient(async (ctx) => {
      const tools = await ctx.proxy.listTools({ includeSchema: false });
      if (ctx.output === 'json') {
        console.log(JSON.stringify(tools, null, 2));
        return;
      }
      for (const tool of tools) {
        console.log(`${tool.name}${tool.description ? ` - ${tool.description}` : ''}`);
      }
    });
  });

program
  .command('windows')
  .description('List Xcode windows/workspaces and tab identifiers')
  .action(async () => {
    await withClient(async (ctx) => {
      const result = await ctx.call('XcodeListWindows');
      printResult(result, ctx.output);
    });
  });

program
  .command('status')
  .description('Quick status: windows + issues for current tab')
  .option('--severity <severity>', 'error | warning | remark', 'error')
  .action(async (options: { severity: string }) => {
    await withClient(async (ctx) => {
      const windows = await ctx.call('XcodeListWindows');
      const tabId = await resolveTabIdentifier(ctx, true, windows);
      const issues = await ctx.call('XcodeListNavigatorIssues', {
        tabIdentifier: tabId,
        severity: options.severity,
      });

      if (ctx.output === 'json') {
        console.log(
          JSON.stringify(
            {
              tabIdentifier: tabId,
              windows: unwrapResult(windows),
              issues: unwrapResult(issues),
            },
            null,
            2,
          ),
        );
        return;
      }

      console.log(`tabIdentifier: ${tabId}`);
      console.log('');
      console.log('Windows');
      console.log('-------');
      printResult(windows, 'text');
      console.log('');
      console.log('Issues');
      console.log('------');
      printResult(issues, 'text');
    });
  });

program
  .command('issues')
  .description('List issues from Xcode Issue Navigator')
  .option('--glob <glob>', 'Filter issues by path glob')
  .option('--pattern <regex>', 'Filter issues by message regex')
  .option('--severity <severity>', 'error | warning | remark', 'error')
  .action(async (options: { glob?: string; pattern?: string; severity: string }) => {
    await withClient(async (ctx) => {
      const tabIdentifier = await resolveTabIdentifier(ctx, true);
      const result = await ctx.call('XcodeListNavigatorIssues', {
        tabIdentifier,
        severity: options.severity,
        glob: options.glob,
        pattern: options.pattern,
      });
      printResult(result, ctx.output);
    });
  });

program
  .command('file-issues <filePath>')
  .description('Refresh and list compiler diagnostics for a single file')
  .action(async (filePath: string) => {
    await withClient(async (ctx) => {
      const tabIdentifier = await resolveTabIdentifier(ctx, true);
      const result = await ctx.call('XcodeRefreshCodeIssuesInFile', {
        tabIdentifier,
        filePath,
      });
      printResult(result, ctx.output);
    });
  });

program
  .command('build')
  .description('Build current project in active scheme')
  .action(async () => {
    await withClient(async (ctx) => {
      const tabIdentifier = await resolveTabIdentifier(ctx, true);
      const result = await ctx.call('BuildProject', { tabIdentifier });
      printResult(result, ctx.output);
    });
  });

program
  .command('build-log')
  .description('Show current or most recent build log')
  .option('--glob <glob>', 'Filter log entries by file path glob')
  .option('--pattern <regex>', 'Filter log entries by message/console regex')
  .option('--severity <severity>', 'remark | warning | error', 'error')
  .action(async (options: { glob?: string; pattern?: string; severity: string }) => {
    await withClient(async (ctx) => {
      const tabIdentifier = await resolveTabIdentifier(ctx, true);
      const result = await ctx.call('GetBuildLog', {
        tabIdentifier,
        glob: options.glob,
        pattern: options.pattern,
        severity: options.severity,
      });
      printResult(result, ctx.output);
    });
  });

const tests = program.command('test').description('Run tests');

tests
  .command('all')
  .description('Run all tests from active test plan')
  .action(async () => {
    await withClient(async (ctx) => {
      const tabIdentifier = await resolveTabIdentifier(ctx, true);
      const result = await ctx.call('RunAllTests', { tabIdentifier });
      printResult(result, ctx.output);
    });
  });

tests
  .command('list')
  .description("List tests from the active scheme's active test plan")
  .action(async () => {
    await withClient(async (ctx) => {
      const tabIdentifier = await resolveTabIdentifier(ctx, true);
      const result = await ctx.call('GetTestList', { tabIdentifier });
      printResult(result, ctx.output);
    });
  });

tests
  .command('some <tests...>')
  .description('Run selected tests using target+identifier specifiers')
  .option('--target <targetName>', 'Default test target for identifier-only specs')
  .addHelpText(
    'after',
    `
Examples:
  xcode-cli test some "DashProxyTests::AccessKeyTests/testParseEndpointSimple()"
  xcode-cli test some "DashProxyTests/AccessKeyTests/testParseEndpointSimple()"
  xcode-cli test some --target DashProxyTests "AccessKeyTests#testParseEndpointSimple"
`,
  )
  .action(async (testsArg: string[], options: { target?: string }) => {
    await withClient(async (ctx) => {
      const tabIdentifier = await resolveTabIdentifier(ctx, true);
      const parsed = testsArg.map((value) => parseTestSpecifier(value, options.target));
      const tests = await resolveTestSpecifiers(parsed, ctx, tabIdentifier);
      const result = await ctx.call('RunSomeTests', { tabIdentifier, tests });
      printResult(result, ctx.output);
    });
  });

program
  .command('ls [path]')
  .description('List files/groups in Xcode project structure')
  .option('-r, --recursive', 'List recursively')
  .action(async (targetPath: string | undefined, options: { recursive?: boolean }) => {
    await withClient(async (ctx) => {
      const tabIdentifier = await resolveTabIdentifier(ctx, true);
      const result = await ctx.call('XcodeLS', {
        tabIdentifier,
        path: targetPath ?? '/',
        recursive: Boolean(options.recursive),
      });
      if (options.recursive && ctx.output !== 'json') {
        const value = unwrapResult(result);
        const tree = renderLsTree(value, targetPath ?? '/');
        if (tree) {
          console.log(tree);
          return;
        }
      }
      printResult(result, ctx.output);
    });
  });

program
  .command('glob [pattern]')
  .description('Find files by glob pattern in project structure')
  .option('--path <path>', 'Base project path', '/')
  .action(async (pattern: string | undefined, options: { path: string }) => {
    await withClient(async (ctx) => {
      const tabIdentifier = await resolveTabIdentifier(ctx, true);
      const result = await ctx.call('XcodeGlob', {
        tabIdentifier,
        path: options.path,
        pattern: pattern ?? '**/*',
      });
      printResult(result, ctx.output);
    });
  });

program
  .command('read <filePath>')
  .description('Read a file from Xcode project structure')
  .option('--offset <offset>', 'Line offset', '0')
  .option('--limit <limit>', 'Max lines', '300')
  .action(async (filePath: string, options: { offset: string; limit: string }) => {
    await withClient(async (ctx) => {
      const tabIdentifier = await resolveTabIdentifier(ctx, true);
      const result = await ctx.call('XcodeRead', {
        tabIdentifier,
        filePath,
        offset: Number(options.offset),
        limit: Number(options.limit),
      });
      printResult(result, ctx.output);
    });
  });

program
  .command('grep <pattern>')
  .description('Regex search across files in Xcode project structure')
  .option('--glob <glob>', 'File glob filter')
  .option('--head-limit <n>', 'Limit matches', '100')
  .option('-i, --ignore-case', 'Case-insensitive pattern')
  .action(async (pattern: string, options: { glob?: string; headLimit: string; ignoreCase?: boolean }) => {
    await withClient(async (ctx) => {
      const tabIdentifier = await resolveTabIdentifier(ctx, true);
      const result = await ctx.call('XcodeGrep', {
        tabIdentifier,
        pattern,
        glob: options.glob,
        headLimit: Number(options.headLimit),
        ignoreCase: Boolean(options.ignoreCase),
      });
      printResult(result, ctx.output);
    });
  });

program
  .command('write <filePath> <content>')
  .description('Create/overwrite file content in Xcode project structure')
  .action(async (filePath: string, content: string) => {
    await withClient(async (ctx) => {
      const tabIdentifier = await resolveTabIdentifier(ctx, true);
      const result = await ctx.call('XcodeWrite', { tabIdentifier, filePath, content });
      printResult(result, ctx.output);
    });
  });

program
  .command('update <filePath> <oldString> <newString>')
  .description('Replace text in a file')
  .option('--replace-all', 'Replace all occurrences')
  .action(
    async (
      filePath: string,
      oldString: string,
      newString: string,
      options: { replaceAll?: boolean },
    ) => {
      await withClient(async (ctx) => {
        const tabIdentifier = await resolveTabIdentifier(ctx, true);
        const result = await ctx.call('XcodeUpdate', {
          tabIdentifier,
          filePath,
          oldString,
          newString,
          replaceAll: Boolean(options.replaceAll),
        });
        printResult(result, ctx.output);
      });
    },
  );

program
  .command('mkdir <directoryPath>')
  .description('Create directory/group in Xcode project structure')
  .action(async (directoryPath: string) => {
    await withClient(async (ctx) => {
      const tabIdentifier = await resolveTabIdentifier(ctx, true);
      const result = await ctx.call('XcodeMakeDir', { tabIdentifier, directoryPath });
      printResult(result, ctx.output);
    });
  });

program
  .command('rm <targetPath>')
  .description('Remove file/directory from project; optionally filesystem too')
  .option('-r, --recursive', 'Recursive removal')
  .option('--delete-files', 'Delete underlying files on disk')
  .action(async (targetPath: string, options: { recursive?: boolean; deleteFiles?: boolean }) => {
    await withClient(async (ctx) => {
      const tabIdentifier = await resolveTabIdentifier(ctx, true);
      const result = await ctx.call('XcodeRM', {
        tabIdentifier,
        path: targetPath,
        recursive: Boolean(options.recursive),
        deleteFiles: Boolean(options.deleteFiles),
      });
      printResult(result, ctx.output);
    });
  });

program
  .command('mv <sourcePath> <destinationPath>')
  .description('Move/rename/copy files in project structure')
  .option('--copy', 'Copy instead of move')
  .option('--overwrite', 'Overwrite destination if it exists')
  .action(
    async (
      sourcePath: string,
      destinationPath: string,
      options: { copy?: boolean; overwrite?: boolean },
    ) => {
      await withClient(async (ctx) => {
        const tabIdentifier = await resolveTabIdentifier(ctx, true);
        const result = await ctx.call('XcodeMV', {
          tabIdentifier,
          sourcePath,
          destinationPath,
          operation: options.copy ? 'copy' : 'move',
          overwriteExisting: Boolean(options.overwrite),
        });
        printResult(result, ctx.output);
      });
    },
  );

program
  .command('preview <sourceFilePath>')
  .description('Render SwiftUI preview for a file')
  .option('--index <n>', 'Preview definition index', '0')
  .option('--render-timeout <seconds>', 'Render timeout seconds', '120')
  .option('--out <path>', 'Write preview image to this path (or directory)')
  .action(
    async (
      sourceFilePath: string,
      options: { index: string; renderTimeout: string; out?: string },
    ) => {
    await withClient(async (ctx) => {
      const tabIdentifier = await resolveTabIdentifier(ctx, true);
      const result = await ctx.call('RenderPreview', {
        tabIdentifier,
        sourceFilePath,
        previewDefinitionIndexInFile: Number(options.index),
        timeout: Number(options.renderTimeout),
      });

      const raw = unwrapResult(result);
      const sourceImagePath = findPreviewPath(raw);
      if (!sourceImagePath) {
        throw new Error(
          `Preview rendered, but no output file path was found in response: ${JSON.stringify(raw)}`,
        );
      }

      const outputPath = options.out
        ? await copyPreviewToOutput(sourceImagePath, options.out)
        : sourceImagePath;
      console.log(outputPath);
    });
    },
  );

program
  .command('snippet <sourceFilePath> <codeSnippet>')
  .description('Execute a Swift snippet in the context of a source file')
  .option('--exec-timeout <seconds>', 'Snippet execution timeout seconds', '120')
  .action(
    async (
      sourceFilePath: string,
      codeSnippet: string,
      options: { execTimeout: string },
    ) => {
      await withClient(async (ctx) => {
        const tabIdentifier = await resolveTabIdentifier(ctx, true);
        const result = await ctx.call('ExecuteSnippet', {
          tabIdentifier,
          sourceFilePath,
          codeSnippet,
          timeout: Number(options.execTimeout),
        });
        printResult(result, ctx.output);
      });
    },
  );

program
  .command('doc <query>')
  .description('Search Apple docs via MCP docs search')
  .option('--frameworks <list>', 'Comma-separated frameworks')
  .action(async (query: string, options: { frameworks?: string }) => {
    await withClient(async (ctx) => {
      const frameworks = options.frameworks
        ? options.frameworks
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
        : undefined;
      const result = await ctx.call('DocumentationSearch', { query, frameworks });
      printResult(result, ctx.output);
    });
  });

program
  .command('run <toolName>')
  .description('Run any MCP tool directly with JSON args')
  .requiredOption('--args <json>', 'JSON object with tool arguments')
  .action(async (toolName: string, options: { args: string }) => {
    await withClient(async (ctx) => {
      const parsed = JSON.parse(options.args) as Record<string, unknown>;
      const result = await ctx.call(toolName, parsed);
      printResult(result, ctx.output);
    });
  });

applyCommandOrder(program, [
  'status',
  'build',
  'build-log',
  'test',
  'issues',
  'file-issues',
  'windows',
  'read',
  'grep',
  'ls',
  'glob',
  'write',
  'update',
  'mv',
  'mkdir',
  'rm',
  'preview',
  'snippet',
  'doc',
  'tools',
  'run',
]);

program.parseAsync(process.argv).catch((error) => {
  const issue = describeConnectionIssue(error);
  if (issue.kind === 'http') {
    console.error(`HTTP error${issue.statusCode ? ` (${issue.statusCode})` : ''}: ${issue.rawMessage}`);
  } else if (issue.kind === 'timeout') {
    console.error(`Timeout: ${issue.rawMessage}`);
  } else if (issue.kind === 'auth') {
    console.error(`Auth error: ${issue.rawMessage}`);
  } else {
    console.error(issue.rawMessage || String(error));
  }
  process.exit(1);
});

async function withClient(handler: (ctx: ClientContext) => Promise<void>) {
  const root = program.opts<CommonOpts>();
  const endpoint = root.url ?? process.env.XCODE_CLI_URL ?? DEFAULT_URL;
  const timeoutMs = Number(root.timeout ?? '60000');
  const output = root.json ? 'json' : parseOutputFormat(root.output ?? 'text');

  const runtime = await createRuntime({
    servers: [
      {
        name: SERVER_NAME,
        description: 'xcode-tools',
        command: {
          kind: 'http',
          url: new URL(endpoint),
        },
      },
    ],
  });

  const proxy = createServerProxy(runtime, SERVER_NAME);
  const call = async (toolName: string, args?: Record<string, unknown>) =>
    proxy.call(toolName, { args, timeoutMs });

  try {
    await handler({
      proxy,
      output,
      timeoutMs,
      endpoint,
      tabOverride: root.tab ?? process.env.XCODE_TAB_ID,
      call,
    });
  } finally {
    await runtime.close().catch(() => undefined);
  }
}

async function resolveTabIdentifier(
  ctx: Pick<ClientContext, 'tabOverride' | 'call'>,
  autoDiscover: boolean,
  windowsResult?: CallResult,
): Promise<string> {
  if (ctx.tabOverride) {
    return ctx.tabOverride;
  }
  if (autoDiscover) {
    const windows = windowsResult ?? (await ctx.call('XcodeListWindows'));
    const discoveredTabIds = listTabIdentifiers(unwrapResult(windows));
    if (discoveredTabIds.length === 1) {
      return discoveredTabIds[0];
    }
  }
  throw new Error(
    'No tab identifier found. Use --tab <id> (or XCODE_TAB_ID) or run `xcode-cli windows`.',
  );
}

function listTabIdentifiers(value: unknown): string[] {
  const tabIds = new Set<string>();
  const queue: unknown[] = [value];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    if (typeof current === 'string') {
      collectTabIdentifiersFromText(current, tabIds);
      continue;
    }

    if (typeof current !== 'object') {
      continue;
    }

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    const record = current as Record<string, unknown>;
    for (const [key, entry] of Object.entries(record)) {
      if (key === 'tabIdentifier' && typeof entry === 'string' && entry.trim()) {
        tabIds.add(entry.trim());
      }
      if (typeof entry === 'string') {
        collectTabIdentifiersFromText(entry, tabIds);
      }
      if (entry && typeof entry === 'object') {
        queue.push(entry);
      }
      if (Array.isArray(entry)) {
        queue.push(...entry);
      }
    }
  }
  return [...tabIds];
}

function collectTabIdentifiersFromText(text: string, sink: Set<string>) {
  const regex = /tabIdentifier:\s*([^\s,]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const tabIdentifier = match[1]?.trim();
    if (tabIdentifier) {
      sink.add(tabIdentifier);
    }
  }
}

type NormalizedTestSpecifier = {
  targetName: string;
  testIdentifier: string;
};

type TestCatalogEntry = {
  targetName: string;
  identifier: string;
};

async function resolveTestSpecifiers(
  parsed: ParsedTestSpecifier[],
  ctx: Pick<ClientContext, 'call'>,
  tabIdentifier: string,
): Promise<NormalizedTestSpecifier[]> {
  if (parsed.every((entry) => Boolean(entry.targetName))) {
    return parsed.map((entry) => ({
      targetName: entry.targetName!.trim(),
      testIdentifier: entry.testIdentifier,
    }));
  }

  const listResult = await ctx.call('GetTestList', { tabIdentifier });
  const catalog = extractTestCatalog(unwrapResult(listResult));
  const availableTargets = [...new Set(catalog.map((entry) => entry.targetName))].sort();
  const byIdentifier = buildCatalogLookup(catalog);

  return parsed.map((entry) => {
    if (entry.targetName) {
      return {
        targetName: entry.targetName.trim(),
        testIdentifier: entry.testIdentifier,
      };
    }

    const candidates = resolveCatalogEntries(byIdentifier, entry.testIdentifier);
    if (candidates.length === 0) {
      const targetHint =
        availableTargets.length > 0
          ? ` Active scheme targets: ${availableTargets.join(', ')}.`
          : ' Active scheme has no discoverable test targets.';
      throw new Error(
        `Unable to resolve target for '${entry.source}'. Run 'xcode-cli --tab ${tabIdentifier} test list --json' and use 'Target::Identifier'.${targetHint} If this test belongs to another scheme, switch active scheme in Xcode first.`,
      );
    }

    const targetNames = [...new Set(candidates.map((candidate) => candidate.targetName))].sort();
    if (targetNames.length > 1) {
      throw new Error(
        `Ambiguous test specifier '${entry.source}'. Matching targets: ${targetNames.join(', ')}. Use 'Target::${entry.testIdentifier}'.`,
      );
    }

    return {
      targetName: targetNames[0],
      testIdentifier: candidates[0].identifier,
    };
  });
}

function extractTestCatalog(value: unknown): TestCatalogEntry[] {
  const entries: TestCatalogEntry[] = [];
  const queue: unknown[] = [value];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    if (typeof current !== 'object') {
      continue;
    }
    const record = current as Record<string, unknown>;
    const targetName = typeof record.targetName === 'string' ? record.targetName.trim() : '';
    const identifier = typeof record.identifier === 'string' ? record.identifier.trim() : '';
    if (targetName && identifier) {
      entries.push({ targetName, identifier });
    }
    for (const nested of Object.values(record)) {
      if (!nested) {
        continue;
      }
      if (Array.isArray(nested)) {
        queue.push(...nested);
      } else if (typeof nested === 'object') {
        queue.push(nested);
      }
    }
  }
  return entries;
}

function buildCatalogLookup(catalog: TestCatalogEntry[]): Map<string, TestCatalogEntry[]> {
  const lookup = new Map<string, TestCatalogEntry[]>();
  for (const entry of catalog) {
    for (const key of identifierLookupKeys(entry.identifier)) {
      const existing = lookup.get(key);
      if (existing) {
        existing.push(entry);
      } else {
        lookup.set(key, [entry]);
      }
    }
  }
  return lookup;
}

function resolveCatalogEntries(
  lookup: Map<string, TestCatalogEntry[]>,
  testIdentifier: string,
): TestCatalogEntry[] {
  const matches = new Map<string, TestCatalogEntry>();
  for (const key of identifierLookupKeys(testIdentifier)) {
    const entries = lookup.get(key);
    if (!entries) {
      continue;
    }
    for (const entry of entries) {
      matches.set(`${entry.targetName}::${entry.identifier}`, entry);
    }
  }
  return [...matches.values()];
}

function identifierLookupKeys(identifier: string): string[] {
  const trimmed = identifier.trim();
  if (!trimmed) {
    return [];
  }
  const keys = new Set<string>([trimmed]);
  if (trimmed.endsWith('()')) {
    keys.add(trimmed.slice(0, -2));
  } else if (!trimmed.endsWith(')')) {
    keys.add(`${trimmed}()`);
  }
  return [...keys];
}

function parseOutputFormat(value: string): CommonOpts['output'] {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'text' || normalized === 'json') {
    return normalized;
  }
  throw new Error(`Invalid output format '${value}'. Use 'text' or 'json'.`);
}

function applyCommandOrder(root: Command, names: string[]): void {
  const weights = new Map<string, number>(names.map((name, index) => [name, index]));
  root.commands.sort((a, b) => {
    const aWeight = weights.get(a.name()) ?? Number.MAX_SAFE_INTEGER;
    const bWeight = weights.get(b.name()) ?? Number.MAX_SAFE_INTEGER;
    if (aWeight !== bWeight) {
      return aWeight - bWeight;
    }
    return a.name().localeCompare(b.name());
  });
}
