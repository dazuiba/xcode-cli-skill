import type { IssueEntry } from './xcode-types.ts';

export function extractIssues(value: unknown): IssueEntry[] {
  const issues: IssueEntry[] = [];
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
    const message = firstString(record, ['message', 'diagnostic', 'title', 'text']);
    const pathValue = firstString(record, ['path', 'filePath', 'file', 'sourceFilePath']);
    const severity = firstString(record, ['severity', 'level', 'kind']);
    const line = firstNumber(record, ['line', 'lineNumber', 'startLine']);
    const column = firstNumber(record, ['column', 'col', 'startColumn']);

    if (message && (pathValue || severity || line || column)) {
      issues.push({
        path: pathValue,
        message,
        severity: severity?.toLowerCase(),
        line,
        column,
      });
    }

    for (const nested of Object.values(record)) {
      if (nested && typeof nested === 'object') {
        queue.push(nested);
      }
      if (Array.isArray(nested)) {
        queue.push(...nested);
      }
    }
  }

  return dedupeIssues(issues);
}

export function summarizeIssues(issues: IssueEntry[]): Record<string, number> {
  const summary = { total: issues.length, error: 0, warning: 0, remark: 0, unknown: 0 };
  for (const issue of issues) {
    const severity = issue.severity ?? 'unknown';
    if (severity.includes('error')) {
      summary.error += 1;
    } else if (severity.includes('warning')) {
      summary.warning += 1;
    } else if (severity.includes('remark') || severity.includes('note')) {
      summary.remark += 1;
    } else {
      summary.unknown += 1;
    }
  }
  return summary;
}

export function summarizeBuildLog(value: unknown): Record<string, unknown> {
  const text = stringifyValue(value).toLowerCase();
  const inProgress =
    text.includes('in progress') || text.includes('"inprogress":true') || text.includes('building');
  const hasErrors = text.includes(' error') || text.includes('"error"');
  const hasWarnings = text.includes(' warning') || text.includes('"warning"');
  return { inProgress, hasErrors, hasWarnings };
}

export function summarizeTestList(value: unknown): Record<string, unknown> {
  const tests = collectStringsByKeys(value, ['testIdentifier', 'identifier', 'name']);
  const uniqueCount = new Set(tests).size;
  return {
    discovered: uniqueCount,
    hasTests: uniqueCount > 0,
  };
}

function dedupeIssues(issues: IssueEntry[]): IssueEntry[] {
  const seen = new Set<string>();
  const result: IssueEntry[] = [];
  for (const issue of issues) {
    const key = `${issue.path ?? '<unknown>'}|${issue.severity ?? 'unknown'}|${issue.line ?? 0}|${issue.column ?? 0}|${issue.message}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(issue);
  }
  return result;
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

function collectStringsByKeys(value: unknown, keys: string[]): string[] {
  const found: string[] = [];
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
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        found.push(candidate);
      }
    }
    for (const nested of Object.values(record)) {
      if (nested && typeof nested === 'object') {
        queue.push(nested);
      }
      if (Array.isArray(nested)) {
        queue.push(...nested);
      }
    }
  }
  return found;
}

function stringifyValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
