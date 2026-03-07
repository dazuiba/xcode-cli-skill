import path from 'node:path';

type TreeNode = {
  children: Map<string, TreeNode>;
};

export function renderLsTree(value: unknown, rootLabel: string): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.items)) {
    return null;
  }
  const items = record.items.filter((item): item is string => typeof item === 'string');
  if (items.length === 0) {
    return rootLabel;
  }

  const rootName = path.basename(rootLabel.replace(/\/+$/, ''));
  const parsed = items
    .map((fullPath) => fullPath.replace(/\/+$/, '').split('/').filter(Boolean))
    .filter((parts) => parts.length > 0);
  const stripFirst =
    rootName.length > 0 && parsed.every((parts) => parts.length > 0 && parts[0] === rootName);

  const roots = new Map<string, TreeNode>();
  for (const partsRaw of parsed) {
    const parts = stripFirst ? partsRaw.slice(1) : partsRaw;
    if (parts.length === 0) {
      continue;
    }
    let current = roots;
    for (const part of parts) {
      if (!current.has(part)) {
        current.set(part, { children: new Map() });
      }
      current = current.get(part)!.children;
    }
  }

  const lines: string[] = [rootLabel];
  appendTreeLines(roots, '', lines);
  return lines.join('\n');
}

function appendTreeLines(nodes: Map<string, TreeNode>, prefix: string, lines: string[]) {
  const names = [...nodes.keys()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  names.forEach((name, index) => {
    const isLast = index === names.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    lines.push(`${prefix}${connector}${name}`);
    const childPrefix = `${prefix}${isLast ? '    ' : '│   '}`;
    const child = nodes.get(name);
    if (child && child.children.size > 0) {
      appendTreeLines(child.children, childPrefix, lines);
    }
  });
}
