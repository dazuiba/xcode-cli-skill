import test from 'node:test';
import assert from 'node:assert/strict';
import { printResult, unwrapResult } from '../src/xcode-output.ts';

type FakeCallResult = {
  structuredContent: () => unknown;
  json: () => unknown;
  raw: unknown;
};

function fakeResult(input: {
  structured?: unknown;
  json?: unknown;
  raw?: unknown;
}): FakeCallResult {
  return {
    structuredContent: () => input.structured,
    json: () => (input.json === undefined ? null : input.json),
    raw: input.raw,
  };
}

function withCapturedConsole(run: () => void): string[] {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(' '));
  };
  try {
    run();
  } finally {
    console.log = original;
  }
  return lines;
}

test('unwrapResult prefers structured content over json and raw', () => {
  const result = unwrapResult(
    fakeResult({ structured: { ok: true }, json: { ok: false }, raw: 'raw' }) as never,
  );
  assert.deepEqual(result, { ok: true });
});

test('unwrapResult falls back to json then raw', () => {
  const jsonResult = unwrapResult(fakeResult({ json: { x: 1 }, raw: 'raw' }) as never);
  assert.deepEqual(jsonResult, { x: 1 });

  const rawResult = unwrapResult(fakeResult({ raw: 'raw-only' }) as never);
  assert.equal(rawResult, 'raw-only');
});

test('printResult outputs pretty json for json mode', () => {
  const lines = withCapturedConsole(() => {
    printResult(fakeResult({ structured: { a: 1 } }) as never, 'json');
  });

  assert.equal(lines.length, 1);
  assert.equal(lines[0], JSON.stringify({ a: 1 }, null, 2));
});

test('printResult formats array output in text mode', () => {
  const lines = withCapturedConsole(() => {
    printResult(fakeResult({ structured: ['one', 'two'] }) as never, 'text');
  });

  assert.deepEqual(lines, ['- one\n- two']);
});

test('printResult formats build log payload in text mode', () => {
  const lines = withCapturedConsole(() => {
    printResult(
      fakeResult({
        structured: {
          buildResult: 'Build failed',
          buildIsRunning: false,
          buildLogEntries: [
            {
              buildTask: 'Compile Swift Sources',
              emittedIssues: [
                {
                  severity: 'error',
                  path: 'App/Main.swift',
                  line: 12,
                  message: 'Cannot find type',
                },
              ],
            },
          ],
        },
      }) as never,
      'text',
    );
  });

  assert.equal(lines.length, 1);
  assert.match(lines[0], /Build failed/);
  assert.match(lines[0], /Compile Swift Sources/);
  assert.match(lines[0], /\[error\] App\/Main.swift:12/);
});

test('printResult formats documentation payload with detailed fields in text mode', () => {
  const lines = withCapturedConsole(() => {
    printResult(
      fakeResult({
        structured: {
          query: 'NavigationStack',
          frameworks: ['SwiftUI'],
          documents: [
            {
              title: 'NavigationStack',
              path: '/documentation/swiftui/navigationstack',
              role: 'symbol',
              summary: 'A view that displays a root view and enables navigation.',
              fragments: [
                { kind: 'paragraph', text: 'Use this to push destinations.' },
              ],
            },
          ],
        },
      }) as never,
      'text',
    );
  });

  assert.equal(lines.length, 1);
  assert.match(lines[0], /query: NavigationStack/);
  assert.match(lines[0], /frameworks:/);
  assert.match(lines[0], /\[1\] NavigationStack/);
  assert.match(lines[0], /fragments:/);
  assert.match(lines[0], /kind: paragraph/);
});
