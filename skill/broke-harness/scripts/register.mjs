import { readdir, readFile, mkdir, writeFile, unlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hash, json, readOptional, safePath } from '../lib/safe-files.mjs';
import { argumentsFor, cli } from '../lib/cli.mjs';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function collect(directory, prefix, files) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isSymbolicLink()) throw new Error('Symlinks in the distributable are refused');
    const name = prefix + item.name;
    if (item.isDirectory()) await collect(path.join(directory, item.name), name + '/', files);
    else if (/\.(?:md|mjs|js|json|jsonc|yaml)$/.test(name)) files.set(name, await readFile(path.join(directory, item.name), 'utf8'));
  }
}

export async function registrationPreview(target, runtime = 'portable') {
  if (!['portable','opencode'].includes(runtime)) throw new Error('Choose portable or opencode registration');
  const root = path.resolve(target);
  // Validate all existing ancestors, including the selected registration root.
  const volume = path.parse(root).root;
  await safePath(volume, path.relative(volume, root).split(path.sep).join('/'));
  const sourceRoot = await realpath(source);
  if (root === sourceRoot || root.startsWith(sourceRoot + path.sep)) throw new Error('Registration destination must be outside the distributable skill');
  const bundle = new Map();
  await collect(source, '', bundle);
  const files = new Map([...bundle].map(([name, content]) => [`skills/broke-harness/${name}`, content]));
  if (runtime === 'opencode') {
    const skillPath = path.join(root, 'skills/broke-harness/SKILL.md').split(path.sep).join('/');
    files.set('commands/broke_harness.md', `---\ndescription: Initialize, update, or activate the project harness commands\n---\n\nRead the skill at ${JSON.stringify(skillPath)} and follow it for the following broke_harness arguments. With no arguments, activate session shorthand.\n\n$ARGUMENTS\n`);
  }
  const operations = [];
  for (const [name, content] of [...files].sort(([a],[b]) => a.localeCompare(b))) {
    const before = await readOptional(root, name);
    operations.push({ path: name, action: before === content ? 'skip' : before === null ? 'create' : 'conflict', beforeHash: before === null ? null : hash(before), afterHash: hash(content), content });
  }
  const result = { root, runtime, operations, conflicts: operations.filter(o => o.action === 'conflict').map(o => o.path) };
  return { ...result, approval: hash(json(result)) };
}

export async function register(target, approval, runtime = 'portable') {
  const preview = await registrationPreview(target, runtime);
  if (preview.approval !== approval) throw new Error('Registration approval does not match the current preview');
  if (preview.conflicts.length) throw new Error(`Registration conflicts: ${preview.conflicts.join(', ')}`);
  const created = [];
  try {
    for (const op of preview.operations) {
      if (op.action === 'skip') continue;
      const file = await safePath(preview.root, op.path);
      await mkdir(path.dirname(file), { recursive: true });
      await safePath(preview.root, op.path);
      await writeFile(file, op.content, { flag: 'wx', encoding: 'utf8' });
      created.push(op.path);
    }
  } catch (error) {
    for (const name of created.reverse()) await unlink(await safePath(preview.root, name));
    throw error;
  }
  return { runtime, root: preview.root, created, command: runtime === 'opencode' ? '/broke_harness' : 'broke_harness (broke-harness skill)', restartRequired: true };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await cli(async () => {
  const args = argumentsFor(process.argv.slice(2), ['--target','--runtime','--dry-run','--approve']);
  if (!args['--target']) throw new Error('Usage: node register.mjs --target <agent-config-folder> [--runtime portable|opencode] --dry-run | --approve <preview-hash>');
  const runtime = args['--runtime'] ?? 'portable';
  if (args['--dry-run']) console.log(json(await registrationPreview(args['--target'], runtime)));
  else {
    if (!args['--approve']) throw new Error('Review --dry-run first, then supply --approve <preview.approval>');
    console.log(json(await register(args['--target'], args['--approve'], runtime)));
  }
});
