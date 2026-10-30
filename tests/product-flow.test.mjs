import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, lstat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { preview, apply } from '../skill/broke-harness/lib/manifest.mjs';
import { inspect } from '../skill/broke-harness/lib/profile.mjs';
import { resolveConfiguration } from '../skill/broke-harness/lib/configuration.mjs';
import { workspace, parseJSONC } from '../skill/broke-harness/lib/safe-files.mjs';
import { doctor } from '../skill/broke-harness/scripts/doctor.mjs';

async function folder(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'broke-product-flow-'));
  t.after(async () => {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('broke-product-flow-')) throw new Error('Unsafe fixture cleanup');
    await rm(root, { recursive: true, force: true });
  });
  const write = async (name, content) => { await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await writeFile(path.join(root, name), content); };
  const read = name => readFile(path.join(root, name), 'utf8');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' }).trim();
  const run = (script, ...args) => spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: root, encoding: 'utf8', timeout: 30000 });
  const ok = (script, ...args) => { const r = run(script, ...args); assert.equal(r.status, 0, r.stdout + r.stderr); return r; };
  const commit = () => { git('add', '.'); git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','User fixture baseline'); };
  await write('agent.md', '# Instructions\nA small task tracker. Preserve user tasks.\n');
  await write('architecture.md', '# Architecture\nLocal Node modules; persistence stays behind an adapter.\n');
  return { root, write, read, git, run, ok, commit };
}
const blueprint = {
  bootstrap: 'project',
  project: {
    summary: 'Task tracker with adapter-owned persistence.',
    documentation: [{ path:'docs/STORAGE.md', content:'# Storage\n\nPersistence belongs to the local adapter; remote synchronization is future intent.\n' }],
    scaffold: [
      { path:'src/main.mjs', content:'export const tasks = [];\n' },
      { path:'package.json', content:JSON.stringify({type:'module',scripts:{check:'node --check src/main.mjs'}}) + '\n' },
    ],
  },
  documentationSync: {rules:[{trigger:['src/**'],require:['docs/STORAGE.md']}]},
};
const PLAN = 'docs/exec-plans/active/task.md';
const contract = {allowedPaths:['src/**','docs/STORAGE.md'],verify:['node --check src/main.mjs'],requiresDocs:true};
const plan = '# Task\n- Status: `approved`\n\n## Harness Contract\n\n```json\n' + JSON.stringify(contract) + '\n```\n\n## Acceptance Criteria\n\n- Tasks can be represented by the local module.\n';

test('a docs-only folder is new, exposes actual source contents, and installs harness-only without Git', async t => {
  const f = await folder(t);
  assert.equal(await workspace(f.root), f.root);
  const profile = await inspect(f.root);
  assert.equal(profile.kind, 'new-project');
  assert.equal(profile.bootstrapChoiceRequired, true);
  assert.equal(profile.gitAvailable, false);
  assert.ok(profile.sources.some(s => s.path === 'agent.md' && s.content.includes('task tracker')));
  assert.ok(profile.sources.some(s => s.path === 'architecture.md' && s.content.includes('adapter')));
  const before = await readdir(f.root);
  const p = await preview(f.root);
  assert.deepEqual(await readdir(f.root), before);
  assert.equal(p.bootstrap, 'harness'); assert.equal(p.runtime, 'portable');
  await f.write('architecture.md', (await f.read('architecture.md')) + 'No remote service.\n');
  await assert.rejects(apply(f.root, p.approval), /Approval hash/);
  const fresh = await preview(f.root); await apply(f.root, fresh.approval);
  await assert.rejects(lstat(path.join(f.root, '.git')), {code:'ENOENT'});
  await assert.rejects(lstat(path.join(f.root, 'src')), {code:'ENOENT'});
  await assert.rejects(lstat(path.join(f.root, '.opencode')), {code:'ENOENT'});
  for (const name of ['write-plan','start-plan','implement-plan','start-plan-audit','update-docs']) assert.ok((await f.read(`.agents/skills/${name}/SKILL.md`)).startsWith('---\n'));
  const health = await doctor(f.root);
  assert.equal(health.status, 'PASS', JSON.stringify(health));
  assert.ok(health.warnings.some(w => w.includes('Git is not initialized')));
  assert.ok((await preview(f.root)).operations.every(o => o.action === 'skip'));
});

