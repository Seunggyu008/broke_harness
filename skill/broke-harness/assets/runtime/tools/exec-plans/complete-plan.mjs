#!/usr/bin/env node

import { lstat, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  computeChangeFingerprint,
  getChangedFiles,
  getHeadRevision,
  assertSafeRepoPath,
  runProcess,
} from "../harness/change-state.mjs";
import {
  analyzeContractSync,
  matchesGlob,
  parseAcceptanceCriteria,
  parseHarnessContract,
  validateContract,
} from "../harness/run.mjs";
import { checkPlanState } from "./plan-state.mjs";

const MAX_ARTIFACT_AGE_MS = 24 * 60 * 60 * 1000;
const ACCEPTANCE_EVIDENCE_TYPES = new Set(["automated", "manual", "audit"]);
const ACTIVE_PLAN_PREFIX = "docs/exec-plans/active/";
const ARCHIVE_PLAN_PREFIX = "docs/exec-plans/archive/";
const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..", "..");

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const plan = resolveRepoPath(options.plan);
  if (!plan.relativePath.endsWith(".md")) {
    throw new Error(`Plan path must point to a Markdown file: ${plan.relativePath}`);
  }
  const archivePlan = resolveRepoPath(getArchivePlanPath(plan.relativePath));

  const harness = resolveRepoPath(options.harness);
  const audit = resolveRepoPath(options.audit);
  for (const item of [plan, archivePlan, harness, audit]) await assertSafeRepoPath(repoRoot, item.relativePath);
  const [planText, harnessReport, auditResult] = await Promise.all([
    readFile(plan.absolutePath, "utf8"),
    readJson(harness.absolutePath, "Harness report"),
    readJson(audit.absolutePath, "Audit result"),
  ]);

  const statusMatch = planText.match(/^- Status:\s*`([^`]+)`\s*$/m);
  if (!statusMatch) {
    throw new Error(`Plan ${plan.relativePath} is missing a \`Status\` field.`);
  }

  const currentStatus = statusMatch[1].trim();
  if (currentStatus !== "in-progress") {
    throw new Error(
      `Plan ${plan.relativePath} can only be completed from in-progress. Current status: ${currentStatus}.`,
    );
  }

  const changedFiles = await getChangedFiles(repoRoot);
  const currentHeadRevision = await getHeadRevision(repoRoot);
  await checkPlanState(
    repoRoot,
    plan.relativePath,
    currentHeadRevision,
    parseHarnessContract(planText),
    parseAcceptanceCriteria(planText),
  );
  const currentChangeFingerprint = await computeChangeFingerprint(
    repoRoot,
    changedFiles,
  );

  validateCompletionArtifacts({
    auditResult,
    currentChangeFingerprint,
    currentHeadRevision,
    harnessReport,
    planPath: plan.relativePath,
    planText,
  });

  if (options.approve !== currentChangeFingerprint) {
    throw new Error('Explicit owner completion approval required: pass --approve <current change fingerprint> only after approval in a separate user turn.');
  }

  // HEAD determines whether archival must commit a deletion. A newly staged
  // plan must instead be removed from the index once its archive is written.
  const tracking = options.commitMessage ? await Promise.all([
    runProcess("git", ["--literal-pathspecs", "ls-tree", "-r", "--name-only", "-z", "HEAD", "--", plan.relativePath], repoRoot),
    runProcess("git", ["--literal-pathspecs", "ls-files", "--cached", "-z", "--", plan.relativePath], repoRoot),
  ]) : [];
  const planInHead = Boolean(tracking[0]?.stdout.length);
  const planInIndex = Boolean(tracking[1]?.stdout.length);

  const updatedText = planText.replace(
    /^(- Status:\s*`)[^`]+(`\s*)$/m,
    "$1done$2",
  );

  try {
    await writeFile(archivePlan.absolutePath, updatedText, {
      encoding: "utf8",
      flag: "wx",
    });
    await unlink(plan.absolutePath);
  } catch (error) {
    throw new Error(
      `Plan could not be completed and archived to ${archivePlan.relativePath}: ${error.message}`,
    );
  }
  let gitResult = "No Git mutations were performed.";
  if (options.commitMessage) {
    const commitFiles = [...new Set([
      ...changedFiles.filter(file => file !== plan.relativePath),
      ...(planInHead ? [plan.relativePath] : []),
      archivePlan.relativePath,
    ])];
    try {
      const pending = await getChangedFiles(repoRoot);
      if (await getHeadRevision(repoRoot) !== currentHeadRevision || pending.some(file => file !== plan.relativePath && !commitFiles.includes(file))) {
        throw new Error("Git baseline or pending paths changed during completion; inspect the repository before committing.");
      }
      const fingerprint = await computeChangeFingerprint(repoRoot, commitFiles);
      const addCandidates = [...new Set([...commitFiles, ...(planInIndex ? [plan.relativePath] : [])])];
      const indexed = await runProcess("git", ["--literal-pathspecs", "ls-files", "--cached", "-z", "--", ...addCandidates], repoRoot);
      const indexPaths = new Set(indexed.stdout.split("\0"));
      const addFiles = [];
      for (const file of addCandidates) {
        // Already staged deletions have no index/worktree entry to add again.
        if (indexPaths.has(file)) { addFiles.push(file); continue; }
        try { await lstat(path.join(repoRoot, file)); addFiles.push(file); }
        catch (error) { if (error.code !== "ENOENT") throw error; }
      }
      await runProcess("git", ["--literal-pathspecs", "add", "--all", "--", ...addFiles], repoRoot);
      if (await computeChangeFingerprint(repoRoot, commitFiles) !== fingerprint) {
        throw new Error("Completed files changed while staging; review and verify them before committing.");
      }
      // --only excludes unrelated index entries, including ones staged concurrently.
      await runProcess("git", ["--literal-pathspecs", "commit", "--only", "-m", options.commitMessage, "--", ...commitFiles], repoRoot);
      gitResult = `Committed as ${await getHeadRevision(repoRoot)}: ${options.commitMessage}`;
    } catch (error) {
      throw new Error(`Completion gate passed and the plan is archived at ${archivePlan.relativePath}, but the Git commit failed: ${error.message} Files and any staging are preserved; inspect Git status and finish the scoped commit without rerunning the completion gate.`);
    }
  }
  console.log(
    `Plan status updated: in-progress -> done and archived to ${archivePlan.relativePath}; harness and audit evidence is fresh for ${currentChangeFingerprint}. ${gitResult}`,
  );
}

export function getArchivePlanPath(planPath) {
  const normalized = normalizePath(planPath);
  if (
    !normalized.startsWith(ACTIVE_PLAN_PREFIX) ||
    normalized.slice(ACTIVE_PLAN_PREFIX.length).includes("/")
  ) {
    throw new Error(
      `Completion requires a direct child of ${ACTIVE_PLAN_PREFIX}: ${planPath}`,
    );
  }

  return `${ARCHIVE_PLAN_PREFIX}${normalized.slice(ACTIVE_PLAN_PREFIX.length)}`;
}

export function parseArgs(argv) {
  const options = {
    audit: null,
    harness: null,
    plan: null,
  };

  if (argv.length > 0 && !argv[0].startsWith("--")) {
    options.plan = argv[0];
  }

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--harness") {
      options.harness = requireValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--audit") {
      options.audit = requireValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--approve') {
      options.approve = requireValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === '--commit-message') {
      options.commitMessage = requireValue(arg, argv[index + 1]);
      if (!options.commitMessage.trim() || /[\x00-\x1f\x7f]/.test(options.commitMessage)) {
        throw new Error('Commit message must be a non-empty single line without control characters.');
      }
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.plan || !options.harness || !options.audit) {
    throw new Error(
      "Usage: node tools/exec-plans/complete-plan.mjs <plan-path> --harness <report-path> --audit <result-path> --approve <fingerprint> [--commit-message <message>]",
    );
  }

  return options;
}

export function validateCompletionArtifacts({
  auditResult,
  currentChangeFingerprint,
  currentHeadRevision,
  harnessReport,
  nowMs = Date.now(),
  planPath,
  planText,
}) {
  if (
    !harnessReport || typeof harnessReport !== "object"
  ) {
    throw new Error("Completion requires a harness JSON object.");
  }
  if (harnessReport.status !== "PASS") {
    throw new Error("Plan completion requires a passing harness report.");
  }

  if (harnessReport.baseRef !== null) {
    throw new Error(
      "Plan completion requires a local-worktree harness report, not a base-ref comparison.",
    );
  }

  if (harnessReport.ci !== false || harnessReport.planStatus !== "in-progress") {
    throw new Error("Completion requires a local execution report for an in-progress plan.");
  }
  if (
    typeof harnessReport.headRevision !== "string" || !harnessReport.headRevision ||
    (currentHeadRevision !== undefined && harnessReport.headRevision !== currentHeadRevision)
  ) {
    throw new Error("Harness report is stale because the starting revision changed. Rerun the harness and audit.");
  }

  if (harnessReport.planPath !== planPath) {
    throw new Error(
      `Harness report is for ${harnessReport.planPath ?? "an unknown plan"}, not ${planPath}.`,
    );
  }

  validatePassingHarness(harnessReport);
  if (
    planText !== undefined && (
      !isDeepStrictEqual(harnessReport.harnessContract, parseHarnessContract(planText)) ||
      !isDeepStrictEqual(harnessReport.acceptanceCriteria, parseAcceptanceCriteria(planText))
    )
  ) {
    throw new Error("Harness contract or acceptance criteria do not match the current plan. Rerun the harness and audit.");
  }

  if (
    typeof harnessReport.changeFingerprint !== "string" ||
    harnessReport.changeFingerprint !== currentChangeFingerprint
  ) {
    throw new Error(
      "Harness report is stale because the current changed-file contents do not match its fingerprint. Rerun the harness and audit.",
    );
  }

  const harnessGeneratedAt = parseTimestamp(harnessReport.generatedAt, 'Harness report');
  const harnessAge = nowMs - harnessGeneratedAt;
  if (harnessAge < 0 || harnessAge > MAX_ARTIFACT_AGE_MS) throw new Error('Harness report is outside the 24-hour completion freshness window.');
  if (!Array.isArray(harnessReport.acceptanceCriteria) || !harnessReport.acceptanceCriteria.length || harnessReport.acceptanceCriteria.some((item, index) => !item || item.id !== `AC-${index + 1}` || typeof item.text !== 'string' || !item.text.trim())) throw new Error('Harness acceptance criteria must contain unique ordered AC IDs and non-empty text.');
  if (!auditResult || typeof auditResult !== 'object' || Array.isArray(auditResult)) {
    throw new Error('Completion requires a structured audit JSON object.');
  }
  if (auditResult.outcome !== "clean") {
    throw new Error("Plan completion requires a clean structured audit result.");
  }

  for (const field of ["mustFix", "shouldFix", "acceptableRisk", "feedbackAssessment"]) {
    if (!Array.isArray(auditResult[field])) {
      throw new Error(`Structured audit is missing the ${field} array.`);
    }
  }
  if (auditResult.mustFix.length || auditResult.shouldFix.length) {
    throw new Error("A clean audit must have empty mustFix and shouldFix arrays.");
  }
  if (typeof auditResult.summary !== "string" || !auditResult.summary.trim()) {
    throw new Error("Structured audit requires a non-empty summary.");
  }
  for (const item of auditResult.feedbackAssessment) {
    if (
      !item || typeof item.point !== "string" || !item.point.trim() ||
      !["confirmed", "unsupported", "unverified", "out-of-scope"].includes(item.assessment) ||
      typeof item.evidence !== "string" || !item.evidence.trim()
    ) {
      throw new Error("Structured audit contains malformed feedback assessment evidence.");
    }
    if (item.assessment !== 'confirmed') throw new Error('Unresolved external feedback batch requires explicit owner direction and a fresh assessment before completion.');
  }

  if (auditResult.planPath !== planPath) {
    throw new Error(
      `Audit result is for ${auditResult.planPath ?? "an unknown plan"}, not ${planPath}.`,
    );
  }

  if (auditResult.harnessChangeFingerprint !== currentChangeFingerprint) {
    throw new Error(
      "Audit result is stale because it was not produced from the current passing harness report.",
    );
  }

  validateAcceptanceEvidence(harnessReport, auditResult);

  const auditGeneratedAt = parseTimestamp(auditResult.generatedAt, "Audit result");
  const auditHarnessGeneratedAt = parseTimestamp(
    auditResult.harnessGeneratedAt,
    "Audit harness reference",
  );

  if (auditHarnessGeneratedAt !== harnessGeneratedAt) {
    throw new Error(
      "Audit result references a different harness run. Rerun the audit against the latest harness report.",
    );
  }

  if (auditGeneratedAt < harnessGeneratedAt) {
    throw new Error("Audit result predates the harness report.");
  }

  const auditAge = nowMs - auditGeneratedAt;
  if (auditAge < 0 || auditAge > MAX_ARTIFACT_AGE_MS) {
    throw new Error("Audit result is outside the 24-hour completion freshness window.");
  }
}

export function validatePassingHarness(report) {
  validateContract(report.harnessContract, report.planPath);
  for (const field of ["changedFiles", "scopeFiles", "issues"]) {
    if (!Array.isArray(report[field])) {
      throw new Error(`Passing harness report is missing the ${field} array.`);
    }
  }
  for (const field of ["changedFiles", "scopeFiles"]) {
    if (
      report[field].some((file) => typeof file !== "string" || !file.trim()) ||
      new Set(report[field]).size !== report[field].length
    ) {
      throw new Error(`Passing harness report contains invalid ${field}.`);
    }
  }
  const expectedScopeFiles = report.changedFiles.filter((file) => file !== report.planPath);
  if (
    !report.scopeFiles.length || !isDeepStrictEqual(report.scopeFiles, expectedScopeFiles) ||
    report.scopeFiles.some(
      (file) => !report.harnessContract.allowedPaths.some((pattern) => matchesGlob(file, pattern)),
    ) ||
    report.scope?.hasDivergence !== false || !Array.isArray(report.scope.outsideScopeFiles) ||
    report.scope.outsideScopeFiles.length || report.issues.length
  ) {
    throw new Error("Passing harness report contains scope divergence, issues, or inconsistent scope files.");
  }
  const docsChanged = report.scopeFiles.some((file) => file.endsWith(".md"));
  if (
    report.docsChanged !== docsChanged || (report.harnessContract.requiresDocs && !docsChanged) ||
    !isDeepStrictEqual(report.contractSync, analyzeContractSync(report.scopeFiles)) ||
    report.contractSync.docsSatisfied !== true
  ) {
    throw new Error("Passing harness report contains missing or inconsistent documentation evidence.");
  }
  if (
    !Array.isArray(report.verification) || report.verification.length !== report.harnessContract.verify.length ||
    report.verification.some(
      (result, index) => !result || result.command !== report.harnessContract.verify[index] ||
        result.status !== "PASS" || result.exitCode !== 0,
    )
  ) {
    throw new Error("Passing harness report must contain a successful result for every required verification command in order.");
  }
}

export function validateAcceptanceEvidence(harnessReport, auditResult) {
  const criteria = harnessReport.acceptanceCriteria;
  if (!Array.isArray(criteria) || criteria.length === 0) {
    throw new Error(
      "Plan completion requires a harness report with acceptance criteria.",
    );
  }
  if (criteria.some(
    (item, index) => !item || item.id !== `AC-${index + 1}` ||
      typeof item.text !== "string" || !item.text.trim(),
  )) {
    throw new Error("Harness acceptance criteria must contain unique ordered AC IDs and non-empty text.");
  }

  const evidence = auditResult.acceptanceEvidence;
  if (!Array.isArray(evidence)) {
    throw new Error(
      "Plan completion requires criterion-level acceptance evidence from the structured audit.",
    );
  }

  if (evidence.length !== criteria.length) {
    throw new Error(
      `Acceptance evidence count does not match the harness criteria (${evidence.length} of ${criteria.length}).`,
    );
  }

  const evidenceById = new Map();
  for (const item of evidence) {
    if (!item || typeof item !== "object" || evidenceById.has(item.criterionId)) {
      throw new Error("Acceptance evidence must contain one unique record per criterion.");
    }
    evidenceById.set(item.criterionId, item);
  }

  for (const criterion of criteria) {
    const item = evidenceById.get(criterion.id);
    if (!item) {
      throw new Error(`Acceptance evidence is missing ${criterion.id}.`);
    }

    if (item.status !== "verified") {
      throw new Error(`Acceptance criterion ${criterion.id} is not verified.`);
    }

    if (!ACCEPTANCE_EVIDENCE_TYPES.has(item.evidenceType)) {
      throw new Error(`Acceptance criterion ${criterion.id} has an invalid evidence type.`);
    }

    if (typeof item.evidence !== "string" || item.evidence.trim() === "") {
      throw new Error(`Acceptance criterion ${criterion.id} is missing evidence.`);
    }
  }
}

async function readJson(filePath, label) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(
      `${label} could not be read from ${normalizePath(filePath)}: ${error.message}`,
    );
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function parseTimestamp(value, label) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${label} is missing a valid generatedAt timestamp.`);
  }
  return timestamp;
}

function requireValue(flag, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function resolveRepoPath(targetPath) {
  const absolutePath = path.resolve(repoRoot, targetPath);
  const relativePath = normalizePath(path.relative(repoRoot, absolutePath));

  if (!relativePath || relativePath.startsWith("../")) {
    throw new Error(`Path must stay within the repository: ${targetPath}`);
  }

  return { absolutePath, relativePath };
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
