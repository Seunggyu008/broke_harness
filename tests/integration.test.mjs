import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, readdir, rm, symlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { preview, apply } from '../skill/broke-harness/lib/manifest.mjs';
import { inspect } from '../skill/broke-harness/lib/profile.mjs';
import { hash, repository, relativePath, readOptional } from '../skill/broke-harness/lib/safe-files.mjs';
import { resolveConfiguration } from '../skill/broke-harness/lib/configuration.mjs';
import { doctor } from '../skill/broke-harness/scripts/doctor.mjs';
import { analyzeContractSync, matchesGlob } from '../skill/broke-harness/assets/runtime/tools/harness/run.mjs';

const PLAN = 'docs/exec-plans/active/demo.md';
const CONTRACT = { allowedPaths: ['src/**','docs/API.md'], verify: ['node --check src/main.mjs','git diff --check'], requiresDocs: true };
const planText = (status = 'approved', contract = CONTRACT) => `# Example\r\n- Status: \`${status}\`\r\n\r\n## Harness Contract\r\n\r\n\`\`\`json\r\n${JSON.stringify(contract)}\r\n\`\`\`\r\n\r\n## Acceptance Criteria\r\n\r\n- The module exports the new value and docs match.\r\n`;
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'broke-harness-test-space repo-'));
  t.after(async () => {
    if (path.dirname(root) !== path.resolve(os.tmpdir()) || !path.basename(root).startsWith('broke-harness-test-')) throw new Error('Unsafe fixture cleanup');
    await rm(root, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }).trim();
  const write = async (name, content) => { await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await writeFile(path.join(root, name), content); };
  const read = name => readFile(path.join(root, name), 'utf8');
  const commit = () => { git('add','.'); git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Fixture baseline'); };
  const run = (script, ...args) => spawnSync(process.execPath, [path.join(root, script), ...args], { cwd: root, encoding: 'utf8', timeout: 30000 });
  const ok = (script, ...args) => { const result = run(script, ...args); assert.equal(result.status, 0, result.stdout + result.stderr + result.error); return result; };
  const fail = (script, ...args) => { const result = run(script, ...args); assert.equal(result.status, 1, result.stdout + result.stderr); return result.stderr; };
  git('init','-q'); git('config','core.autocrlf','false');
  await write('src/main.mjs','export const value = 1;\n');
  await write('docs/API.md','Value: 1\n');
  return { root, git, write, read, commit, run, ok, fail };
}
async function install(f, config) { const p = await preview(f.root, { runtime: 'opencode', ...config }); assert.deepEqual(p.conflicts, []); await apply(f.root, p.approval, { runtime: 'opencode', ...config }); return p; }
async function snapshot(root) {
  const entries = [];
  async function visit(dir, prefix = '') {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      if (entry.name === '.git') continue;
      const name = prefix + entry.name;
      if (entry.isDirectory()) { entries.push(name + '/'); await visit(path.join(dir, entry.name), name + '/'); }
      else entries.push(name + (entry.isSymbolicLink() ? ':link' : ':' + hash(await readFile(path.join(dir, entry.name)))));
    }
  }
  await visit(root); return entries;
}
function syntheticAudit(report) {
  return { outcome: 'clean', mustFix: [], shouldFix: [], acceptableRisk: [], feedbackAssessment: [], summary: 'Synthetic test fixture, no AI audit ran.',
    acceptanceEvidence: report.acceptanceCriteria.map(c => ({ criterionId: c.id, evidenceType: 'automated', status: 'verified', evidence: 'Synthetic fixture validates artifact gates only.' })),
    generatedAt: new Date().toISOString(), planPath: report.planPath, harnessGeneratedAt: report.generatedAt, harnessChangeFingerprint: report.changeFingerprint };
}

