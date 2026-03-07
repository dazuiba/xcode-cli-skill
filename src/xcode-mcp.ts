import http from 'node:http';
import { URL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  isInitializeRequest,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { parseTestSpecifier, type ParsedTestSpecifier } from './xcode-test.ts';

export type McpBridgeStartOptions = {
  host: string;
  port: number;
  path: string;
};

type TransportSession = {
  server: Server;
  transport: StreamableHTTPServerTransport;
};

const BRIDGE_NAME = 'xcode-cli-service';
const BRIDGE_VERSION = '1.0.0';

export async function startMcpBridge(options: McpBridgeStartOptions): Promise<void> {
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error(`Invalid port '${options.port}'. Use an integer between 1 and 65535.`);
  }

  const endpoint = new URL(`http://${options.host}:${options.port}${normalizePath(options.path)}`);
  const upstream = new Client(
    {
      name: BRIDGE_NAME,
      version: BRIDGE_VERSION,
    },
    {
      capabilities: {},
    },
  );
  const upstreamTransport = new StdioClientTransport({
    command: 'xcrun',
    args: ['mcpbridge'],
    env: buildEnv(),
    stderr: 'inherit',
  });

  upstream.onerror = (error) => {
    console.error(`Upstream stdio MCP error: ${error.message}`);
  };

  try {
    await upstream.connect(upstreamTransport);
  } catch (error) {
    await upstream.close().catch(() => undefined);
    await upstreamTransport.close().catch(() => undefined);
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        'Unable to connect to Xcode via `xcrun mcpbridge`.',
        'Check the following and try again:',
        '1) Xcode 26.3 or later is installed.',
        '2) Xcode is open.',
        '3) `xcode-select -p` points to your Xcode developer directory.',
        `Original error: ${details}`,
      ].join('\n'),
    );
  }

  const sessions = new Map<string, TransportSession>();
  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        res.statusCode = 400;
        res.end('Missing URL');
        return;
      }

      const requestUrl = new URL(req.url, endpoint);
      if (requestUrl.pathname === '/health') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ ok: true, endpoint: endpoint.toString() }));
        return;
      }

      if (requestUrl.pathname !== normalizePath(options.path)) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      const method = req.method?.toUpperCase() ?? '';
      const body = method === 'POST' ? await parseJsonBody(req) : undefined;
      const sessionIdHeader = req.headers['mcp-session-id'];
      const sessionId =
        typeof sessionIdHeader === 'string'
          ? sessionIdHeader
          : Array.isArray(sessionIdHeader)
            ? sessionIdHeader[0]
            : undefined;

      if (method === 'POST') {
        if (sessionId && sessions.has(sessionId)) {
          await sessions.get(sessionId)!.transport.handleRequest(req, res, body);
          return;
        }

        if (!sessionId && isInitializeRequest(body)) {
          let mcpServer: Server;
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (newSessionId) => {
              sessions.set(newSessionId, { server: mcpServer, transport });
            },
          });
          transport.onclose = () => {
            const closedSessionId = transport.sessionId;
            if (!closedSessionId) {
              return;
            }
            sessions.delete(closedSessionId);
          };

          mcpServer = createSessionServer(upstream);
          await mcpServer.connect(transport);
          await transport.handleRequest(req, res, body);
          return;
        }

        res.statusCode = 400;
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Bad Request: missing valid MCP session' },
            id: null,
          }),
        );
        return;
      }

      if (method === 'GET' || method === 'DELETE') {
        if (!sessionId || !sessions.has(sessionId)) {
          res.statusCode = 400;
          res.end('Invalid or missing MCP session ID');
          return;
        }
        await sessions.get(sessionId)!.transport.handleRequest(req, res);
        return;
      }

      res.statusCode = 405;
      res.end('Method not allowed');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message },
            id: null,
          }),
        );
      }
    }
  });

  const cleanup = async () => {
    for (const { server: sessionServer } of sessions.values()) {
      await sessionServer.close().catch(() => undefined);
    }
    sessions.clear();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await upstream.close().catch(() => undefined);
    await upstreamTransport.close().catch(() => undefined);
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      cleanup()
        .catch(() => undefined)
        .finally(() => {
          process.exit(0);
        });
    });
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, () => {
      console.error(`MCP bridge listening on ${endpoint.toString()}`);
      console.error('Upstream stdio: xcrun mcpbridge');
      resolve();
    });
  });
}

function createSessionServer(upstream: Client): Server {
  const server = new Server(
    {
      name: BRIDGE_NAME,
      version: BRIDGE_VERSION,
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    return await upstream.listTools(request.params);
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const params = await normalizeRunSomeTestsCall(request.params, upstream);
    return await upstream.callTool(params);
  });

  return server;
}

