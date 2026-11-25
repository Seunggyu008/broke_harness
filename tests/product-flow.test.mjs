import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, lstat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview, apply, version } from '../skill/broke-harness/lib/manifest.mjs';
import { inspect } from '../skill/broke-harness/lib/profile.mjs';
import { resolveConfiguration } from '../skill/broke-harness/lib/configuration.mjs';
import { workspace, parseJSONC, hash, json } from '../skill/broke-harness/lib/safe-files.mjs';
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
const HARNESS_ARGS = [PLAN, '--harness', '.tmp/harness-report.json'];
const COMPLETION_ARGS = [...HARNESS_ARGS, '--audit', '.tmp/audit-result.json'];
const contract = {allowedPaths:['src/**','docs/STORAGE.md'],verify:['node --check src/main.mjs'],requiresDocs:true};
const plan = '# Task\n- Status: `approved`\n\n## Harness Contract\n\n```json\n' + JSON.stringify(contract) + '\n```\n\n## Acceptance Criteria\n\n- Tasks can be represented by the local module.\n';

async function writeSyntheticAudit(f, report) {
  await f.write('.tmp/audit-result.json', JSON.stringify({
    outcome:'clean', mustFix:[], shouldFix:[], acceptableRisk:[], feedbackAssessment:[],
    summary:'Synthetic completion fixture audit.',
    planPath:report.planPath, generatedAt:report.generatedAt,
    harnessGeneratedAt:report.generatedAt, harnessChangeFingerprint:report.changeFingerprint,
    acceptanceEvidence:report.acceptanceCriteria.map(({id}) => ({
      criterionId:id, evidenceType:'automated', status:'verified', evidence:'Fixture verification passed.',
    })),
  }));
}

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
  for (const name of ['write-plan','start-plan','implement-plan','start-plan-audit','commit','update-docs']) assert.ok((await f.read(`.agents/skills/${name}/SKILL.md`)).startsWith('---\n'));
  assert.match(await f.read('.agents/skills/commit/agents/openai.yaml'), /allow_implicit_invocation: false/);
  const start = await f.read('.broke-harness/commands/start-plan.md');
  assert.match(start, /After every passing harness, delegate the audit contract/);
  assert.match(start, /Continue only with a clean audit/);
  assert.match(start, /five total fix attempts/);
  assert.equal(JSON.parse(await f.read('broke-harness.config.json')).policy.requireIndependentAudit,true);
  assert.throws(() => resolveConfiguration({policy:{requireIndependentAudit:false}}), /Invariant policy cannot be disabled: requireIndependentAudit/);
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

