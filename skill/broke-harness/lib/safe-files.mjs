import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const hash = value => createHash('sha256').update(value).digest('hex');
export const json = value => JSON.stringify(value, null, 2) + '\n';
export function relativePath(value) {
  if (typeof value !== 'string' || !value || /[\x00-\x1f:*?"<>|\\]/.test(value) || path.posix.isAbsolute(value) || value.split('/').some(s => !s || s === '.' || s === '..' || /[. ]$/.test(s) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))) throw new Error(`Unsafe repository path: ${value}`);
  return value;
}
export function secretPath(value) {
  return value.split('/').some(s => /^(\.env(?:\..*)?|\.git|\.aws|\.ssh|\.gnupg|auth\.json|credentials(?:\..*)?|secrets?(?:\..*)?)$/i.test(s));
}
export async function safePath(root, name) {
  relativePath(name);
  let current = root;
  for (const segment of name.split('/')) {
    current = path.join(current, segment);
    try {
      const info = await lstat(current);
      if (info.isSymbolicLink()) throw new Error(`Symlink boundary refused: ${name}`);
      if (!info.isDirectory() && current !== path.join(root, name)) throw new Error(`Non-directory boundary: ${name}`);
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return path.join(root, name);
}
export async function readOptional(root, name) {
  if (secretPath(name)) throw new Error(`Secret read refused: ${name}`);
  try {
    const target = await safePath(root, name);
    const info = await lstat(target);
    if (!info.isFile() || info.size > 4 * 1024 * 1024) throw new Error(`Not a bounded regular file: ${name}`);
    return await readFile(target, 'utf8');
  } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}
export function git(root, args) {
  return execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
export async function repository(target) {
  const root = await realpath(target);
  const actual = await realpath(git(root, ['rev-parse', '--show-toplevel']).trim());
  if (root !== actual) throw new Error(`Select the Git root explicitly: ${actual}`);
  if (git(root, ['rev-parse', '--is-bare-repository']).trim() !== 'false') throw new Error('A working Git repository is required');
  return root;
}