test('approved full bootstrap installs authored project/docs, validates its check, and preserves later owner edits', async t => {
  const f = await folder(t);
  const p = await preview(f.root, blueprint);
  assert.equal(p.profile.kind, 'new-project');
  assert.ok(p.operations.some(o => o.path === 'src/main.mjs' && o.action === 'create'));
  const original = await f.read('agent.md');
  await apply(f.root, p.approval, blueprint);
  assert.equal(await f.read('agent.md'), original);
  assert.equal(await f.read('src/main.mjs'), blueprint.project.scaffold[0].content);
  assert.match(await f.read('docs/INDEX.md'), /STORAGE\.md/);
  assert.match(await f.read('.broke-harness/PROJECT.md'), /adapter-owned persistence/);
  assert.match(await f.read('.broke-harness/PROJECT.md'), /npm run check/);
  f.ok('src/main.mjs');
  const check = spawnSync(process.execPath, ['--check','src/main.mjs'], {cwd:f.root,encoding:'utf8'});
  assert.equal(check.status, 0, check.stderr);
  await f.write('src/main.mjs', 'export const tasks = ["User edit"];\n');
  await f.write('docs/STORAGE.md', '# Storage\n\nOwner-maintained current documentation.\n');
  const repeat = await preview(f.root);
  assert.deepEqual(repeat.conflicts, []);
  assert.ok(repeat.operations.every(o => o.action === 'skip'));
  const health = await doctor(f.root);
  assert.equal(health.status, 'PASS', JSON.stringify(health));
  await rm(path.join(f.root, 'docs/STORAGE.md'));
  await f.write('docs/INDEX.md', '# Documentation\n\nStorage detail was consolidated by the owner.\n');
  assert.ok((await preview(f.root)).operations.every(o => o.action === 'skip'));
  assert.equal((await doctor(f.root)).status, 'PASS');
  await assert.rejects(lstat(path.join(f.root, '.git')), {code:'ENOENT'});
});

test('existing project receives harness only; source, application, and existing index remain byte-identical', async t => {
  const f = await folder(t);
  await f.write('src/main.mjs', 'export const owner = true;\n');
  await f.write('docs/INDEX.md', '# Owner index\n');
  const info = await inspect(f.root);
  assert.equal(info.kind, 'existing-project'); assert.equal(info.bootstrapChoiceRequired, false);
  f.git('init','-q'); await f.write('.gitignore','src/\n');
  assert.equal((await inspect(f.root)).kind, 'existing-project');
  await assert.rejects(preview(f.root, blueprint), /Existing projects receive harness/);
  assert.throws(() => resolveConfiguration({...blueprint,bootstrap:'harness'}), /requires explicit bootstrap/);
  for (const file of ['../escape','.env','AGENT.md','architecture.md','tools/harness/run.mjs','docs/exec-plans/active/a.md']) assert.throws(() => resolveConfiguration({...blueprint,project:{...blueprint.project,scaffold:[{path:file,content:'overwrite'}]}}));
  const p = await preview(f.root); await apply(f.root, p.approval);
  assert.equal(await f.read('src/main.mjs'), 'export const owner = true;\n');
  assert.equal(await f.read('docs/INDEX.md'), '# Owner index\n');
  assert.equal(await f.read('agent.md'), '# Instructions\nA small task tracker. Preserve user tasks.\n');
});

test('CLI accepts a no-Git folder and an external agent-authored bootstrap input without generating Git state', async t => {
  const f = await folder(t);
  const inputFolder = await folder(t);
  await inputFolder.write('input.json', JSON.stringify(blueprint));
  const script = path.resolve('skill/broke-harness/scripts/install.mjs');
  const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
  const invoke = (...args) => spawnSync(process.execPath, [script,'--target',f.root,'--config',path.join(inputFolder.root,'input.json'),...args], {env,encoding:'utf8',timeout:30000});
  const dry = invoke('--dry-run'); assert.equal(dry.status, 0, dry.stderr);
  const p = JSON.parse(dry.stdout);
  const result = invoke('--approve',p.approval); assert.equal(result.status, 0, result.stderr);
  assert.equal(await f.read('src/main.mjs'), blueprint.project.scaffold[0].content);
  await assert.rejects(lstat(path.join(f.root,'.git')), {code:'ENOENT'});
});

test('user-approved completion needs no audit and still rejects missing approval, failed checks and stale changes', async t => {
  const f = await folder(t);
  const p = await preview(f.root, blueprint); await apply(f.root,p.approval,blueprint);
  f.git('init','-q'); f.git('config','core.autocrlf','false'); f.commit();
  await f.write(PLAN, plan); f.ok('tools/exec-plans/start-plan.mjs',PLAN);
  await f.write('src/main.mjs','export const tasks = ;\n');
  await f.write('docs/STORAGE.md','# Storage\n\nTask representation updated.\n');
  assert.equal(f.run('tools/harness/run.mjs','--plan',PLAN).status,1);
  const args = [PLAN,'--harness','.tmp/harness-report.json'];
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...args,'--approve','wrong').stderr,/passing harness/);
  await f.write('src/main.mjs','export const tasks = ["Done"];\n');
  f.ok('tools/harness/run.mjs','--plan',PLAN);
  let report = JSON.parse(await f.read('.tmp/harness-report.json'));
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...args).stderr,/Explicit owner completion approval/);
  await f.write('.tmp/audit-result.json', JSON.stringify({outcome:'fixable'}));
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...args,'--audit','.tmp/audit-result.json','--approve',report.changeFingerprint).stderr,/clean structured audit/);
  await f.write('src/main.mjs','export const tasks = ["Changed after review"];\n');
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...args,'--approve',report.changeFingerprint).stderr,/contents do not match/);
  await f.write('src/main.mjs','export const tasks = ["Done"];\n');
  const stale = {...report,generatedAt:'2000-01-01T00:00:00Z'};
  await f.write('.tmp/harness-report.json',JSON.stringify(stale));
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...args,'--approve',report.changeFingerprint).stderr,/freshness/);
  f.ok('tools/harness/run.mjs','--plan',PLAN); report = JSON.parse(await f.read('.tmp/harness-report.json'));
  const head = f.git('rev-parse','HEAD');
  await rm(path.join(f.root,'.tmp/audit-result.json'));
  f.ok('tools/exec-plans/complete-plan.mjs',...args,'--approve',report.changeFingerprint);
  assert.match(await f.read('docs/exec-plans/archive/task.md'),/Status: `done`/);
  await assert.rejects(lstat(path.join(f.root,PLAN)), {code:'ENOENT'});
  await assert.rejects(lstat(path.join(f.root,'.tmp/audit-result.json')), {code:'ENOENT'});
  assert.equal(f.git('rev-parse','HEAD'),head);
  assert.equal(f.git('diff','--cached','--name-only'),'');
});

