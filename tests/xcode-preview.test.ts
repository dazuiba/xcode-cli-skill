import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { copyPreviewToOutput, findPreviewPath } from '../src/xcode-preview.ts';

test('findPreviewPath finds nested image path fields', () => {
  const payload = {
    result: {
      artifacts: [
        { note: 'ignore' },
        { previewSnapshotPath: '/tmp/preview.png' },
      ],
    },
  };

  assert.equal(findPreviewPath(payload), '/tmp/preview.png');
});

test('findPreviewPath returns undefined when no image path exists', () => {
  assert.equal(findPreviewPath({ data: { filePath: '/tmp/file.txt' } }), undefined);
});

test('copyPreviewToOutput writes to explicit file path', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xcode-cli-preview-file-'));
  const source = path.join(dir, 'source.png');
  const destination = path.join(dir, 'nested', 'custom-name.png');
  await fs.writeFile(source, 'image-data', 'utf8');

  const copied = await copyPreviewToOutput(source, destination);
  assert.equal(copied, destination);
  assert.equal(await fs.readFile(destination, 'utf8'), 'image-data');
});

test('copyPreviewToOutput treats extensionless output as directory-like', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xcode-cli-preview-dir-'));
  const source = path.join(dir, 'preview.png');
  await fs.writeFile(source, 'png-bytes', 'utf8');

  const copied = await copyPreviewToOutput(source, path.join(dir, 'out'));
  assert.equal(copied, path.join(dir, 'out', 'preview.png'));
  assert.equal(await fs.readFile(copied, 'utf8'), 'png-bytes');
});
