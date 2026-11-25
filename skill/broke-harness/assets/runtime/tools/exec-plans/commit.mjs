#!/usr/bin/env node

import { readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSafeRepoPath, getHeadRevision, runProcess } from '../harness/change-state.mjs';
import { parsePlanStatus } from '../harness/run.mjs';

const planCommitSubject = /^(?:feature|refactor|fix)\/[\p{L}\p{N}][\p{L}\p{N} .,():/_-]*$/u;

export function isPlanCommitSubject(subject) {
  return subject.length <= 120 && subject === subject.trim() && planCommitSubject.test(subject);
}

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), '..', '..');
const activeDirectory = 'docs/exec-plans/active';
const git = (...args) => runProcess('git', args, root);

async function ensureNoInProgressPlan() {
  const directory = await assertSafeRepoPath(root, activeDirectory);
  const entries = await readdir(directory, { withFileTypes: true }).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return [];
  });
  const rejectInProgress = (file, text) => {
    if (parsePlanStatus(text) === 'in-progress') {
      throw new Error(`Plan ${file} is in progress. Complete it through /start-plan before using /commit.`);
    }
  };
  for (const entry of entries) {
    if (!entry.isDirectory() && entry.name.endsWith('.md')) {
      const file = `${activeDirectory}/${entry.name}`;
      rejectInProgress(file, await readFile(await assertSafeRepoPath(root, file), 'utf8'));
    }
  }
  const indexed = await git('ls-files', '--cached', '-z', '--', activeDirectory);
  for (const file of indexed.stdout.split('\0')) {
    if (path.posix.dirname(file) === activeDirectory && file.endsWith('.md')) {
      rejectInProgress(file, (await git('cat-file', 'blob', `:${file}`)).stdout);
    }
  }
}

async function main(args) {
  const inspect = args.length === 1 && args[0] === '--inspect';
  const subject = args[1];
  if (!inspect && (args.length !== 2 || args[0] !== '--message' || !isPlanCommitSubject(subject))) {
    throw new Error('Use --inspect or --message "<feature|refactor|fix>/<concise summary>" (up to 120 characters).');
  }

  const gitRoot = (await git('rev-parse', '--show-toplevel')).stdout.trim();
  if (await realpath(gitRoot) !== await realpath(root)) {
    throw new Error('/commit requires the harness in the selected Git repository root.');
  }
  await getHeadRevision(root);
  await ensureNoInProgressPlan();

  const diff = ['diff', '--cached', '--no-ext-diff', '--no-textconv'];
  const staged = (await git(...diff, '--no-renames', '--name-only', '-z', '--')).stdout.split('\0').filter(Boolean);
  if (staged.length === 0) throw new Error('Nothing is staged to commit.');
  for (const file of staged) await assertSafeRepoPath(root, file, true);

  if (inspect) {
    process.stdout.write((await git(...diff, '--no-color', '--patch', '--')).stdout);
    return;
  }

  await git('commit', '-m', subject);
  process.stdout.write((await git('log', '-1', '--format=%H %s')).stdout);
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
