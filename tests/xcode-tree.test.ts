import test from 'node:test';
import assert from 'node:assert/strict';
import { renderLsTree } from '../src/xcode-tree.ts';

test('renderLsTree returns null for non-object payload', () => {
  assert.equal(renderLsTree(null, '/'), null);
  assert.equal(renderLsTree('nope', '/'), null);
});

test('renderLsTree prints root label for empty items', () => {
  assert.equal(renderLsTree({ items: [] }, '/Root'), '/Root');
});

test('renderLsTree builds sorted tree and strips root prefix when present', () => {
  const tree = renderLsTree(
    {
      items: [
        'Project/Sources/B.swift',
        'Project/Sources/A.swift',
        'Project/Tests/AppTests.swift',
      ],
    },
    '/tmp/Project',
  );

  assert.equal(
    tree,
    [
      '/tmp/Project',
      '├── Sources',
      '│   ├── A.swift',
      '│   └── B.swift',
      '└── Tests',
      '    └── AppTests.swift',
    ].join('\n'),
  );
});
