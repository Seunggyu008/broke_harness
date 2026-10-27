#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { getChangedFiles, getHeadRevision } from "../harness/change-state.mjs";
import {
  matchesGlob,
  parseAcceptanceCriteria,
  parseHarnessContract,
  parsePlanStatus,
  validateContract,
} from "../harness/run.mjs";
import { checkPlanState, writePlanState } from "./plan-state.mjs";

const EXECUTABLE_STATUSES = new Set(["approved", "in-progress"]);
const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(scriptPath), "..", "..");

async function main() {
  const planArg = process.argv[2];
  if (!planArg || process.argv.length !== 3) {
    throw new Error("Usage: node tools/exec-plans/start-plan.mjs <plan-path>");
  }

  const { absolutePath, relativePath } = resolveRepoPath(planArg);
  const prefix = "docs/exec-plans/active/";
  if (
    !relativePath.startsWith(prefix) ||
    !relativePath.endsWith(".md") ||
    relativePath.slice(prefix.length).includes("/")
  ) {
    throw new Error(`Plan must be a direct Markdown child of ${prefix}: ${relativePath}`);
  }

  const planText = await readFile(absolutePath, "utf8");
  const currentStatus = parsePlanStatus(planText);
  if (!EXECUTABLE_STATUSES.has(currentStatus)) {
    throw new Error(
      `Plan ${relativePath} must be executable before implementation. Allowed statuses: ${Array.from(EXECUTABLE_STATUSES).join(", ")}.`,
    );
  }

  const contract = parseHarnessContract(planText);
  validateContract(contract, relativePath);
  const criteria = parseAcceptanceCriteria(planText);
  const changedFiles = (await getChangedFiles(repoRoot)).filter((file) => file !== relativePath);
  const forbidden = currentStatus === "approved"
    ? changedFiles
    : changedFiles.filter(
        (file) => !contract.allowedPaths.some((pattern) => matchesGlob(file, pattern)),
      );
  if (forbidden.length > 0) {
    throw new Error(`${currentStatus === "approved" ? "Starting requires a clean worktree" : "Resuming rejects changes outside the approved scope"}: ${forbidden.join(", ")}`);
  }
  const headRevision = await getHeadRevision(repoRoot);
  if (currentStatus === "in-progress") {
    const state = await checkPlanState(repoRoot, relativePath, headRevision, contract, criteria);
    if (!state) {
      // Adopt older in-progress plans only after all pending paths pass scope checks.
      await writePlanState(repoRoot, relativePath, headRevision, contract, criteria);
      console.log(`Adopted a start record for older in-progress plan ${relativePath} after pending-path validation.`);
    }
    console.log(`Plan resumed: ${relativePath}; ${changedFiles.length} scoped pending files. Rerun the harness and a fresh audit before completion.`);
    return;
  }

  const updatedText = planText.replace(
    /^(- Status:\s*`)[^`]+(`\s*)$/m,
    "$1in-progress$2",
  );

  await writePlanState(repoRoot, relativePath, headRevision, contract, criteria);
  await writeFile(absolutePath, updatedText, "utf8");
  console.log(`Plan status updated: approved -> in-progress (${relativePath})`);
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

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
