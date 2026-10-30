import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, lstat, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { registrationPreview, registerBootstrap } from '../skill/broke-harness/scripts/register-bootstrap.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'harness-command-test-'));
  t.after(async () => {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('harness-command-test-')) throw new Error('Unsafe cleanup');
    await rm(root, { recursive:true, force:true });
  });
  return root;
}

test('bootstrap registration is non-mutating in preview, self-contained, and independent of target cwd', async t => {
  const root = await fixture(t);
  const config = path.join(root, 'agent configuration');
  const target = path.join(root, 'new project with spaces');
  await mkdir(target);
  await writeFile(path.join(target, 'AGENT.md'), '# Project\nA task tracker.\n');
  await writeFile(path.join(target, 'ARCHITECTURE.md'), '# Architecture\nNode modules.\n');
  const preview = await registrationPreview(config);
  await assert.rejects(lstat(config), {code:'ENOENT'});
  await assert.rejects(registerBootstrap(config,'not-approved'), /approval/);
  await registerBootstrap(config, preview.approval);
  const installed = path.join(config, 'skills/harness-bootstrap');
  const skill = await readFile(path.join(installed,'SKILL.md'),'utf8');
  assert.match(skill, /^name: harness-bootstrap$/m);
  const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [path.join(installed,'scripts/inspect.mjs'),'--target',target], {cwd:root, env, encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const profile = JSON.parse(result.stdout);
  assert.equal(profile.root,target); assert.equal(profile.kind,'new-project');
  assert.ok(profile.sources.some(s => s.content.includes('task tracker')));
  assert.ok((await registrationPreview(config)).operations.every(op => op.action === 'skip'));
  assert.deepEqual((await readdir(target)).sort(),['AGENT.md','ARCHITECTURE.md']);
});

test('OpenCode registration creates a bootstrap command before any project harness exists and preserves settings', async t => {
  const root = await fixture(t);
  await writeFile(path.join(root,'opencode.json'),'{"model":"owner/model"}\n');
  const p = await registrationPreview(root,'opencode');
  await registerBootstrap(root,p.approval,'opencode');
  const command = await readFile(path.join(root,'commands/harness-bootstrap.md'),'utf8');
  const skillPath = JSON.parse(command.match(/Read the skill at (".*") and follow/)[1]);
  assert.equal(await readFile(skillPath,'utf8'),await readFile(path.join(root,'skills/harness-bootstrap/SKILL.md'),'utf8'));
  assert.equal(await readFile(path.join(root,'opencode.json'),'utf8'),'{"model":"owner/model"}\n');
  await assert.rejects(lstat(path.join(root,'tools/harness')), {code:'ENOENT'});
  await writeFile(path.join(root,'commands/harness-bootstrap.md'),'Owner command\n');
  const conflict = await registrationPreview(root,'opencode');
  assert.ok(conflict.conflicts.includes('commands/harness-bootstrap.md'));
  await assert.rejects(registerBootstrap(root,conflict.approval,'opencode'), /conflicts/);
  assert.equal(await readFile(path.join(root,'commands/harness-bootstrap.md'),'utf8'),'Owner command\n');
});

test('registration refuses stale previews, unsafe ancestor links and recursive destinations', async t => {
  const root = await fixture(t);
  const p = await registrationPreview(root);
  await mkdir(path.join(root,'skills/harness-bootstrap'),{recursive:true});
  await writeFile(path.join(root,'skills/harness-bootstrap/SKILL.md'),'Existing skill\n');
  await assert.rejects(registerBootstrap(root,p.approval), /approval/);
  await assert.rejects(registrationPreview(path.resolve('skill/broke-harness/registered')), /outside the distributable/);
  const real = path.join(root,'real'); await mkdir(real);
  const link = path.join(root,'link');
  await symlink(real,link,process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(registrationPreview(path.join(link,'config')), /Symlink boundary/);
});