test('update refreshes an older installation, preserves project assets and refuses stale or conflicting upgrades', async t => {
  const f = await folder(t);
  const script = fileURLToPath(new URL('../skill/broke-harness/scripts/update.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [script, '--target', f.root, ...args], { encoding: 'utf8' });
  const updatePreview = () => {
    const result = run('--dry-run');
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  assert.match(run('--dry-run').stderr, /requires an installed harness/);
  const config = { ...blueprint, runtime: 'opencode', roles: { fix: { steps: 170 } } };
  const initial = await preview(f.root, config);
  await apply(f.root, initial.approval, config);

  const manifestPath = '.broke-harness/manifest.json';
  const manifest = JSON.parse(await f.read(manifestPath));
  manifest.version = '0.2.0';
  const runtimeFile = '.broke-harness/lib/configuration.mjs';
  const originalRuntime = await f.read(runtimeFile);
  const obsoleteFile = '.broke-harness/commands/old-workflow.md';
  const missingFile = '.broke-harness/commands/write-plan.md';
  const ownerFiles = {
    'src/main.mjs': 'export const tasks = ["owner edit"];\n',
    'docs/STORAGE.md': '# Owner documentation\n',
    [PLAN]: plan,
    'docs/exec-plans/archive/old.md': '# Archived plan\n',
  };
  for (const [file, content] of Object.entries(ownerFiles)) await f.write(file, content);
  const configFile = 'broke-harness.config.json';
  const migratedConfig = (await f.read(configFile)) + '\n';
  const oldConfig = migratedConfig.replace('"maxCombinedFixAttempts": 5', '"maxCombinedFixAttempts": 3');
  await f.write(configFile, oldConfig);
  for (const file of [runtimeFile, obsoleteFile]) {
    await f.write(file, '// Prior release\n');
    manifest.files[file] = hash('// Prior release\n');
  }
  await rm(path.join(f.root, missingFile));
  await f.write(manifestPath, json(manifest));

  const proposed = updatePreview();
  const actions = Object.fromEntries(proposed.operations.map(({ path, action }) => [path, action]));
  assert.equal(actions[runtimeFile], 'replace');
  assert.equal(actions[obsoleteFile], 'remove');
  assert.equal(actions[missingFile], 'create');
  assert.equal(actions[configFile], 'replace');
  assert.equal(await f.read(configFile), oldConfig);
  assert.equal(await f.read(runtimeFile), '// Prior release\n');
  await f.write(runtimeFile, '// Local customization\n');
  assert.match(run('--approve', proposed.approval).stderr, /does not match/);
  const conflicted = updatePreview();
  assert.ok(conflicted.conflicts.includes(runtimeFile));
  assert.match(run('--approve', conflicted.approval).stderr, /Update conflicts/);
  assert.equal(await f.read(obsoleteFile), '// Prior release\n');

  await f.write(runtimeFile, '// Prior release\n');
  const result = run('--approve', updatePreview().approval);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).removed, [obsoleteFile]);
  assert.equal(await f.read(runtimeFile), originalRuntime);
  assert.equal(await f.read(configFile), migratedConfig);
  const { agent } = JSON.parse(await f.read('.broke-harness/opencode.json'));
  assert.equal(agent['broke-fix'].steps, 170);
  assert.equal(JSON.parse(await f.read(manifestPath)).version, version);
  await assert.rejects(lstat(path.join(f.root, obsoleteFile)), { code: 'ENOENT' });
  await assert.rejects(lstat(path.join(f.root, '.git')), { code: 'ENOENT' });
  for (const [file, content] of Object.entries(ownerFiles)) assert.equal(await f.read(file), content);
  assert.ok(updatePreview().operations.every(op => op.action === 'skip'));
  const health = await doctor(f.root);
  assert.equal(health.status, 'PASS', JSON.stringify(health));
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

test('completion requires a current clean audit and explicit approval', async t => {
  const f = await folder(t);
  const p = await preview(f.root, blueprint); await apply(f.root,p.approval,blueprint);
  f.git('init','-q'); f.git('config','core.autocrlf','false'); f.commit();
  await f.write(PLAN, plan); f.ok('tools/exec-plans/start-plan.mjs',PLAN);
  await f.write('src/main.mjs','export const tasks = ;\n');
  await f.write('docs/STORAGE.md','# Storage\n\nTask representation updated.\n');
  assert.equal(f.run('tools/harness/run.mjs','--plan',PLAN).status,1);
  const args = COMPLETION_ARGS;
  await f.write('.tmp/audit-result.json', JSON.stringify({outcome:'fixable'}));
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...args,'--approve','wrong').stderr,/passing harness/);
  await f.write('src/main.mjs','export const tasks = ["Done"];\n');
  f.ok('tools/harness/run.mjs','--plan',PLAN);
  let report = JSON.parse(await f.read('.tmp/harness-report.json'));
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...args,'--approve',report.changeFingerprint).stderr,/clean structured audit/);
  await rm(path.join(f.root,'.tmp/audit-result.json'));
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...HARNESS_ARGS,'--approve',report.changeFingerprint).stderr,/--audit <result-path>/);
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...args,'--approve',report.changeFingerprint).stderr,/Audit result could not be read/);
  await assert.rejects(f.read('docs/exec-plans/archive/task.md'),{code:'ENOENT'});
  await writeSyntheticAudit(f, report);
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...args).stderr,/Explicit owner completion approval/);
  await f.write('src/main.mjs','export const tasks = ["Changed after review"];\n');
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...args,'--approve',report.changeFingerprint).stderr,/contents do not match/);
  await f.write('src/main.mjs','export const tasks = ["Done"];\n');
  const stale = {...report,generatedAt:'2000-01-01T00:00:00Z'};
  await f.write('.tmp/harness-report.json',JSON.stringify(stale));
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...args,'--approve',report.changeFingerprint).stderr,/freshness/);
  f.ok('tools/harness/run.mjs','--plan',PLAN); report = JSON.parse(await f.read('.tmp/harness-report.json'));
  const head = f.git('rev-parse','HEAD');
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...args,'--approve',report.changeFingerprint).stderr,/different harness run/);
  await writeSyntheticAudit(f, report);
  f.ok('tools/exec-plans/complete-plan.mjs',...args,'--approve',report.changeFingerprint);
  assert.match(await f.read('docs/exec-plans/archive/task.md'),/Status: `done`/);
  await assert.rejects(lstat(path.join(f.root,PLAN)), {code:'ENOENT'});
  assert.equal(f.git('rev-parse','HEAD'),head);
  assert.equal(f.git('diff','--cached','--name-only'),'');
});

