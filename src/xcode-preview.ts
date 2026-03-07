import { promises as fs } from 'node:fs';
import path from 'node:path';

export function findPreviewPath(value: unknown): string | undefined {
  const queue: unknown[] = [value];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') {
      continue;
    }
    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }
    const record = current as Record<string, unknown>;
    for (const [key, entry] of Object.entries(record)) {
      if (
        typeof entry === 'string' &&
        (key.toLowerCase().includes('path') || key.toLowerCase().includes('file')) &&
        /\.(png|jpg|jpeg|heic|gif|webp)$/i.test(entry)
      ) {
        return entry;
      }
      if (entry && typeof entry === 'object') {
        queue.push(entry);
      }
      if (Array.isArray(entry)) {
        queue.push(...entry);
      }
    }
  }
  return undefined;
}

export async function copyPreviewToOutput(sourceImagePath: string, outputArg: string): Promise<string> {
  const candidate = path.resolve(process.cwd(), outputArg);
  let destination = candidate;
  try {
    const stat = await fs.stat(candidate);
    if (stat.isDirectory()) {
      destination = path.join(candidate, path.basename(sourceImagePath));
    }
  } catch {
    const looksLikeDirectory =
      outputArg.endsWith(path.sep) ||
      outputArg.endsWith('/') ||
      path.extname(path.basename(outputArg)) === '';
    if (looksLikeDirectory) {
      destination = path.join(candidate, path.basename(sourceImagePath));
    }
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(sourceImagePath, destination);
  return destination;
}
