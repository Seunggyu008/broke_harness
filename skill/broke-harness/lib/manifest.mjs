import { mkdir, writeFile, unlink, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { inspect } from './profile.mjs';
import { render } from './render.mjs';
import { resolveConfiguration } from './configuration.mjs';
import { hash, json, readOptional, safePath, parseJSONC } from './safe-files.mjs';

function diff(file, before, after) {
  if (before === after) return '';
  return `--- a/${file}\n+++ b/${file}\n@@ -1,${before?.split('\n').length ?? 0} +1,${after.split('\n').length} @@\n` + (before === null ? '' : before.split('\n').map(l => '-' + l).join('\n') + '\n') + after.split('\n').map(l => '+' + l).join('\n') + '\n';
}
export async function preview(root, input) {
  const installed = await readOptional(root, 'broke-harness.config.json');
  const config = resolveConfiguration(input ?? (installed === null ? {} : JSON.parse(installed)));
  const profile = await inspect(root, config);
  const previousText = await readOptional(root, '.broke-harness/manifest.json');
  const previous = previousText === null ? null : JSON.parse(previousText);
  if (!previous && config.bootstrap === 'project') {
    if (profile.kind !== 'new-project') throw new Error('Existing projects receive harness structure only; full bootstrap is refused');
    if (!profile.hasRootInstructions || !profile.hasRootArchitecture) throw new Error('Full bootstrap requires AGENT.md (or AGENTS.md) and ARCHITECTURE.md');
    if (!config.project.scaffold.length) throw new Error('Full bootstrap requires an agent-authored project.scaffold derived from the source documents');
  }
  const initialCommands = [...profile.commands];
  if (!previous) for (const file of config.project.scaffold.filter(f => /(?:^|\/)package\.json$/.test(f.path))) {
    const pkg = JSON.parse(file.content);
    for (const name of Object.keys(pkg.scripts ?? {}).sort()) if (/^(test|lint|typecheck|build|check)(:.*)?$/.test(name)) initialCommands.push({ command: `npm run ${name}`, cwd: file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '.', source: file.path, confidence: 'authored scaffold; not executed' });
  }
  const context = previous?.context ?? { sources: profile.sources.map(s => ({ path: s.path })), pathOwnership: profile.pathOwnership, commands: initialCommands, documentation: profile.documentation };
  const files = await render(config, { ...profile, ...context });
  const mutableFiles = previous?.mutableFiles ?? [...new Set([...config.project.documentation.map(f => f.path), ...config.project.scaffold.map(f => f.path), '.broke-harness/PROJECT.md', ...(!profile.documentation.includes('docs/INDEX.md') ? ['docs/INDEX.md'] : [])])];
  // Generated project files belong to the user after bootstrap. Reinstallation never resets them.
  if (previous) for (const name of mutableFiles) {
    const content = await readOptional(root, name);
    if (content !== null) files.set(name, content);
    else files.delete(name);
  }
  const ignored = await readOptional(root, '.gitignore');
  const ignoreText = ignored ?? '';
  // Last rule wins; append a final rule so earlier negations cannot expose artifacts.
  files.set('.gitignore', /(?:^|\n)\/\.tmp\/\r?\n?$/.test(ignoreText) ? ignoreText : ignoreText + (ignoreText && !ignoreText.endsWith('\n') ? '\n' : '') + '/.tmp/\n');
  const operations = [];
  for (const [file, after] of [...files].sort(([a],[b]) => a.localeCompare(b))) {
    const before = await readOptional(root, file);
    const action = before === after ? 'skip' : before === null ? 'create' : file === '.gitignore' ? 'append' : 'conflict';
    operations.push({ path: file, action, beforeHash: before === null ? null : hash(before), afterHash: hash(after), diff: diff(file, before, after), content: after });
  }
  const manifest = { schemaVersion: 1, version: '0.2.0', context, mutableFiles, provenance: 'Adapted from supplied reference-implementation; original fingerprint domain retained. No upstream license grant supplied.', files: { ...Object.fromEntries(mutableFiles.map(name => [name, null])), ...Object.fromEntries(operations.map(o => [o.path, mutableFiles.includes(o.path) ? null : o.afterHash])) } };
  const manifestPath = '.broke-harness/manifest.json';
  const before = await readOptional(root, manifestPath);
  const after = json(manifest);
  operations.push({ path: manifestPath, action: before === after ? 'skip' : before === null ? 'create' : 'conflict', beforeHash: before === null ? null : hash(before), afterHash: hash(after), diff: diff(manifestPath, before, after), content: after });
  const conflicts = operations.filter(o => o.action === 'conflict').map(o => o.path);
  if (config.runtime === 'opencode') for (const name of Object.values(config.roles).map(r => r.agent).concat('broke-orchestrator','broke-docs')) {
    for (const folder of ['agents','agent']) for (const extension of ['md','json']) {
      const file = `.opencode/${folder}/${name}.${extension}`;
      if (await readOptional(root, file) !== null) conflicts.push(file + ': existing role definition requires manual reconciliation');
    }
  }
  if (config.runtime === 'opencode') for (const file of ['opencode.json','opencode.jsonc','.opencode/opencode.json','.opencode/opencode.jsonc']) {
    const text = await readOptional(root, file);
    if (text) {
      const existing = parseJSONC(text);
      for (const name of Object.values(config.roles).map(r => r.agent).concat('broke-orchestrator','broke-docs')) if (Object.hasOwn(existing.agent ?? {}, name)) conflicts.push(`${file}: existing role ${name}; reconcile before installation`);
    }
  }
  const result = { schemaVersion: 1, root, runtime: config.runtime, bootstrap: config.bootstrap, roles: config.roles, profile, conflicts, operations, preserved: ['AGENTS.md','AGENT.md','ARCHITECTURE.md','opencode.json','opencode.jsonc','.opencode/opencode.jsonc'], warnings: ['Project-specific generated files are editable after bootstrap; existing project files are never overwritten.', 'Establish a user-created clean committed baseline before starting the Git-based lifecycle. Final completion approval authorizes the gate, archival and a scoped local commit; Git initialization, branches and pushes remain with the user.', ...(config.runtime === 'opencode' ? ['Review the role overlay and validate live OpenCode provider/model availability.'] : ['Portable commands use the chosen agent\'s existing tools and permissions; no runtime sandbox or model is installed.'])] };
  return { ...result, approval: hash(json(result)) };
}
export async function apply(root, approved, input) {
  const plan = await preview(root, input);
  if (plan.approval !== approved) throw new Error('Approval hash does not match current preview; rerun --dry-run and review the new diff');
  if (plan.conflicts.length) throw new Error(`Installation conflicts: ${plan.conflicts.join(', ')}`);
  // Recheck every path/hash before the first mutation. Exclusive creation prevents clobber.
  for (const op of plan.operations) {
    const current = await readOptional(root, op.path);
    if ((current === null ? null : hash(current)) !== op.beforeHash) throw new Error(`Concurrent change: ${op.path}`);
  }
  const created = [];
  try {
    for (const op of plan.operations) {
      if (op.action === 'skip') continue;
      const target = await safePath(root, op.path);
      await mkdir(path.dirname(target), { recursive: true });
      await safePath(root, op.path);
      if (op.action === 'append') {
        const current = await readOptional(root, op.path);
        if (hash(current) !== op.beforeHash) throw new Error(`Concurrent change: ${op.path}`);
        await appendFile(target, op.content.slice(current.length), 'utf8');
      } else {
        await writeFile(target, op.content, { flag: 'wx', encoding: 'utf8' });
        created.push(op.path);
      }
    }
  } catch (e) {
    // Only remove files this transaction created. Preserve all pre-existing data.
    for (const name of created.reverse()) await unlink(await safePath(root, name));
    throw new Error(`Installation stopped: ${e.message}. Any approved .gitignore append and empty directories may remain; inspect before retrying.`);
  }
  return { version: '0.2.0', created: plan.operations.filter(o => o.action === 'create').map(o => o.path), modified: plan.operations.filter(o => o.action === 'append').map(o => o.path), skipped: plan.operations.filter(o => o.action === 'skip').map(o => o.path), warnings: plan.warnings };
}