async function readyToComplete(t, runtime, trackedPlan = false, stagedPlan = false) {
  const f = await folder(t);
  const config = {...blueprint, runtime};
  const p = await preview(f.root, config); await apply(f.root, p.approval, config);
  f.git('init','-q'); f.git('config','core.autocrlf','false');
  f.git('config','user.name','Fixture'); f.git('config','user.email','fixture@example.invalid');
  await f.write('src/remove.mjs','export const obsolete = true;\n');
  await f.write('src/old (name).mjs','export const renamed = true;\n');
  if (trackedPlan) await f.write(PLAN, plan);
  f.commit();
  if (!trackedPlan) await f.write(PLAN, plan);
  if (stagedPlan) f.git('add',PLAN);
  f.ok('tools/exec-plans/start-plan.mjs', PLAN);
  await f.write('src/main.mjs','export const tasks = ["staged version"];\n');
  f.git('add','src/main.mjs');
  await f.write('src/main.mjs','export const tasks = ["reviewed version"];\n');
  await f.write('src/new [module].mjs','export const added = true;\n');
  await rm(path.join(f.root,'src/remove.mjs'));
  f.git('mv','src/old (name).mjs','src/new (name).mjs');
  await f.write('docs/STORAGE.md','# Storage\n\nTask representation updated.\n');
  f.ok('tools/harness/run.mjs','--plan',PLAN);
  const report = JSON.parse(await f.read('.tmp/harness-report.json'));
  await writeSyntheticAudit(f, report);
  const diff = JSON.parse(await f.read('.tmp/harness-diff.json'));
  assert.deepEqual(diff.untracked.map(file => file.path),['src/new [module].mjs']);
  assert.ok(diff.patch.includes('src/old (name).mjs'));
  return {...f, head:f.git('rev-parse','HEAD'), report};
}

for (const runtime of ['portable','opencode']) for (const planState of ['new','staged','tracked']) {
  test(`${runtime} approved completion commits reviewed changes and ${planState} plan archival`, async t => {
    const trackedPlan = planState === 'tracked';
    const f = await readyToComplete(t, runtime, trackedPlan, planState === 'staged');
    const message = 'feat: update task representation';
    const result = f.ok('tools/exec-plans/complete-plan.mjs', ...COMPLETION_ARGS,
      '--approve',f.report.changeFingerprint,'--commit-message',message);
    assert.notEqual(f.git('rev-parse','HEAD'),f.head);
    assert.equal(f.git('log','-1','--format=%s'),message);
    assert.equal(f.git('status','--porcelain'),'');
    assert.equal(f.git('show','HEAD:src/main.mjs'),'export const tasks = ["reviewed version"];');
    const files = f.git('diff-tree','--no-commit-id','--no-renames','--name-only','-r','HEAD').split('\n').sort();
    assert.deepEqual(files, [
      ...(trackedPlan ? [PLAN] : []), 'docs/exec-plans/archive/task.md','docs/STORAGE.md',
      'src/main.mjs','src/new [module].mjs','src/new (name).mjs','src/old (name).mjs','src/remove.mjs',
    ].sort());
    assert.match(await f.read('docs/exec-plans/archive/task.md'),/Status: `done`/);
    assert.ok(result.stdout.includes(f.git('rev-parse','HEAD')));
    assert.ok(result.stdout.includes(message));
  });
}

