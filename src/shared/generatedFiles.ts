import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const RENAME_ATTEMPTS = 5;
const RENAME_RETRY_MS = 20;
const RETRIABLE_RENAME_ERRORS = new Set(['EPERM', 'EACCES', 'EBUSY']);

export async function writeFileIfChanged(file: string, content: string): Promise<boolean> {
  if ((await readTextIfExists(file)) === content) return false;
  await writeFileAtomically(file, content);
  return true;
}

export async function removeFileIfExists(file: string): Promise<boolean> {
  try {
    await rm(file);
    return true;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw error;
  }
}

export async function readTextIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (errorCode(error) === 'ENOENT' || errorCode(error) === 'ENOTDIR') return undefined;
    throw error;
  }
}

async function writeFileAtomically(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(temporary, content);
  try {
    await renameWithRetries(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    if (!RETRIABLE_RENAME_ERRORS.has(errorCode(error) ?? '')) throw error;
    await writeFile(file, content);
  }
}

async function renameWithRetries(from: string, to: string, attempt = 1): Promise<void> {
  try {
    await rename(from, to);
  } catch (error) {
    if (attempt >= RENAME_ATTEMPTS || !RETRIABLE_RENAME_ERRORS.has(errorCode(error) ?? '')) throw error;
    await delay(RENAME_RETRY_MS * attempt);
    await renameWithRetries(from, to, attempt + 1);
  }
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}
