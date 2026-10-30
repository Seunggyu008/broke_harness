import { spawnSync } from 'node:child_process';
import { workspace, hash, readOptional, json, git } from '../lib/safe-files.mjs';
import { resolveConfiguration } from '../lib/configuration.mjs';
import { renderAgents } from '../adapters/opencode/render.mjs';
import { preview } from '../lib/manifest.mjs';
import { argumentsFor, cli } from '../lib/cli.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function doctor(root, { tests = false } = {}) {
  const errors = [], warnings = [];
  if (Number(process.versions.node.split('.')[0]) < 22) errors.push('Node.js 22+ required');
  const manifest = JSON.parse(await readOptional(root, '.broke-harness/manifest.json'));
  if (manifest?.schemaVersion !== 1 || manifest.version !== '0.2.0' || !manifest.files || typeof manifest.files !== 'object') throw new Error('Unsupported or missing installation manifest');
  const config = resolveConfiguration(JSON.parse(await readOptional(root, 'broke-harness.config.json')));
  for (const [file, expected] of Object.entries(manifest.files)) {
    const content = await readOptional(root, file);
    if (expected !== null && (content === null || hash(content) !== expected)) errors.push(`Installed file changed or missing: ${file}`);
    if (expected !== null && content !== null && /\.(mjs|js)$/.test(file)) {
      // OpenCode loads local .js plugins as modules even inside CommonJS projects.
      const check = spawnSync(process.execPath, ['--input-type=module', '--check'], { cwd: root, input: content, encoding: 'utf8' });
      if (check.status !== 0) errors.push(`Syntax check failed: ${file}: ${check.stderr}`);
    }
  }
  if (config.runtime === 'opencode') {
    const overlay = JSON.parse(await readOptional(root, '.broke-harness/opencode.json'));
    if (json(overlay) !== json(renderAgents(config))) errors.push('Role overlay does not match resolved policy/models');
    const audit = overlay.agent?.[config.roles.audit.agent];
    if (audit?.mode !== 'subagent' || audit.permission?.['*'] !== 'deny' || audit.permission?.bash || audit.permission?.task || audit.permission?.edit) errors.push('Unsafe audit permissions');
    const runtime = spawnSync('opencode', ['--version'], { cwd: root, encoding: 'utf8', timeout: 15000, shell: false });
    warnings.push(runtime.status === 0 ? `OpenCode ${runtime.stdout.trim()} found; live model availability and managed/global overrides are not certified.` : 'OpenCode executable not found or unavailable; live runtime/provider use is unverified.');
  } else warnings.push('Portable commands use the host agent permissions. Slash-command discovery depends on the host; command files can also be read explicitly.');
  const repeated = await preview(root);
  if (repeated.conflicts.length || repeated.operations.some(op => op.action !== 'skip')) errors.push('Installation differs from the canonical idempotent preview; review conflicts and local changes');
  let hasGit = false;
  try { git(root, ['rev-parse','--show-toplevel']); hasGit = true; } catch { warnings.push('Git is not initialized. Installation is valid; the user must initialize Git and commit a clean baseline before executing a plan.'); }
  if (hasGit) {
    try { git(root, ['check-ignore', '--no-index', '.tmp/broke-doctor-probe']); } catch { errors.push('.tmp artifacts must be Git-ignored'); }
    try {
      const ignored = git(root, ['check-ignore', '--no-index', ...Object.keys(manifest.files)]).trim();
      if (ignored) warnings.push(`Owner ignore rules hide installed files; review before committing bootstrap: ${ignored.split(/\r?\n/).join(', ')}`);
    } catch (e) { if (e.status !== 1) throw e; }
  }
  let testResult = null;
  if (tests) {
    const scripts = Object.keys(manifest.files).filter(f => f.endsWith('.test.mjs')).sort();
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT; // A doctor invoked from an integration test must run a real child test runner.
    const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...scripts], { cwd: root, env, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
    testResult = { status: result.status, stdout: result.stdout, stderr: result.stderr, error: result.error?.message };
    if (result.status !== 0) errors.push('Installed regression suites failed');
  }
  return { status: errors.length ? 'FAIL' : 'PASS', errors, warnings, tests: testResult };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await cli(async () => {
    const args = argumentsFor(process.argv.slice(2), ['--target','--tests']);
    const result = await doctor(await workspace(args['--target'] ?? process.cwd()), { tests: args['--tests'] });
    console.log(json(result));
    if (result.status !== 'PASS') process.exitCode = 1;
  });
}