test('commit mode preserves HEAD, index and active plan when completion approval or evidence fails', async t => {
  const f = await readyToComplete(t, 'portable');
  const args = [...COMPLETION_ARGS,'--commit-message','fix: update tasks'];
  const index = f.git('diff','--cached');
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...args).stderr,/Explicit owner completion approval/);
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...args,'--approve','wrong').stderr,/Explicit owner completion approval/);
  await f.write('.tmp/harness-report.json',JSON.stringify({...f.report,status:'FAIL'}));
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...args,'--approve',f.report.changeFingerprint).stderr,/passing harness/);
  await f.write('.tmp/harness-report.json',JSON.stringify({...f.report,generatedAt:'2000-01-01T00:00:00Z'}));
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...args,'--approve',f.report.changeFingerprint).stderr,/freshness/);
  await f.write('.tmp/harness-report.json',JSON.stringify(f.report));
  assert.equal(f.git('diff','--cached'),index);
  await f.write('src/main.mjs','export const tasks = ["unreviewed change"];\n');
  assert.match(f.run('tools/exec-plans/complete-plan.mjs',...args,'--approve',f.report.changeFingerprint).stderr,/contents do not match/);
  await f.write('unrelated.txt','Unrelated user work\n'); f.git('add','unrelated.txt');
  const indexWithUnrelated = f.git('diff','--cached');
  assert.equal(f.run('tools/exec-plans/complete-plan.mjs',...args,'--approve',f.report.changeFingerprint).status,1);
  assert.equal(f.git('diff','--cached'),indexWithUnrelated);
  assert.equal(await f.read('unrelated.txt'),'Unrelated user work\n');
  assert.equal(f.git('rev-parse','HEAD'),f.head);
  assert.match(await f.read(PLAN),/Status: `in-progress`/);
  await assert.rejects(f.read('docs/exec-plans/archive/task.md'),{code:'ENOENT'});
  assert.ok(index.includes('staged version'));
});

test('commit hook failure reports successful archival separately and preserves work for scoped recovery', async t => {
  const f = await readyToComplete(t, 'portable', true);
  await f.write('.git/hooks/pre-commit','#!/bin/sh\nexit 1\n');
  const message = 'fix: update task storage';
  const result = f.run('tools/exec-plans/complete-plan.mjs', ...COMPLETION_ARGS,
    '--approve',f.report.changeFingerprint,'--commit-message',message);
  assert.equal(result.status,1);
  assert.match(result.stderr,/Completion gate passed.*Git commit failed/);
  assert.equal(f.git('rev-parse','HEAD'),f.head);
  assert.match(await f.read('docs/exec-plans/archive/task.md'),/Status: `done`/);
  await assert.rejects(f.read(PLAN),{code:'ENOENT'});
  assert.ok(f.git('diff','--cached','--name-only').includes('src/main.mjs'));
  await rm(path.join(f.root,'.git/hooks/pre-commit'));
  f.git('commit','-m',message);
  assert.equal(f.git('log','-1','--format=%s'),message);
  assert.equal(f.git('status','--porcelain'),'');
});

