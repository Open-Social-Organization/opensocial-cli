import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function copyDirectory(from: string, to: string): Promise<void> {
  await cp(from, to, { recursive: true });
}

export async function ensureTextContains(path: string, content: string): Promise<void> {
  const current = (await fileExists(path)) ? await readFile(path, 'utf8') : '';
  if (!current.includes(content)) {
    await writeFile(path, `${current}${current && !current.endsWith('\n') ? '\n' : ''}${content}`, 'utf8');
  }
}