test('preview is deterministic and non-mutating; approval binds to content; install is idempotent', async t => {
  const f = await fixture(t);
  await f.write('unrelated user notes.txt','preserve');
  const before = await snapshot(f.root);
  const a = await preview(f.root), b = await preview(f.root);
  assert.deepEqual(a,b);
  assert.deepEqual(await snapshot(f.root), before);
  assert.ok(a.operations.every(o => o.action === 'create' && o.diff.startsWith('--- a/')));
  await assert.rejects(apply(f.root, 'not-approved'), /Approval hash/);
  await f.write('new-untracked.txt','changed since preview');
  await assert.rejects(apply(f.root, a.approval), /Approval hash/);
  await install(f);
  const second = await preview(f.root);
  assert.ok(second.operations.every(o => o.action === 'skip'));
  const state = await snapshot(f.root);
  const result = await apply(f.root, second.approval);
  assert.deepEqual(result.created, []);
  assert.deepEqual(await snapshot(f.root), state);
  assert.equal(await f.read('unrelated user notes.txt'),'preserve');
});

test('existing configuration, instruction aliases and documentation are preserved exactly', async t => {
  const f = await fixture(t);
  const existing = {
    'AGENTS.md': '# My rules\r\nKeep my architecture.\r\n', 'AGENT.md': '# Alias\n',
    'ARCHITECTURE.md': '# Existing\n', 'docs/INDEX.md': '# Existing index\n',
    'opencode.jsonc': '// preserve comments\n{"model":"owner/model","formatter":false}\n',
    '.opencode/opencode.jsonc': '{"mcp":{"custom":{"enabled":false}},"permission":{"edit":"ask"}}\n',
    'package.json': '{"type":"commonjs","scripts":{"test":"do not execute during install"}}\n',
    '.gitignore': 'node_modules/\r\nAGENT.md\r\n.opencode/\r\n',
  };
  for (const [name,text] of Object.entries(existing)) await f.write(name,text);
  await f.write('packages/client/package.json', JSON.stringify({ scripts: { test: 'never execute this command', lint: 'eslint .' }, dependencies: { react: '*' } }));
  await f.write('service/service.csproj','<Project />');
  const p = await install(f);
  for (const [name,text] of Object.entries(existing)) assert.equal(await f.read(name), name === '.gitignore' ? text + '/.tmp/\n' : text);
  assert.ok(p.profile.instructions.includes('AGENT.md'));
  assert.ok(p.profile.agentSettings.includes('.opencode/opencode.jsonc'));
  assert.ok(p.profile.technologies.some(x => x.name === 'react'));
  assert.ok(p.profile.technologies.some(x => x.name === '.NET'));
  assert.deepEqual(p.profile.commands.find(x => x.command === 'npm run test' && x.source === 'packages/client/package.json').cwd, 'packages/client');
  const health = await doctor(f.root);
  assert.equal(health.status,'PASS',JSON.stringify(health));
  assert.ok(health.warnings.some(w => w.includes('ignore rules hide installed files')));
});

test('owned file conflicts and updates never overwrite user data', async t => {
  const f = await fixture(t);
  await f.write('tools/harness/run.mjs','// Existing user tool\n');
  const p = await preview(f.root);
  assert.ok(p.conflicts.includes('tools/harness/run.mjs'));
  assert.match(p.operations.find(o => o.path === 'tools/harness/run.mjs').diff, /-\/\/ Existing user tool/);
  await assert.rejects(apply(f.root, p.approval), /conflicts/);
  assert.equal(await f.read('tools/harness/run.mjs'),'// Existing user tool\n');
  assert.equal(await readOptional(f.root,'broke-harness.config.json'), null);
});

