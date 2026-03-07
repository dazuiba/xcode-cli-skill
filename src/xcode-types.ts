import type { CallResult } from 'mcporter';

export type CommonOpts = {
  url?: string;
  tab?: string;
  timeout?: string;
  output?: 'text' | 'json';
  json?: boolean;
};

export type IssueEntry = {
  path?: string;
  message: string;
  severity?: string;
  line?: number;
  column?: number;
};

export type ClientContext = {
  proxy: {
    listTools: (args: { includeSchema: boolean }) => Promise<Array<{ name: string; description?: string }>>;
  };
  output: CommonOpts['output'];
  timeoutMs: number;
  endpoint: string;
  tabOverride?: string;
  call: (toolName: string, args?: Record<string, unknown>) => Promise<CallResult>;
};
