// Installed beside lib/ and imported by the local OpenCode plugin. No model SDK dependency.
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { readFile, readdir, writeFile, mkdir, open, unlink } from 'node:fs/promises';
import { safePath, relativePath, secretPath, json } from '../../lib/safe-files.mjs';
import { matchesGlob, parseHarnessContract, parseAcceptanceCriteria } from '../../../tools/harness/run.mjs';
import { getHeadRevision, getChangedFiles, computeChangeFingerprint } from '../../../tools/harness/change-state.mjs';
import { checkPlanState } from '../../../tools/exec-plans/plan-state.mjs';
import { validateCompletionArtifacts, validatePassingHarness } from '../../../tools/exec-plans/complete-plan.mjs';

const READ = new Set(['read','glob','grep','list']);
const EDIT = new Set(['write','edit']); // apply_patch is denied: it can encode additional paths.
const protectedPath = p => secretPath(p) || /^(?:\.git(?:ignore|attributes)?|\.tmp|\.broke-harness|\.opencode|tools\/(?:harness|exec-plans)|broke-harness\.config\.json|opencode\.jsonc?)(?:\/|$)/.test(p);
const PLAN = /^docs\/exec-plans\/active\/[a-zA-Z0-9._-]+\.md$/;

async function load(root, name) { return JSON.parse(await readFile(await safePath(root, name), 'utf8')); }
async function requireInitialImplementation(root, plan) {
  let report;
  try { report = await load(root, '.tmp/harness-report.json'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (report?.planPath === plan.planPath && report.headRevision === await getHeadRevision(root)) throw new Error('After the first harness run, application corrections require the bounded fixer role');
}
async function active(root) {
  const dir = await safePath(root, 'docs/exec-plans/active');
  const results = [];
  for (const file of (await readdir(dir)).sort()) {
    if (!file.endsWith('.md')) continue;
    const planPath = `docs/exec-plans/active/${file}`;
    const text = await readFile(await safePath(root, planPath), 'utf8');
    if (/^- Status: `in-progress`\s*$/m.test(text)) results.push({ planPath, text, contract: parseHarnessContract(text) });
  }
  if (results.length !== 1) throw new Error('Exactly one in-progress plan is required for application edits/delegation');
  const plan = results[0];
  const state = await checkPlanState(root, plan.planPath, await getHeadRevision(root), plan.contract, parseAcceptanceCriteria(plan.text));
  if (!state) throw new Error('Pinned start state required');
  return plan;
}
export function roleFor(config, agent) { return agent === 'broke-orchestrator' ? 'orchestrator' : Object.keys(config.roles).find(r => config.roles[r].agent === agent); }
export async function authorize({ root, config, role, tool, args }) {
  if (!role) throw new Error('Agent identity unavailable; denying tool execution');
  if (READ.has(tool)) {
    const requested = args.filePath ?? args.path ?? '.';
    if (requested !== '.') {
      const relative = path.isAbsolute(requested) ? path.relative(root, requested).split(path.sep).join('/') : requested.replace(/\\/g, '/');
      if (secretPath(relative)) throw new Error('Secret access denied');
      await safePath(root, relative);
    }
    // Grep can otherwise read secret content recursively; only explicit regular files are allowed.
    if (tool === 'grep') throw new Error('Recursive grep denied; use glob then read explicit non-secret files');
    return;
  }
  if (role === 'audit') throw new Error(`Read-only audit denies ${tool}`);
  if (EDIT.has(tool)) {
    const value = args.filePath;
    if (typeof value !== 'string') throw new Error('Explicit filePath required');
    const file = relativePath(path.isAbsolute(value) ? path.relative(root, value).split(path.sep).join('/') : value.replace(/\\/g, '/'));
    await safePath(root, file);
    if (role === 'orchestrator' && file === '.tmp/audit-result.json') {
      // Orchestrator persists only a validated audit, returned by an independently observed task.
      if (tool !== 'write') throw new Error('Persist the entire audit JSON with write');
      const audit = JSON.parse(args.content);
      const receipt = await load(root, '.tmp/broke-audit-receipt.json');
      if (receipt.auditJSON !== JSON.stringify(audit)) throw new Error('Audit must match the independent task result exactly');
      return;
    }
    if (role === 'plan' && PLAN.test(file)) {
      let existing;
      try { existing = await readFile(await safePath(root, file), 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (existing && ((existing.match(/^- Status:/gm) ?? []).length !== 1 || !/^- Status: `draft`\s*$/m.test(existing))) throw new Error('Planner may edit only proposed draft plans');
      if (tool !== 'write' || (args.content.match(/^- Status:/gm) ?? []).length !== 1 || !/^- Status: `draft`\s*$/m.test(args.content)) throw new Error('Planner must write an entire draft plan and cannot grant approval');
      return;
    }
    if (!['implement','fix'].includes(role) || protectedPath(file) || file.startsWith('docs/exec-plans/')) throw new Error(`Role cannot edit ${file}`);
    const plan = await active(root);
    if (role === 'implement') await requireInitialImplementation(root, plan);
    if (!plan.contract.allowedPaths.some(p => matchesGlob(file, p))) throw new Error(`Edit outside allowedPaths denied: ${file}`);
    return;
  }
  if (role === 'orchestrator' && tool === 'task') {
    const selected = Object.keys(config.roles).find(r => config.roles[r].agent === args.subagent_type);
    if (!['implement','fix','audit'].includes(selected) || args.background) throw new Error('Only foreground harness role delegation is permitted');
    const plan = await active(root);
    if (selected === 'implement') await requireInitialImplementation(root, plan);
    if (selected === 'audit') {
      if (args.task_id) throw new Error('Independent audit requires a fresh task without task_id');
      const report = await load(root, '.tmp/harness-report.json');
      const fingerprint = await computeChangeFingerprint(root, await getChangedFiles(root));
      validatePassingHarness(report);
      const age = Date.now() - Date.parse(report.generatedAt);
      if (report.status !== 'PASS' || report.baseRef !== null || report.ci !== false || report.planStatus !== 'in-progress' || report.planPath !== plan.planPath || report.changeFingerprint !== fingerprint || report.headRevision !== await getHeadRevision(root) || !Number.isFinite(age) || age < 0 || age > 86400000 || !isDeepStrictEqual(report.harnessContract, plan.contract) || !isDeepStrictEqual(report.acceptanceCriteria, parseAcceptanceCriteria(plan.text))) throw new Error('Fresh passing local harness required for independent audit');
    }
    if (selected === 'fix') {
      const report = await load(root, '.tmp/harness-report.json');
      const fingerprint = await computeChangeFingerprint(root, await getChangedFiles(root));
      if (report.changeFingerprint !== fingerprint || report.planPath !== plan.planPath || report.headRevision !== await getHeadRevision(root)) throw new Error('Fix requires current harness evidence');
      let review;
      try { review = await load(root, '.tmp/broke-review-state.json'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      const currentReview = review?.fingerprint === fingerprint && review?.harnessGeneratedAt === report.generatedAt;
      if (currentReview && review.audit.feedbackAssessment.some(p => p.assessment !== 'confirmed')) throw new Error('Entire external feedback batch paused; explicit owner direction and fresh assessment required before any fix');
      const verificationFailure = report.status === 'FAIL' && report.issues.length === 0 && report.scope.hasDivergence === false && report.verification.some(v => v.status === 'FAIL');
      const auditedFinding = currentReview && review.audit.outcome === 'fixable' && [...review.audit.mustFix, ...review.audit.shouldFix].length > 0;
      if (!verificationFailure && !auditedFinding) throw new Error('Fix requires failed verification or independently confirmed actionable findings');
      await mkdir(await safePath(root, '.tmp'), { recursive: true });
      const lockPath = await safePath(root, '.tmp/broke-fix.lock');
      const lock = await open(lockPath, 'wx').catch(() => { throw new Error('Concurrent fix delegation or stale lock; stop for owner inspection'); });
      try {
      const stateFile = '.tmp/broke-fix-attempts.json';
      let state;
      try { state = await load(root, stateFile); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      const head = await getHeadRevision(root);
      if (!state || state.planPath !== plan.planPath || state.head !== head) state = { planPath: plan.planPath, head, attempts: 0 };
      if (state.attempts >= 3) throw new Error('Three combined fix attempts exhausted; owner direction required');
      state.attempts++;
      await mkdir(await safePath(root, '.tmp'), { recursive: true });
      await writeFile(await safePath(root, stateFile), json(state));
      } finally { await lock.close(); await unlink(lockPath); }
    }
    return;
  }
  if (role === 'orchestrator' && tool === 'bash') {
    const command = args.command;
    // Strict grammar deliberately excludes shell operators, substitutions and arbitrary verify strings.
    if (typeof command !== 'string' || /[\r\n;&|`$<>]/.test(command)) throw new Error('Arbitrary shell denied');
    const planPattern = 'docs/exec-plans/active/[a-zA-Z0-9._-]+\\.md';
    if (new RegExp(`^node tools/exec-plans/start-plan\\.mjs ${planPattern}$`).test(command) || new RegExp(`^node tools/harness/run\\.mjs --plan ${planPattern}$`).test(command)) return;
    if (new RegExp(`^node tools/exec-plans/complete-plan\\.mjs ${planPattern} --harness \\.tmp/harness-report\\.json --audit \\.tmp/audit-result\\.json --approve sha256:[a-f0-9]{64}$`).test(command)) return;
    throw new Error('Only exact canonical lifecycle commands are permitted');
  }
  throw new Error(`Role ${role} denies ${tool}`);
}

export async function persistAuditReceipt(root, config, input, output, pending) {
  if (input.tool !== 'task' || input.args.subagent_type !== config.roles.audit.agent) return;
  const taskID = output.metadata?.sessionId;
  if (!taskID || taskID === input.sessionID) throw new Error('Independent child session receipt unavailable');
  const text = output.output.match(/<task_result>([\s\S]*?)<\/task_result>/)?.[1] ?? output.output.match(/<task_result>([\s\S]*)$/)?.[1];
  if (!text) throw new Error('Unsupported task output format; audit not accepted');
  const audit = JSON.parse(text.trim());
  const report = await load(root, '.tmp/harness-report.json');
  if (!pending || pending.fingerprint !== report.changeFingerprint || pending.generatedAt !== report.generatedAt) throw new Error('Harness changed during independent audit');
  if (!['clean','fixable','blocked'].includes(audit.outcome) || ['mustFix','shouldFix','acceptableRisk','acceptanceEvidence','feedbackAssessment'].some(k => !Array.isArray(audit[k])) || typeof audit.summary !== 'string' || !audit.summary.trim()) throw new Error('Malformed structured audit');
  for (const point of audit.feedbackAssessment) {
    if (!point || typeof point.point !== 'string' || !point.point.trim() || !['confirmed','unsupported','unverified','out-of-scope'].includes(point.assessment) || typeof point.evidence !== 'string' || !point.evidence.trim()) throw new Error('Malformed feedback assessment');
  }
  for (const [field, severity] of [['mustFix','must-fix'],['shouldFix','should-fix']]) for (const finding of audit[field]) {
    if (!finding || finding.severity !== severity || ['id','title','explanation','fixInstructions'].some(k => typeof finding[k] !== 'string' || !finding[k].trim()) || !Array.isArray(finding.files) || !finding.files.length || finding.files.some(file => typeof file !== 'string' || !report.harnessContract.allowedPaths.some(p => matchesGlob(file,p)))) throw new Error('Malformed or out-of-scope actionable finding');
  }
  await writeFile(await safePath(root, '.tmp/broke-review-state.json'), json({ taskID, fingerprint: report.changeFingerprint, harnessGeneratedAt: report.generatedAt, audit }));
  if (audit.outcome !== 'clean') return; // Findings go back to the orchestrator; no completion receipt.
  Object.assign(audit, { generatedAt: new Date().toISOString(), planPath: report.planPath, harnessGeneratedAt: report.generatedAt, harnessChangeFingerprint: report.changeFingerprint });
  const plan = await active(root);
  validateCompletionArtifacts({ harnessReport: report, auditResult: audit, currentHeadRevision: await getHeadRevision(root), currentChangeFingerprint: await computeChangeFingerprint(root, await getChangedFiles(root)), planPath: plan.planPath, planText: plan.text });
  await writeFile(await safePath(root, '.tmp/broke-audit-receipt.json'), json({ taskID, auditJSON: JSON.stringify(audit) }));
  output.output += '\nPersist this exact validated audit object to .tmp/audit-result.json using write:\n' + json(audit);
}