test('OpenCode docs maintenance allows docs-only edits and patches, denies code/source/plan/Git writes, and supports questions', async t => {
  const f = await folder(t);
  const p = await preview(f.root,{runtime:'opencode'}); await apply(f.root,p.approval,{runtime:'opencode'});
  const {default: plugin} = await import(pathToFileURL(path.join(f.root,'.opencode/plugins/broke-harness.js')));
  const hooks = await plugin({directory:f.root,client:{}});
  const config = JSON.parse(await f.read('broke-harness.config.json'));
  const effective = {agent:{build:{model:'owner/model',mode:'primary'}}};
  await hooks.config(effective); assert.equal(effective.agent.build.model,'owner/model');
  await assert.rejects(hooks.config({agent:{'broke-orchestrator':{prompt:'owner role'}}}), /Existing agent conflicts/);
  await hooks['chat.params']({sessionID:'docs',agent:'broke-docs',model:{providerID:'any',id:'owner'}});
  const invoke = (tool,args) => hooks['tool.execute.before']({sessionID:'docs',tool,callID:tool},{args});
  await invoke('question',{questions:[]});
  await invoke('write',{filePath:'docs/PRODUCT.md',content:'# Current scope\n'});
  await invoke('write',{filePath:'ARCHITECTURE.md',content:'# Architecture\n\nCurrent factual boundaries.\n'});
  await invoke('apply_patch',{patchText:'*** Begin Patch\n*** Delete File: docs/OLD.md\n*** Add File: docs/NEW.md\n+Current documentation\n*** End Patch'});
  for (const filePath of ['src/main.mjs','agent.md','docs/exec-plans/active/task.md','docs/EXEC-PLANS/active/task.md','docs/credentials.md','.git/config']) await assert.rejects(invoke('write',{filePath,content:'unsafe'}));
  await assert.rejects(invoke('apply_patch',{patchText:'*** Begin Patch\n*** Update File: docs/PRODUCT.md\n*** Move to: src/code.md\n*** End Patch'}),/cannot edit/);
  await assert.rejects(invoke('bash',{command:'git push'}),/denies bash/);
  await hooks['chat.params']({sessionID:'orchestrator',agent:'broke-orchestrator',model:{providerID:config.roles.implement.provider,id:config.roles.implement.model}});
  await hooks['tool.execute.before']({sessionID:'orchestrator',tool:'question'},{args:{questions:[]}});
  const command = `node tools/exec-plans/complete-plan.mjs ${PLAN} --harness .tmp/harness-report.json --approve sha256:${'a'.repeat(64)}`;
  await hooks['tool.execute.before']({sessionID:'orchestrator',tool:'bash'},{args:{command}});
  await assert.rejects(lstat(path.join(f.root,'src')), {code:'ENOENT'});
});

test('JSONC role collisions are reported before install without false matches in strings or task permissions', async t => {
  const f = await folder(t);
  const text = '// keep comment\n{"url":"https://example.invalid/a,}","agent":{"broke-implement":{"model":"owner/model",},},}';
  assert.equal(parseJSONC(text).url,'https://example.invalid/a,}');
  await f.write('opencode.jsonc',text);
  const p = await preview(f.root,{runtime:'opencode'});
  assert.ok(p.conflicts.some(c => c.includes('existing role broke-implement')));
  await assert.rejects(apply(f.root,p.approval,{runtime:'opencode'}),/Installation conflicts/);
  assert.equal(await f.read('opencode.jsonc'),text);
  await f.write('opencode.jsonc','{"permission":{"task":{"broke-implement":"ask"}},"agent":{"build":{"model":"owner/default"}}}');
  assert.deepEqual((await preview(f.root,{runtime:'opencode'})).conflicts,[]);
});