test('role overrides render consistently; unsupported runtime, capabilities and invariant changes fail closed', async t => {
  const f = await fixture(t);
  const roles = Object.fromEntries(['plan','implement','audit','fix'].map(name => [name, { agent: 'custom-' + name, provider: 'example', model: 'selected-' + name, temperature: 0.2, steps: 20 }]));
  await install(f, { roles });
  const overlay = JSON.parse(await f.read('.broke-harness/opencode.json'));
  for (const [name,role] of Object.entries(roles)) assert.equal(overlay.agent[role.agent].model, `example/selected-${name}`);
  assert.match(await f.read('.opencode/commands/write-plan.md'), /agent: custom-plan\r?\nmodel: example\/selected-plan/);
  assert.match(await f.read('.opencode/commands/start-plan-audit.md'), /agent: custom-audit/);
  assert.match(await f.read('.opencode/commands/start-plan.md'), /agent: broke-orchestrator/);
  assert.deepEqual(Object.keys(overlay.agent['broke-orchestrator'].permission.task), ['*','custom-implement','custom-audit','custom-fix']);
  for (const runtime of ['codex','claude-code','mixed']) await assert.rejects(preview(f.root,{ runtime }), /Choose runtime portable/);
  assert.throws(() => resolveConfiguration({ roles: { audit: { runtime:'codex' } } }), /Unknown/);
  assert.throws(() => resolveConfiguration({ roles: { audit: { tools:['write'] } } }), /Unknown/);
  assert.throws(() => resolveConfiguration({ policy: { auditReadOnly:false } }), /cannot be disabled/);
  assert.throws(() => resolveConfiguration({ schemaVersion:2 }), /schemaVersion/);
  assert.throws(() => resolveConfiguration({ roles: { audit: { agent:'broke-implement' } } }), /unique/);
});