function normalizePath(value: string): string {
  if (!value.startsWith('/')) {
    return `/${value}`;
  }
  return value;
}

function buildEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') {
      env[key] = value;
    }
  }
  return env;
}

async function parseJsonBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return undefined;
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    return undefined;
  }
  return JSON.parse(raw);
}

type TestCatalogEntry = {
  targetName: string;
  identifier: string;
};

async function normalizeRunSomeTestsCall(
  params: Record<string, unknown>,
  upstream: Client,
): Promise<Record<string, unknown>> {
  if (params.name !== 'RunSomeTests') {
    return params;
  }
  if (!params.arguments || typeof params.arguments !== 'object' || Array.isArray(params.arguments)) {
    return params;
  }

  const argumentsRecord = params.arguments as Record<string, unknown>;
  const testsValue = argumentsRecord.tests;
  if (!Array.isArray(testsValue)) {
    return params;
  }

  const defaultTargetName = normalizeString(argumentsRecord.targetName);
  const parsed = testsValue.map((value) => parseBridgeTestSpecifier(value, defaultTargetName));
  const normalizedTests = await resolveBridgeTestSpecifiers(parsed, argumentsRecord, upstream);

  return {
    ...params,
    arguments: {
      ...argumentsRecord,
      tests: normalizedTests,
    },
  };
}

function parseBridgeTestSpecifier(
  value: unknown,
  defaultTargetName?: string,
): ParsedTestSpecifier {
  if (typeof value === 'string') {
    return parseTestSpecifier(value, defaultTargetName);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid RunSomeTests entry '${String(value)}'. Expected a string or object.`);
  }

  const record = value as Record<string, unknown>;
  const targetName = normalizeString(record.targetName) ?? defaultTargetName;
  const testIdentifier = normalizeString(record.testIdentifier);

  if (testIdentifier) {
    return {
      source: testIdentifier,
      targetName,
      testIdentifier,
    };
  }

  const shorthand = normalizeString(record.identifier) ?? normalizeString(record.test);
  if (shorthand) {
    return parseTestSpecifier(shorthand, targetName);
  }

  throw new Error('Invalid RunSomeTests entry. Missing testIdentifier/identifier/test field.');
}

async function resolveBridgeTestSpecifiers(
  parsed: ParsedTestSpecifier[],
  args: Record<string, unknown>,
  upstream: Client,
): Promise<Array<{ targetName: string; testIdentifier: string }>> {
  if (parsed.every((entry) => Boolean(entry.targetName))) {
    return parsed.map((entry) => ({
      targetName: entry.targetName!.trim(),
      testIdentifier: entry.testIdentifier,
    }));
  }

  const tabIdentifier = normalizeString(args.tabIdentifier);
  if (!tabIdentifier) {
    throw new Error(
      "RunSomeTests shorthand requires 'tabIdentifier' to resolve test target. Provide 'targetName' explicitly or use Target::Identifier.",
    );
  }

  const catalog = await fetchTestCatalog(upstream, tabIdentifier);
  const availableTargets = [...new Set(catalog.map((entry) => entry.targetName))].sort();
  const lookup = buildCatalogLookup(catalog);

  return parsed.map((entry) => {
    if (entry.targetName) {
      return {
        targetName: entry.targetName.trim(),
        testIdentifier: entry.testIdentifier,
      };
    }

    const matches = resolveCatalogEntries(lookup, entry.testIdentifier);
    if (matches.length === 0) {
      const targetHint =
        availableTargets.length > 0
          ? ` Active scheme targets: ${availableTargets.join(', ')}.`
          : ' Active scheme has no discoverable test targets.';
      throw new Error(
        `Unable to resolve target for '${entry.source}'. Use Target::Identifier or provide targetName.${targetHint} If this test belongs to another scheme, switch the active scheme in Xcode first.`,
      );
    }

    const targets = [...new Set(matches.map((match) => match.targetName))].sort();
    if (targets.length > 1) {
      throw new Error(
        `Ambiguous RunSomeTests shorthand '${entry.source}'. Matching targets: ${targets.join(', ')}. Use Target::Identifier.`,
      );
    }

    return {
      targetName: targets[0],
      testIdentifier: matches[0].identifier,
    };
  });
}

async function fetchTestCatalog(upstream: Client, tabIdentifier: string): Promise<TestCatalogEntry[]> {
  const response = await upstream.callTool({
    name: 'GetTestList',
    arguments: { tabIdentifier },
  });
  const value =
    (response as { structuredContent?: unknown }).structuredContent ?? response;
  return extractTestCatalog(value);
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
    const targetName = normalizeString(record.targetName);
    const identifier = normalizeString(record.identifier);
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

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