test('OpenCode docs maintenance allows docs-only edits and patches, denies code/source/plan/Git writes, and supports questions', async t => {
  const f = await folder(t);
  const p = await preview(f.root,{runtime:'opencode'}); await apply(f.root,p.approval,{runtime:'opencode'});
  const {default: plugin} = await import(pathToFileURL(path.join(f.root,'.opencode/plugins/broke-harness.js')));
  const hooks = await plugin({directory:f.root,client:{}});
  const config = JSON.parse(await f.read('broke-harness.config.json'));
  const { agent } = JSON.parse(await f.read('.broke-harness/opencode.json'));
  assert.equal(agent[config.roles.implement.agent].steps, 150);
  assert.equal(agent[config.roles.fix.agent].steps, 150);
  assert.equal(agent[config.roles.audit.agent].steps, 100);
  assert.match(await f.read('.opencode/commands/commit.md'), /agent: broke-orchestrator/);
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
  const invokeCompletion = command => hooks['tool.execute.before']({sessionID:'orchestrator',tool:'bash'},{args:{command}});
  const command = `node tools/exec-plans/complete-plan.mjs ${COMPLETION_ARGS.join(' ')} --approve sha256:${'a'.repeat(64)}`;
  await assert.rejects(invokeCompletion(command.replace(' --audit .tmp/audit-result.json','')), /Only exact canonical lifecycle commands/);
  await invokeCompletion(command);
  await invokeCompletion(command + ' --commit-message "fix: preserve task order"');
  await invokeCompletion(command + ' --commit-message "fix: 작업 순서 유지"');
  for (const message of ['fix: $(whoami)', 'fix: `whoami`', 'fix: %PATH%', 'fix: "escape"', 'fix: bad; git push']) {
    await assert.rejects(invokeCompletion(command + ` --commit-message "${message}"`));
  }
  await assert.rejects(invokeCompletion('git commit -am "unscoped changes"'));
  const commit = 'node tools/exec-plans/commit.mjs';
  await invokeCompletion(commit + ' --inspect');
  await invokeCompletion(commit + ' --message "refactor/Simplify task storage"');
  for (const subject of ['fix: preserve task order', 'fix/$(whoami)', 'fix/%PATH%']) {
    await assert.rejects(invokeCompletion(commit + ` --message "${subject}"`));
  }
  await assert.rejects(lstat(path.join(f.root,'src')), {code:'ENOENT'});
});

test('standalone commit records a typed subject and commits only staged content outside active execution', async t => {
  const f = await folder(t);
  const p = await preview(f.root, blueprint);
  await apply(f.root, p.approval, blueprint);
  f.git('init', '-q');
  f.git('config', 'user.name', 'Fixture');
  f.git('config', 'user.email', 'fixture@example.invalid');
  f.commit();

  const helper = 'tools/exec-plans/commit.mjs';
  assert.match(f.run(helper, '--inspect').stderr, /Nothing is staged/);
  await f.write('src/main.mjs', 'export const tasks = ["staged"];\n');
  f.git('add', 'src/main.mjs');
  await f.write('src/main.mjs', 'export const tasks = ["unstaged"];\n');
  await f.write('notes.txt', 'Untracked notes\n');
  const inspected = f.ok(helper, '--inspect').stdout;
  assert.match(inspected, /\["staged"\]/);
  assert.doesNotMatch(inspected, /unstaged|Untracked/);
  const baseline = f.git('rev-parse', 'HEAD');
  assert.match(f.run(helper, '--message', 'fix: preserve task order').stderr, /concise summary/);
  await f.write(PLAN, plan.replace('approved', 'in-progress'));
  assert.match(f.run(helper, '--message', 'fix/Preserve task order').stderr, /Complete it through \/start-plan/);
  assert.equal(f.git('rev-parse', 'HEAD'), baseline);
  await rm(path.join(f.root, PLAN));

  const message = 'fix/Preserve task order';
  const result = f.ok(helper, '--message', message).stdout.trim();
  assert.equal(result, f.git('log', '-1', '--format=%H %s'));
  assert.ok(result.endsWith(` ${message}`));
  assert.equal(f.git('show', 'HEAD:src/main.mjs'), 'export const tasks = ["staged"];');
  assert.match(await f.read('src/main.mjs'), /unstaged/);
  assert.deepEqual(f.git('status', '--porcelain').split(/\r?\n/).map(line => line.trim()), ['M src/main.mjs', '?? notes.txt']);
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
