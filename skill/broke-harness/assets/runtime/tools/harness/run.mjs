#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync, lstatSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  computeChangeFingerprint,
  getChangedFiles,
  getHeadRevision,
  assertSafeRepoPath,
} from "./change-state.mjs";
import { checkPlanState } from "../exec-plans/plan-state.mjs";

const PASS = "PASS";
const FAIL = "FAIL";
const ACTIVE_PLAN_PREFIX = "docs/exec-plans/active/";
const ARCHIVE_PLAN_PREFIX = "docs/exec-plans/archive/";
const REPORT_DIR = ".tmp";
const REPORT_JSON_PATH = `${REPORT_DIR}/harness-report.json`;
const REPORT_MD_PATH = `${REPORT_DIR}/harness-summary.md`;
const DIAGNOSTIC_EXCERPT_CHARS = 4000;
const ALLOWED_PLAN_STATUSES = new Set(["approved", "in-progress"]);
const scriptPath = fileURLToPath(import.meta.url);

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      printUsage();
      return;
    }

    const repoRoot = await getRepoRoot();
    process.chdir(repoRoot);

    const changedFiles = await getChangedFiles(repoRoot, options.base);
    const headRevision = await getHeadRevision(repoRoot);
    const changeFingerprint = await computeChangeFingerprint(repoRoot, changedFiles);
    const diagnosticDir = path.join(
      REPORT_DIR,
      "harness",
      createArtifactId(),
    );
    const planPath = options.plan
      ? resolveRepoPath(repoRoot, options.plan)
      : await autoDetectPlanPath(repoRoot, changedFiles, options.ci);
    const planText = await readFile(await assertSafeRepoPath(repoRoot, planPath), "utf8");
    const planStatus = parsePlanStatus(planText);
    const contract = parseHarnessContract(planText);
    const acceptanceCriteria = parseAcceptanceCriteria(planText);

    validatePlanStatus(planStatus, planPath, options.ci);
    validateContract(contract, planPath);
    if (!options.base) {
      await checkPlanState(repoRoot, planPath, headRevision, contract, acceptanceCriteria);
    }

    const lifecyclePaths = [planPath];
    if (options.ci && planPath.startsWith(ARCHIVE_PLAN_PREFIX)) {
      lifecyclePaths.push(planPath.replace(ARCHIVE_PLAN_PREFIX, ACTIVE_PLAN_PREFIX));
    }
    const scopeFiles = changedFiles.filter((file) => !lifecyclePaths.includes(file));
    const outsideScopeFiles = scopeFiles.filter((file) => !matchesAny(file, contract.allowedPaths));
    const scope = {
      hasDivergence: outsideScopeFiles.length > 0,
      outsideScopeFiles,
    };
    const docsChanged = scopeFiles.some(isMarkdownFile);
    const contractSync = analyzeContractSync(scopeFiles);
    const issues = [];

    if (scopeFiles.length === 0) {
      issues.push(
        "No changed files were detected for the selected diff. The harness requires a non-empty implementation diff.",
      );
    }

    if (scope.hasDivergence) {
      issues.push(
        `Changed files outside Harness Contract scope: ${scope.outsideScopeFiles.join(", ")}`,
      );
    }

    if (contract.requiresDocs && !docsChanged) {
      issues.push(
        "Harness Contract requires Markdown documentation updates, but no Markdown files changed.",
      );
    }

    if (contractSync.detected && !contractSync.docsSatisfied) {
      issues.push(
        "Configured documentation-sync triggers changed without their required documentation updates.",
      );
    }

    const verificationResults = [];
    if (issues.length === 0) {
      for (const command of contract.verify) {
        verificationResults.push(
          await runVerification(
            command,
            verificationResults.length + 1,
            diagnosticDir,
          ),
        );
      }
    }

    const failedVerification = verificationResults.filter(
      (result) => result.status === FAIL,
    );
    if (await computeChangeFingerprint(repoRoot, await getChangedFiles(repoRoot, options.base)) !== changeFingerprint || await getHeadRevision(repoRoot) !== headRevision) {
      issues.push("Verification changed the worktree or HEAD; rerun after reconciling generated changes.");
    }
    const status =
      issues.length === 0 && failedVerification.length === 0 ? PASS : FAIL;

    const report = {
      generatedAt: new Date().toISOString(),
      status,
      repoRoot: normalizePath(repoRoot),
      planPath,
      planStatus,
      baseRef: options.base ?? null,
      ci: options.ci,
      headRevision,
      changedFiles,
      changeFingerprint,
      scopeFiles,
      scope,
      harnessContract: contract,
      acceptanceCriteria,
      docsChanged,
      contractSync,
      issues,
      verification: verificationResults,
    };

    await assertSafeRepoPath(repoRoot, REPORT_DIR);
    await mkdir(REPORT_DIR, { recursive: true });
    const patch = await runProcess('git', ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', options.base ? `${options.base}...HEAD` : 'HEAD', '--', ...scopeFiles]);
    const untracked = [];
    if (!options.base) {
      const others = await runProcess('git', ['ls-files', '--others', '--exclude-standard', '-z']);
      const untrackedSet = new Set(others.stdout.split('\0'));
      for (const file of scopeFiles) if (untrackedSet.has(file)) untracked.push({ path: file, content: await readFile(await assertSafeRepoPath(repoRoot, file), 'utf8') });
    }
    await writeFile(await assertSafeRepoPath(repoRoot, '.tmp/harness-diff.json'), JSON.stringify({ changeFingerprint, patch: patch.stdout, untracked }, null, 2) + '\n');

    await writeReport(report);
    printSummary(report);

    if (status === FAIL) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Harness failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

function parseArgs(argv) {
  const options = {
    base: null,
    ci: false,
    help: false,
    plan: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--ci") {
      options.ci = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--plan") {
      options.plan = requireValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--base") {
      options.base = requireValue(arg, argv[index + 1]);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.ci && !options.base && !options.help) {
    throw new Error("--ci requires --base <git-ref>; CI validation cannot complete a local plan.");
  }
  return options;
}

function requireValue(flag, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function printUsage() {
  console.log(`Usage: node tools/harness/run.mjs [--plan <path>] [--base <git-ref>] [--ci]

Options:
  --plan <path>  Explicit path to the execution plan.
  --base <ref>   Compare against a base Git ref instead of local worktree changes.
  --ci           Validate an active executable or archived done plan against --base.
  --help         Show this message.`);
}

async function getRepoRoot() {
  const result = await runProcess("git", ["rev-parse", "--show-toplevel"]);
  return result.stdout.trim();
}

function resolveRepoPath(repoRoot, targetPath) {
  const absolute = path.resolve(repoRoot, targetPath);
  const relative = normalizePath(path.relative(repoRoot, absolute));
  if (!relative || relative.startsWith("../")) {
    throw new Error(`Path must stay within the repository: ${targetPath}`);
  }

  return relative;
}

async function autoDetectPlanPath(repoRoot, changedFiles, ci) {
  const planFiles = [];
  for (const file of changedFiles) {
    if (!isActivePlanPath(file) && !(ci && isDirectPlanPath(file, ARCHIVE_PLAN_PREFIX))) {
      continue;
    }
    try {
      await readFile(path.join(repoRoot, file), "utf8");
      planFiles.push(file);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  if (planFiles.length !== 1) {
    throw new Error(
      `Expected exactly one existing changed ${ci ? "active or archived" : "active"} plan when --plan is omitted, found ${planFiles.length}.`,
    );
  }

  return planFiles[0];
}

function isActivePlanPath(filePath) {
  return isDirectPlanPath(filePath, ACTIVE_PLAN_PREFIX);
}

function isDirectPlanPath(filePath, prefix) {
  return (
    filePath.startsWith(prefix) &&
    filePath.endsWith(".md") &&
    !filePath.slice(prefix.length).includes("/")
  );
}

export function parsePlanStatus(planText) {
  const match = planText.match(/^- Status:\s*`([^`]+)`\s*$/m);
  if (!match) {
    throw new Error("Plan metadata is missing a `Status` field.");
  }

  return match[1].trim();
}

function validatePlanStatus(planStatus, planPath, ci) {
  if (ci && isDirectPlanPath(planPath, ARCHIVE_PLAN_PREFIX) && planStatus === "done") {
    return;
  }
  if (isActivePlanPath(planPath) && ALLOWED_PLAN_STATUSES.has(planStatus)) {
    return;
  }

  throw new Error(
    `Plan ${planPath} must be in an approved executable state. Allowed statuses: ${Array.from(ALLOWED_PLAN_STATUSES).join(", ")}.`,
  );
}

export function parseHarnessContract(planText) {
  const match = planText.match(
    /^## Harness Contract\s+```json\s*([\s\S]*?)\s*```/m,
  );
  if (!match) {
    throw new Error("Plan is missing a `Harness Contract` JSON block.");
  }

  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error(
      `Harness Contract must be valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function validateContract(contract, planPath) {
  if (
    !contract || typeof contract !== "object" ||
    !Array.isArray(contract.allowedPaths) || contract.allowedPaths.length === 0
  ) {
    throw new Error(`Harness Contract in ${planPath} must include a non-empty allowedPaths array.`);
  }

  if (!Array.isArray(contract.verify) || contract.verify.length === 0) {
    throw new Error(`Harness Contract in ${planPath} must include a non-empty verify array.`);
  }

  if (typeof contract.requiresDocs !== "boolean") {
    throw new Error(`Harness Contract in ${planPath} must set requiresDocs to true or false.`);
  }

  for (const pattern of contract.allowedPaths) {
    if (typeof pattern !== "string" || pattern.trim() === "") {
      throw new Error(`Harness Contract in ${planPath} has an invalid allowedPaths entry.`);
    }
    if (pattern.startsWith('/') || /[\x00-\x1f:]/.test(pattern) || normalizePath(pattern).split('/').some(p => !p || p === '..' || p === '.')) throw new Error('Harness Contract contains an unsafe allowedPaths pattern.');
  }

  for (const command of contract.verify) {
    if (typeof command !== "string" || command.trim() === "") {
      throw new Error(`Harness Contract in ${planPath} has an invalid verify command.`);
    }
  }
}

export function documentationRules() {
  let config;
  try {
    const configPath = path.resolve(path.dirname(scriptPath), '../../broke-harness.config.json');
    if (lstatSync(configPath).isSymbolicLink()) throw new Error('Symlink configuration refused');
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  if (config.schemaVersion !== 1 || !Array.isArray(config.documentationSync?.rules)) throw new Error('Invalid documentation-sync configuration');
  for (const rule of config.documentationSync.rules) {
    for (const key of ['trigger','require']) {
      if (!Array.isArray(rule[key]) || !rule[key].length || rule[key].some(p => typeof p !== 'string' || !p || p.startsWith('/') || p.includes('..') || /[\\:\x00-\x1f]/.test(p))) throw new Error('Invalid documentation-sync rule');
    }
  }
  return config.documentationSync.rules;
}

export function analyzeContractSync(scopeFiles, rules = documentationRules()) {
  const triggered = rules.filter(rule => scopeFiles.some(file => matchesAny(file, rule.trigger)));
  const backendFiles = scopeFiles.filter(file => triggered.some(rule => matchesAny(file, rule.trigger)));
  const docsFiles = scopeFiles.filter(file => triggered.some(rule => matchesAny(file, rule.require)));
  return { detected: triggered.length > 0, backendFiles, frontendFiles: [], docsFiles, docsRequired: triggered.length > 0,
    docsSatisfied: triggered.every(rule => scopeFiles.some(file => matchesAny(file, rule.require))) };
}

function matchesAny(filePath, patterns) {
  return patterns.some((pattern) => matchesGlob(filePath, normalizePath(pattern)));
}

export function matchesGlob(filePath, pattern) {
  const pathSegments = splitSegments(filePath);
  const patternSegments = splitSegments(pattern);
  return matchSegments(pathSegments, patternSegments, 0, 0);
}

function splitSegments(value) {
  return normalizePath(value)
    .split("/")
    .filter((segment) => segment.length > 0);
}

function matchSegments(pathSegments, patternSegments, pathIndex, patternIndex) {
  while (patternIndex < patternSegments.length) {
    const patternSegment = patternSegments[patternIndex];

    if (patternSegment === "**") {
      if (patternIndex === patternSegments.length - 1) {
        return true;
      }

      for (let nextPathIndex = pathIndex; nextPathIndex <= pathSegments.length; nextPathIndex += 1) {
        if (
          matchSegments(
            pathSegments,
            patternSegments,
            nextPathIndex,
            patternIndex + 1,
          )
        ) {
          return true;
        }
      }

      return false;
    }

    if (pathIndex >= pathSegments.length) {
      return false;
    }

    if (!matchSegment(pathSegments[pathIndex], patternSegment)) {
      return false;
    }

    pathIndex += 1;
    patternIndex += 1;
  }

  return pathIndex === pathSegments.length;
}

function matchSegment(value, pattern) {
  const regex = new RegExp(`^${escapeRegex(pattern).replace(/\\\*/g, "[^/]*").replace(/\\\?/g, "[^/]")}$`);
  return regex.test(value);
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.*]/g, "\\$&");
}

function isMarkdownFile(filePath) {
  return filePath.endsWith(".md");
}

export async function runVerification(command, index, diagnosticDir) {
  await assertSafeRepoPath(process.cwd(), normalizePath(diagnosticDir).startsWith('.tmp/') ? normalizePath(diagnosticDir) : '.tmp');
  const startedAt = Date.now();
  let stdout = "";
  let stderr = "";
  const exitCode = await new Promise((resolve) => {
    const child = spawn(command, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    let settled = false;
    const settle = (code) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(code);
    };

    child.on("close", (code) => settle(code ?? 1));
    child.on("error", (error) => {
      const message = `Failed to start verification command: ${error.message}\n`;
      stderr += message;
      process.stderr.write(message);
      settle(1);
    });
  });

  await mkdir(diagnosticDir, { recursive: true });
  const filePrefix = `verification-${String(index).padStart(2, "0")}`;
  const stdoutPath = normalizePath(path.join(diagnosticDir, `${filePrefix}.stdout.log`));
  const stderrPath = normalizePath(path.join(diagnosticDir, `${filePrefix}.stderr.log`));
  await Promise.all([
    writeFile(stdoutPath, stdout, "utf8"),
    writeFile(stderrPath, stderr, "utf8"),
  ]);

  return {
    command,
    durationMs: Date.now() - startedAt,
    exitCode,
    status: exitCode === 0 ? PASS : FAIL,
    stdoutPath,
    stderrPath,
    stdoutExcerpt: createDiagnosticExcerpt(stdout),
    stderrExcerpt: createDiagnosticExcerpt(stderr),
  };
}

export function parseAcceptanceCriteria(planText) {
  const lines = planText.split(/\r?\n/);
  const headingIndex = lines.findIndex(
    (line) => line.trim() === "## Acceptance Criteria",
  );

  if (headingIndex === -1) {
    throw new Error("Plan is missing an `Acceptance Criteria` section.");
  }

  const criteria = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^##\s+/.test(line)) {
      break;
    }

    const match = line.match(/^-\s+(.+\S|\S)\s*$/);
    if (!match) {
      continue;
    }

    const text = match[1].trim();
    if (/^<.*>$/.test(text)) {
      continue;
    }

    criteria.push({
      id: `AC-${criteria.length + 1}`,
      text,
    });
  }

  if (criteria.length === 0) {
    throw new Error(
      "Plan must include at least one concrete bullet under `Acceptance Criteria`.",
    );
  }

  return criteria;
}

function createDiagnosticExcerpt(output) {
  const trimmed = output.trim();
  if (trimmed.length <= DIAGNOSTIC_EXCERPT_CHARS) {
    return trimmed;
  }

  return `[truncated to last ${DIAGNOSTIC_EXCERPT_CHARS} characters]\n${trimmed.slice(-DIAGNOSTIC_EXCERPT_CHARS)}`;
}

function createArtifactId() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function writeReport(report) {
  await assertSafeRepoPath(report.repoRoot, REPORT_JSON_PATH);
  await assertSafeRepoPath(report.repoRoot, REPORT_MD_PATH);
  await mkdir(REPORT_DIR, { recursive: true });
  await writeFile(REPORT_JSON_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(REPORT_MD_PATH, formatMarkdown(report), "utf8");
}

function formatMarkdown(report) {
  const lines = [
    "# Harness Summary",
    "",
    `- Status: ${report.status}`,
    `- Plan: \`${report.planPath}\``,
    `- Plan Status: \`${report.planStatus}\``,
    `- Base Ref: ${report.baseRef ? `\`${report.baseRef}\`` : "`local-worktree`"}`,
    `- Changed Files: ${report.changedFiles.length}`,
    `- Docs Changed: ${report.docsChanged ? "yes" : "no"}`,
    "",
    "## Changed Files",
  ];

  if (report.changedFiles.length === 0) {
    lines.push("- None");
  } else {
    for (const file of report.changedFiles) {
      lines.push(`- \`${file}\``);
    }
  }

  lines.push("", "## Issues");
  if (report.issues.length === 0) {
    lines.push("- None");
  } else {
    for (const issue of report.issues) {
      lines.push(`- ${issue}`);
    }
  }

  lines.push("", "## Scope");
  lines.push(`- Divergence: ${report.scope.hasDivergence ? "yes" : "no"}`);
  if (report.scope.outsideScopeFiles.length === 0) {
    lines.push("- Outside Scope Files: None");
  } else {
    for (const file of report.scope.outsideScopeFiles) {
      lines.push(`- Outside Scope: \`${file}\``);
    }
  }

  lines.push("", "## Contract Sync");
  lines.push(`- Contract Changes Detected: ${report.contractSync.detected ? "yes" : "no"}`);
  lines.push(`- Contract Docs Updated: ${report.contractSync.docsSatisfied ? "yes" : "no"}`);
  appendMarkdownFileList(lines, "Backend Contract File", report.contractSync.backendFiles);
  appendMarkdownFileList(lines, "Frontend Contract File", report.contractSync.frontendFiles);
  appendMarkdownFileList(lines, "Contract Doc File", report.contractSync.docsFiles);

  lines.push("", "## Acceptance Criteria");
  for (const criterion of report.acceptanceCriteria) {
    lines.push(`- ${criterion.id}: ${criterion.text}`);
  }

  lines.push("", "## Verification");
  if (report.verification.length === 0) {
    lines.push("- Skipped");
  } else {
    for (const result of report.verification) {
      lines.push(
        `- ${result.status}: \`${result.command}\` (${formatDuration(result.durationMs)})`,
      );
      lines.push(`  - stdout: \`${result.stdoutPath}\``);
      lines.push(`  - stderr: \`${result.stderrPath}\``);
      if (result.status === FAIL) {
        const diagnostic = result.stderrExcerpt || result.stdoutExcerpt;
        if (diagnostic) {
          lines.push("  - diagnostic:");
          lines.push("    ```text");
          lines.push(...diagnostic.split(/\r?\n/).map((line) => `    ${line}`));
          lines.push("    ```");
        }
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

function formatDuration(durationMs) {
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function printSummary(report) {
  console.log(`Harness status: ${report.status}`);
  console.log(`Plan: ${report.planPath}`);
  console.log(`Changed files: ${report.changedFiles.length}`);
  console.log(`Scope divergence: ${report.scope.hasDivergence ? "yes" : "no"}`);
  console.log(`Contract changes detected: ${report.contractSync.detected ? "yes" : "no"}`);

  if (report.issues.length > 0) {
    for (const issue of report.issues) {
      console.error(`Issue: ${issue}`);
    }
  }

  for (const result of report.verification) {
    console.log(`${result.status}: ${result.command} (${formatDuration(result.durationMs)})`);
  }

  console.log(`Wrote ${REPORT_JSON_PATH}`);
  console.log(`Wrote ${REPORT_MD_PATH}`);
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

function appendMarkdownFileList(lines, label, files) {
  if (files.length === 0) {
    lines.push(`- ${label}s: None`);
    return;
  }

  for (const file of files) {
    lines.push(`- ${label}: \`${file}\``);
  }
}

async function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stderr, stdout });
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} exited with code ${code}.${stderr ? ` ${stderr.trim()}` : ""}`,
        ),
      );
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  await main();
}
