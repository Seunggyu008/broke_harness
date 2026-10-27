import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { assertSafeRepoPath } from '../harness/change-state.mjs';

function statePath(repoRoot, planPath) {
  const id = createHash("sha256").update(planPath).digest("hex");
  return path.join(repoRoot, ".tmp", "exec-plans", `${id}.json`);
}

export async function checkPlanState(repoRoot, planPath, headRevision, contract, criteria) {
  await assertSafeRepoPath(repoRoot, path.relative(repoRoot, statePath(repoRoot, planPath)).split(path.sep).join('/'));
  let state;
  try {
    state = JSON.parse(await readFile(statePath(repoRoot, planPath), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new Error(`Cannot read the start/resume record for ${planPath}: ${error.message}`);
  }
  if (!state || state.planPath !== planPath || state.headRevision !== headRevision) {
    throw new Error("Plan baseline changed since starting. Restore or explicitly reconcile the starting revision before resuming; do not commit implementation before completion.");
  }
  if (
    !isDeepStrictEqual(state.harnessContract, contract) ||
    !isDeepStrictEqual(state.acceptanceCriteria, criteria)
  ) {
    throw new Error("Plan contract or acceptance criteria changed since starting. Amend and re-approve the plan before starting it again from a clean baseline.");
  }
  if (state.configurationHash !== undefined && state.configurationHash !== await configurationHash(repoRoot)) {
    throw new Error('Harness configuration changed since starting; reconcile and re-approve the baseline.');
  }
  return state;
}

async function configurationHash(repoRoot) {
  await assertSafeRepoPath(repoRoot, 'broke-harness.config.json');
  try { return createHash('sha256').update(await readFile(path.join(repoRoot, 'broke-harness.config.json'))).digest('hex'); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
}

export async function writePlanState(repoRoot, planPath, headRevision, contract, criteria) {
  const target = statePath(repoRoot, planPath);
  await assertSafeRepoPath(repoRoot, path.relative(repoRoot, target).split(path.sep).join('/'));
  await mkdir(path.dirname(target), { recursive: true });
  const state = {
    planPath,
    headRevision,
    harnessContract: contract,
    acceptanceCriteria: criteria,
    startedAt: new Date().toISOString(),
    configurationHash: await configurationHash(repoRoot),
  };
  await writeFile(target, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}
