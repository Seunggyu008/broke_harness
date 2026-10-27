#!/usr/bin/env node

import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import {
  computeChangeFingerprint,
  getChangedFiles,
  getHeadRevision,
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
  console.log(
    `Plan status updated: in-progress -> done and archived to ${archivePlan.relativePath}; harness and audit artifacts are fresh for ${currentChangeFingerprint}.`,
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

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.plan || !options.harness || !options.audit) {
    throw new Error(
      "Usage: node tools/exec-plans/complete-plan.mjs <plan-path> --harness <report-path> --audit <result-path>",
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
    !harnessReport || typeof harnessReport !== "object" ||
    !auditResult || typeof auditResult !== "object"
  ) {
    throw new Error("Completion requires harness and audit JSON objects.");
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

  const harnessGeneratedAt = parseTimestamp(
    harnessReport.generatedAt,
    "Harness report",
  );
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

  for (const [label, generatedAt] of [
    ["Harness report", harnessGeneratedAt],
    ["Audit result", auditGeneratedAt],
  ]) {
    const ageMs = nowMs - generatedAt;
    if (ageMs < 0 || ageMs > MAX_ARTIFACT_AGE_MS) {
      throw new Error(
        `${label} is outside the 24-hour completion freshness window.`,
      );
    }
  }
}

function validatePassingHarness(report) {
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