test('traversal, symlinks and secret reads are refused without installation writes', async t => {
  const f = await fixture(t);
  for (const name of ['../escape','a/../b','C:/escape','a\\b','/absolute','a\nfile','a/CON','a/trailing.']) assert.throws(() => relativePath(name), /Unsafe/);
  await assert.rejects(repository(path.join(f.root,'src')), /Git root explicitly/);
  await f.write('.env','THIS_MUST_NEVER_APPEAR_IN_OUTPUT');
  const p = await preview(f.root);
  assert.ok(!JSON.stringify(p).includes('THIS_MUST_NEVER_APPEAR_IN_OUTPUT'));
  await assert.rejects(readOptional(f.root,'.env'), /Secret read refused/);
  const outside = await mkdtemp(path.join(os.tmpdir(),'broke-harness-test-outside-'));
  t.after(async () => { if (path.dirname(outside) !== path.resolve(os.tmpdir()) || !path.basename(outside).startsWith('broke-harness-test-outside-')) throw new Error('Unsafe cleanup'); await rm(outside,{recursive:true,force:true}); });
  await symlink(outside,path.join(f.root,'tools'),process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(preview(f.root), /Symlink boundary/);
  assert.deepEqual(await readdir(outside), []);
});

test('doctor validates a clean install, installed regression suites, policy tampering and idempotency', async t => {
  const f = await fixture(t);
  await install(f);
  const result = await doctor(f.root, { tests:true });
  assert.equal(result.status,'PASS',JSON.stringify(result));
  assert.equal(result.tests.status,0,result.tests.stdout + result.tests.stderr);
  assert.match(result.tests.stdout,/# tests [1-9]\d*\r?\n/);
  assert.match(result.tests.stdout,/# skipped 0\r?\n/);
  assert.ok((await preview(f.root)).operations.every(o => o.action === 'skip'));
  await f.write('.broke-harness/opencode.json',JSON.stringify({ agent:{} }));
  const broken = await doctor(f.root);
  assert.equal(broken.status,'FAIL');
  assert.ok(broken.errors.some(e => e.includes('Unsafe audit')));
});

test('installed lifecycle enforces configured docs, scope, freshness, failure, fingerprint approval and archival', async t => {
  const f = await fixture(t);
  await install(f,{ documentationSync: { rules:[{trigger:['src/**'],require:['docs/API.md']}] } });
  f.commit();
  await f.write(PLAN,planText());
  f.ok('tools/exec-plans/start-plan.mjs',PLAN);
  await f.write('src/main.mjs','export const value = 2;\n');
  f.fail('tools/harness/run.mjs','--plan',PLAN);
  let report = JSON.parse(await f.read('.tmp/harness-report.json'));
  assert.equal(report.contractSync.docsSatisfied,false);
  await f.write('docs/API.md','Value: 2\n');
  f.ok('tools/exec-plans/start-plan.mjs',PLAN);
  f.ok('tools/harness/run.mjs','--plan',PLAN);
  report = JSON.parse(await f.read('.tmp/harness-report.json'));
  assert.equal(report.status,'PASS');
  const diff = JSON.parse(await f.read('.tmp/harness-diff.json'));
  assert.match(diff.patch,/export const value = 2/);
  const args = [PLAN,'--harness','.tmp/harness-report.json','--audit','.tmp/audit-result.json'];
  const audit = syntheticAudit(report);
  await f.write('.tmp/audit-result.json',JSON.stringify(audit));
  assert.match(f.fail('tools/exec-plans/complete-plan.mjs',...args), /Explicit owner completion approval/);
  assert.match(f.fail('tools/exec-plans/complete-plan.mjs',...args,'--approve','sha256:wrong'), /Explicit owner completion approval/);
  await f.write('.tmp/audit-result.json',JSON.stringify({...audit,harnessChangeFingerprint:'sha256:stale'}));
  assert.match(f.fail('tools/exec-plans/complete-plan.mjs',...args,'--approve',report.changeFingerprint), /Audit result is stale/);
  await f.write('.tmp/audit-result.json',JSON.stringify({...audit,generatedAt:'2000-01-01T00:00:00Z'}));
  assert.match(f.fail('tools/exec-plans/complete-plan.mjs',...args,'--approve',report.changeFingerprint), /predates|freshness/);
  await f.write('.tmp/audit-result.json',JSON.stringify(audit));
  await f.write('src/main.mjs','export const value = 3;\n');
  assert.match(f.fail('tools/exec-plans/complete-plan.mjs',...args,'--approve',report.changeFingerprint), /contents do not match/);
  await f.write('src/main.mjs','export const value = 2;\n');
  await f.write('outside.txt','scope violation');
  f.fail('tools/harness/run.mjs','--plan',PLAN);
  assert.deepEqual(JSON.parse(await f.read('.tmp/harness-report.json')).scope.outsideScopeFiles,['outside.txt']);
  await rm(path.join(f.root,'outside.txt'));
  await f.write('src/main.mjs','export const value = ;\n');
  f.fail('tools/harness/run.mjs','--plan',PLAN);
  assert.equal(JSON.parse(await f.read('.tmp/harness-report.json')).verification[0].exitCode,1);
  await f.write('src/main.mjs','export const value = 2;\n');
  f.ok('tools/harness/run.mjs','--plan',PLAN);
  report = JSON.parse(await f.read('.tmp/harness-report.json'));
  await f.write('.tmp/audit-result.json',JSON.stringify(syntheticAudit(report)));
  f.git('config','user.name','Fixture'); f.git('config','user.email','fixture@example.invalid');
  const head = f.git('rev-parse','HEAD');
  f.ok('tools/exec-plans/complete-plan.mjs',...args,'--approve',report.changeFingerprint,'--commit-message','feat: export documented value');
  assert.match(await f.read('docs/exec-plans/archive/demo.md'),/Status: `done`/);
  assert.notEqual(f.git('rev-parse','HEAD'),head);
  assert.equal(f.git('log','-1','--format=%s'),'feat: export documented value');
  assert.equal(f.git('status','--porcelain'),'');
});

test('actual OpenCode plugin hook denies audit writes/shell/MCP/delegation and enforces application scope', async t => {
  const f = await fixture(t);
  await install(f); f.commit();
  await f.write(PLAN,planText()); f.ok('tools/exec-plans/start-plan.mjs',PLAN);
  const { default: plugin } = await import(pathToFileURL(path.join(f.root,'.opencode/plugins/broke-harness.js')));
  const config = JSON.parse(await f.read('broke-harness.config.json'));
  const hooks = await plugin({ directory:f.root, client:{} });
  const effective = { formatter:{ keep:true }, mcp:{ owner:true }, agent:{ unrelated:{ model:'keep' } } };
  await hooks.config(effective);
  assert.equal(effective.formatter.keep,true); assert.equal(effective.mcp.owner,true); assert.equal(effective.agent.unrelated.model,'keep');
  const model = role => ({ providerID:config.roles[role].provider, id:config.roles[role].model });
  await hooks['chat.params']({sessionID:'audit',agent:config.roles.audit.agent,model:model('audit')});
  const before = await f.read('src/main.mjs');
  for (const tool of ['write','edit','apply_patch','bash','task','mcp_write','unknown_tool']) {
    await assert.rejects(hooks['tool.execute.before']({sessionID:'audit',tool,callID:tool},{args:{filePath:'src/main.mjs',content:'COMPROMISED',command:'echo compromised > src/main.mjs',subagent_type:config.roles.fix.agent}}),/Read-only audit denies/);
  }
  assert.equal(await f.read('src/main.mjs'),before);
  await hooks['tool.execute.before']({sessionID:'audit',tool:'read'},{args:{filePath:'src/main.mjs'}});
  await assert.rejects(hooks['tool.execute.before']({sessionID:'audit',tool:'read'},{args:{filePath:'.env'}}),/Secret access denied/);
  await hooks['chat.params']({sessionID:'implement',agent:config.roles.implement.agent,model:model('implement')});
  await hooks['tool.execute.before']({sessionID:'implement',tool:'write'},{args:{filePath:'src/main.mjs',content:'export const value = 2;'}});
  await assert.rejects(hooks['tool.execute.before']({sessionID:'implement',tool:'write'},{args:{filePath:'outside.txt'}}),/outside allowedPaths/);
  await assert.rejects(hooks['tool.execute.before']({sessionID:'implement',tool:'bash'},{args:{command:'node -e "writeAnything()"'}}),/denies bash/);
  await assert.rejects(hooks['tool.execute.before']({sessionID:'implement',tool:'write'},{args:{filePath:'tools/harness/run.mjs'}}),/cannot edit/);
  await assert.rejects(hooks['chat.params']({sessionID:'bad-model',agent:config.roles.audit.agent,model:{providerID:'other',id:'fallback'}}),/unavailable or overridden/);
  await assert.rejects(hooks['tool.execute.before']({sessionID:'no-identity',tool:'write'},{args:{}}),/identity unavailable/);
  await hooks['chat.params']({sessionID:'planner',agent:config.roles.plan.agent,model:model('plan')});
  await assert.rejects(hooks['tool.execute.before']({sessionID:'planner',tool:'write'},{args:{filePath:'src/main.mjs'}}),/cannot edit/);
  await hooks['tool.execute.before']({sessionID:'planner',tool:'write'},{args:{filePath:'docs/exec-plans/active/proposed.md',content:planText('draft')}});
  await assert.rejects(hooks['tool.execute.before']({sessionID:'planner',tool:'write'},{args:{filePath:'docs/exec-plans/active/proposed.md',content:planText('approved')}}),/cannot grant approval/);
  await hooks['chat.params']({sessionID:'orchestrator',agent:'broke-orchestrator',model:model('implement')});
  const invoke = (tool,args,id='call') => hooks['tool.execute.before']({sessionID:'orchestrator',tool,callID:id},{args});
  await assert.rejects(invoke('bash',{command:'git diff; echo bad'}),/Arbitrary shell/);
  await assert.rejects(invoke('task',{subagent_type:config.roles.audit.agent,task_id:'existing'}),/fresh task/);
  await f.write('src/main.mjs','export const value = 2;\n'); await f.write('docs/API.md','Value: 2\n');
  f.ok('tools/harness/run.mjs','--plan',PLAN);
  const args = {subagent_type:config.roles.audit.agent,prompt:'Independent fixture audit',description:'fixture'};
  await hooks['tool.execute.before']({sessionID:'implement',tool:'write'},{args:{filePath:'src/main.mjs'}});
  await invoke('task',{subagent_type:config.roles.implement.agent});
  await invoke('task',args,'audit-call');
  const report = JSON.parse(await f.read('.tmp/harness-report.json'));
  const result = { metadata:{sessionId:'fresh-child'},output:'<task id="fresh-child" state="completed">\n<task_result>\n' + JSON.stringify(syntheticAudit(report)) + '\n</task_result>\n</task>' };
  await hooks['tool.execute.after']({sessionID:'orchestrator',tool:'task',callID:'audit-call',args},result);
  const receipt = JSON.parse(await f.read('.tmp/broke-audit-receipt.json'));
  await invoke('write',{filePath:'.tmp/audit-result.json',content:receipt.auditJSON});
  await assert.rejects(invoke('write',{filePath:'.tmp/audit-result.json',content:JSON.stringify({...JSON.parse(receipt.auditJSON),summary:'forged'})}),/exactly/);
  await assert.rejects(invoke('task',{subagent_type:config.roles.fix.agent}),/independently confirmed/);
  const fixable = { ...syntheticAudit(report), outcome:'fixable', mustFix:[{id:'F-1',severity:'must-fix',title:'Fixture finding',files:['src/main.mjs'],explanation:'Fixture evidence',fixInstructions:'Change only the fixture value'}] };
  const auditResponse = async (audit, callID) => {
    await invoke('task',args,callID);
    await hooks['tool.execute.after']({sessionID:'orchestrator',tool:'task',callID,args},{metadata:{sessionId:'child-' + callID},output:'<task_result>' + JSON.stringify(audit) + '</task_result>'});
  };
  await auditResponse({...fixable,feedbackAssessment:[{point:'Unproven claim',assessment:'unverified',evidence:'No confirming evidence'}]},'feedback');
  await assert.rejects(invoke('task',{subagent_type:config.roles.fix.agent}),/Entire external feedback batch paused/);
  await auditResponse(fixable,'owner-resolved-feedback');
  for (let i=0;i<3;i++) await invoke('task',{subagent_type:config.roles.fix.agent});
  await assert.rejects(invoke('task',{subagent_type:config.roles.fix.agent}),/Three combined fix attempts/);
  const freshHooks = await plugin({directory:f.root,client:{}});
  await freshHooks['chat.params']({sessionID:'resumed',agent:'broke-orchestrator',model:model('implement')});
  await assert.rejects(freshHooks['tool.execute.before']({sessionID:'resumed',tool:'task'},{args:{subagent_type:config.roles.fix.agent}}),/Three combined fix attempts/);
});

test('Git filename detection preserves spaces/Unicode and checks both sides of a rename', async t => {
  const f = await fixture(t); await install(f); f.commit();
  await f.write('src/한글 space.mjs','export const text = "한글";\n');
  const { getChangedFiles, computeChangeFingerprint } = await import(pathToFileURL(path.join(f.root,'tools/harness/change-state.mjs')));
  assert.deepEqual(await getChangedFiles(f.root),['src/한글 space.mjs']);
  assert.match(await computeChangeFingerprint(f.root,await getChangedFiles(f.root)),/^sha256:/);
  f.git('mv','src/main.mjs','src/renamed.mjs');
  const changes = await getChangedFiles(f.root);
  assert.ok(changes.includes('src/main.mjs')); assert.ok(changes.includes('src/renamed.mjs'));
});

test('each documentation rule is enforced independently and Windows glob separators normalize', () => {
  const rules = [{trigger:['src/contracts/**'],require:['docs/API.md']},{trigger:['ui/**'],require:['docs/UI.md']}];
  assert.equal(analyzeContractSync(['src/contracts/type.ts','ui/view.ts','docs/API.md'],rules).docsSatisfied,false);
  assert.equal(analyzeContractSync(['src/contracts/type.ts','ui/view.ts','docs/API.md','docs/UI.md'],rules).docsSatisfied,true);
  assert.equal(analyzeContractSync(['other.txt'],rules).docsRequired,false);
  assert.equal(matchesGlob('src\\nested\\file.ts','src/**/*.ts'),true);
  assert.throws(() => resolveConfiguration({documentationSync:{rules:[{trigger:['../escape'],require:['docs/API.md']}]}}),/Unsafe scope pattern/);
});

test('verification mutations and changed documentation configuration invalidate evidence and resume', async t => {
  const f = await fixture(t); await install(f); f.commit();
  const contract = {...CONTRACT,verify:[`node -e "require('node:fs').appendFileSync('src/main.mjs','//generated')"`]};
  await f.write(PLAN,planText('approved',contract)); f.ok('tools/exec-plans/start-plan.mjs',PLAN);
  await f.write('src/main.mjs','export const value = 2;\n'); await f.write('docs/API.md','Value: 2\n');
  f.fail('tools/harness/run.mjs','--plan',PLAN);
  const report = JSON.parse(await f.read('.tmp/harness-report.json'));
  assert.ok(report.issues.some(i => i.includes('Verification changed the worktree')));
  const config = JSON.parse(await f.read('broke-harness.config.json'));
  config.documentationSync.rules = [{trigger:['src/**'],require:['docs/API.md']}];
  await f.write('broke-harness.config.json',JSON.stringify(config));
  assert.match(f.fail('tools/harness/run.mjs','--plan',PLAN),/configuration changed since starting/);
});

test('CLI inspector, approval gate, install and doctor work with space-containing absolute target paths', async t => {
  const f = await fixture(t);
  const scriptRoot = path.resolve('skill/broke-harness/scripts');
  const invoke = (script,args=[]) => {
    const env = {...process.env}; delete env.NODE_TEST_CONTEXT;
    return spawnSync(process.execPath,[path.join(scriptRoot,script),'--target',f.root,...args],{encoding:'utf8',env,timeout:30000});
  };
  const info = invoke('inspect.mjs'); assert.equal(info.status,0,info.stderr); assert.equal(JSON.parse(info.stdout).root,f.root);
  const dry = invoke('install.mjs',['--dry-run']); assert.equal(dry.status,0,dry.stderr);
  const manifest = JSON.parse(dry.stdout);
  const denied = invoke('install.mjs'); assert.equal(denied.status,1); assert.match(denied.stderr,/requires --dry-run review/);
  const installed = invoke('install.mjs',['--approve',manifest.approval]); assert.equal(installed.status,0,installed.stderr);
  const checked = invoke('doctor.mjs'); assert.equal(checked.status,0,checked.stdout + checked.stderr); assert.equal(JSON.parse(checked.stdout).status,'PASS');
});

test('existing runtime role definitions conflict and core refuses symlinked evidence directories', async t => {
  const f = await fixture(t);
  await f.write('.opencode/agents/broke-audit.md','---\nmode: subagent\n---\nexisting user role');
  const proposed = await preview(f.root, { runtime:'opencode' });
  assert.ok(proposed.conflicts.some(p => p.includes('existing role definition')));
  await assert.rejects(apply(f.root,proposed.approval,{ runtime:'opencode' }),/conflicts/);
  await rm(path.join(f.root,'.opencode/agents/broke-audit.md'));
  await install(f); f.commit(); await f.write(PLAN,planText());
  const outside = path.join(f.root,'outside-artifacts'); await mkdir(outside);
  await symlink(outside,path.join(f.root,'.tmp'),process.platform === 'win32' ? 'junction' : 'dir');
  assert.match(f.fail('tools/exec-plans/start-plan.mjs',PLAN),/Symlink boundary refused/);
  assert.deepEqual(await readdir(outside),[]);
});
