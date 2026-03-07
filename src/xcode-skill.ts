import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR_NAME = 'xcode-cli';
const SKILL_FILENAME = 'SKILL.md';

function getSkillSourcePath(): string {
  const thisFile = fileURLToPath(import.meta.url);
  const packageRoot = path.resolve(path.dirname(thisFile), '..');
  return path.join(packageRoot, 'skills', SKILL_DIR_NAME, SKILL_FILENAME);
}

export async function installSkill(rootDir: string): Promise<void> {
  const source = getSkillSourcePath();
  try {
    await fs.access(source);
  } catch {
    throw new Error(`Skill source not found at ${source}`);
  }

  const targetDir = path.join(rootDir, SKILL_DIR_NAME);
  const targetFile = path.join(targetDir, SKILL_FILENAME);

  await fs.mkdir(targetDir, { recursive: true });
  await fs.copyFile(source, targetFile);
  console.log(`Installed skill: ${targetFile}`);
}

export async function uninstallSkill(rootDir: string): Promise<void> {
  const targetDir = path.join(rootDir, SKILL_DIR_NAME);
  const targetFile = path.join(targetDir, SKILL_FILENAME);

  try {
    await fs.access(targetFile);
  } catch {
    console.log(`Skill not found at ${targetFile}`);
    return;
  }

  await fs.unlink(targetFile);
  // Remove directory if empty
  try {
    const entries = await fs.readdir(targetDir);
    if (entries.length === 0) {
      await fs.rmdir(targetDir);
    }
  } catch {
    // ignore
  }
  console.log(`Removed skill: ${targetFile}`);
}
