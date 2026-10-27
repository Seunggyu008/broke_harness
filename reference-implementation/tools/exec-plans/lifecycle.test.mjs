import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PLAN = "docs/exec-plans/active/example.md";
const ARCHIVE = "docs/exec-plans/archive/example.md";
const CONTRACT = {
  allowedPaths: ["example.mjs", "docs/behavior.md"],
  verify: ["node --check example.mjs", "git diff --check"],
  requiresDocs: true,
};

test("start, interrupted resume, harness, completion, and archived-plan CI work together", async (t) => {
  const fixture = await createFixture(t);
  fixture.ok("tools/exec-plans/start-plan.mjs", PLAN);
  assert.match(await fixture.read(PLAN), /Status: `in-progress`/);
  await fixture.implement();
  fixture.ok("tools/exec-plans/start-plan.mjs", PLAN);
  fixture.ok("tools/harness/run.mjs", "--plan", PLAN);
  const report = JSON.parse(await fixture.read(".tmp/harness-report.json"));
  assert.equal(report.status, "PASS");
  assert.deepEqual(report.scopeFiles, ["docs/behavior.md", "example.mjs"]);

  // This synthetic audit tests the artifact contract; no AI auditor is run here.
  const audit = createAudit(report);
  await fixture.write(".tmp/audit-result.json", JSON.stringify({ ...audit, mustFix: [{ title: "Unresolved" }] }));
  const args = [PLAN, "--harness", ".tmp/harness-report.json", "--audit", ".tmp/audit-result.json"];
  assert.match(fixture.fail("tools/exec-plans/complete-plan.mjs", ...args), /empty mustFix/);
  assert.match(await fixture.read(PLAN), /Status: `in-progress`/);

  await fixture.write(".tmp/audit-result.json", JSON.stringify(audit));
  fixture.ok("tools/exec-plans/complete-plan.mjs", ...args);
  await assert.rejects(fixture.read(PLAN), { code: "ENOENT" });
  assert.match(await fixture.read(ARCHIVE), /Status: `done`/);
  fixture.commit("Completed fixture plan");
  fixture.ok("tools/harness/run.mjs", "--ci", "--base", fixture.base);
  const ciReport = JSON.parse(await fixture.read(".tmp/harness-report.json"));
  assert.equal(ciReport.status, "PASS");
  assert.equal(ciReport.planPath, ARCHIVE);
  assert.deepEqual(ciReport.scopeFiles, ["docs/behavior.md", "example.mjs"]);
  assert.match(fixture.fail("tools/harness/run.mjs", "--plan", ARCHIVE), /approved executable state/);
  assert.match(fixture.fail("tools/harness/run.mjs", "--plan", ARCHIVE, "--base", fixture.base), /approved executable state/);
});

test("new plans reject dirty implementation before changing their status", async (t) => {
  const fixture = await createFixture(t);
  await fixture.implement();
  assert.match(fixture.fail("tools/exec-plans/start-plan.mjs", PLAN), /clean worktree/);
  assert.match(await fixture.read(PLAN), /Status: `approved`/);
});

test("resume rejects unrelated changes without touching them", async (t) => {
  const fixture = await createFixture(t);
  fixture.ok("tools/exec-plans/start-plan.mjs", PLAN);
  await fixture.implement();
  await fixture.write("unrelated.txt", "User work");
  assert.match(fixture.fail("tools/exec-plans/start-plan.mjs", PLAN), /outside the approved scope: unrelated.txt/);
  assert.equal(await fixture.read("unrelated.txt"), "User work");
  fixture.fail("tools/harness/run.mjs", "--plan", PLAN);
  const report = JSON.parse(await fixture.read(".tmp/harness-report.json"));
  assert.deepEqual(report.scope.outsideScopeFiles, ["unrelated.txt"]);
});

test("resume preserves staged, unstaged, and untracked scoped implementation", async (t) => {
  const fixture = await createFixture(t, {
    ...CONTRACT, allowedPaths: [...CONTRACT.allowedPaths, "new-helper.mjs"],
  });
  fixture.ok("tools/exec-plans/start-plan.mjs", PLAN);
  await fixture.implement();
  fixture.git("add", "example.mjs");
  await fixture.write("new-helper.mjs", "export const helper = true;\n");
  const before = fixture.git("status", "--porcelain");
  fixture.ok("tools/exec-plans/start-plan.mjs", PLAN);
  assert.equal(fixture.git("status", "--porcelain"), before);
  fixture.ok("tools/harness/run.mjs", "--plan", PLAN);
  const report = JSON.parse(await fixture.read(".tmp/harness-report.json"));
  assert.deepEqual(report.scopeFiles, ["docs/behavior.md", "example.mjs", "new-helper.mjs"]);
});

test("resume and local harness reject a changed starting revision", async (t) => {
  const fixture = await createFixture(t);
  fixture.ok("tools/exec-plans/start-plan.mjs", PLAN);
  await fixture.implement();
  fixture.commit("Premature implementation checkpoint");
  assert.match(fixture.fail("tools/exec-plans/start-plan.mjs", PLAN), /baseline changed/);
  assert.match(fixture.fail("tools/harness/run.mjs", "--plan", PLAN), /baseline changed/);
});

test("resume rejects unapproved contract changes", async (t) => {
  const fixture = await createFixture(t);
  fixture.ok("tools/exec-plans/start-plan.mjs", PLAN);
  await fixture.write(PLAN, planText("in-progress", { ...CONTRACT, allowedPaths: ["**"] }));
  assert.match(fixture.fail("tools/exec-plans/start-plan.mjs", PLAN), /contract or acceptance criteria changed/);
});

test("resume permits semantically unchanged contract formatting", async (t) => {
  const fixture = await createFixture(t);
  fixture.ok("tools/exec-plans/start-plan.mjs", PLAN);
  await fixture.write(PLAN, planText("in-progress", {
    requiresDocs: CONTRACT.requiresDocs, verify: CONTRACT.verify, allowedPaths: CONTRACT.allowedPaths,
  }));
  fixture.ok("tools/exec-plans/start-plan.mjs", PLAN);
});

test("legacy in-progress plans can adopt a baseline after scope validation", async (t) => {
  const fixture = await createFixture(t);
  await fixture.write(PLAN, planText("in-progress"));
  await fixture.implement();
  fixture.ok("tools/exec-plans/start-plan.mjs", PLAN);
  fixture.ok("tools/harness/run.mjs", "--plan", PLAN);
  assert.equal(JSON.parse(await fixture.read(".tmp/harness-report.json")).status, "PASS");
});

test("completion rejects stale implementation and a changed HEAD", async (t) => {
  const fixture = await createFixture(t);
  fixture.ok("tools/exec-plans/start-plan.mjs", PLAN);
  await fixture.implement();
  fixture.ok("tools/harness/run.mjs", "--plan", PLAN);
  const report = JSON.parse(await fixture.read(".tmp/harness-report.json"));
  await fixture.write(".tmp/audit-result.json", JSON.stringify(createAudit(report)));
  await fixture.write("example.mjs", "export const value = 3;\n");
  const args = [PLAN, "--harness", ".tmp/harness-report.json", "--audit", ".tmp/audit-result.json"];
  assert.match(fixture.fail("tools/exec-plans/complete-plan.mjs", ...args), /contents do not match/);
  await fixture.write("example.mjs", "export const value = 2;\n");
  fixture.git("-c", "user.name=Harness Test", "-c", "user.email=harness@example.invalid", "commit", "--allow-empty", "-m", "HEAD changed");
  assert.match(fixture.fail("tools/exec-plans/complete-plan.mjs", ...args), /baseline changed/);
});

test("CI mode requires a base and still rejects out-of-scope changes", async (t) => {
  const fixture = await createFixture(t);
  assert.match(fixture.fail("tools/harness/run.mjs", "--ci"), /requires --base/);
  await fixture.write(PLAN, planText("in-progress"));
  await fixture.implement();
  await fixture.write("unrelated.txt", "Outside scope");
  fixture.commit("Invalid plan diff");
  fixture.fail("tools/harness/run.mjs", "--ci", "--base", fixture.base);
  const report = JSON.parse(await fixture.read(".tmp/harness-report.json"));
  assert.equal(report.status, "FAIL");
  assert.deepEqual(report.scope.outsideScopeFiles, ["unrelated.txt"]);
});

test("CI rejects archived drafts and ambiguous changed plans", async (t) => {
  const fixture = await createFixture(t);
  await fixture.write(ARCHIVE, planText("draft"));
  await fixture.implement();
  fixture.commit("Archived draft");
  assert.match(fixture.fail("tools/harness/run.mjs", "--ci", "--base", fixture.base), /approved executable state/);
  await fixture.write("docs/exec-plans/active/second.md", planText("approved"));
  fixture.commit("Ambiguous plans");
  assert.match(fixture.fail("tools/harness/run.mjs", "--ci", "--base", fixture.base), /found 2/);
});

test("failed verification prevents completion even with a clean audit", async (t) => {
  const fixture = await createFixture(t);
  fixture.ok("tools/exec-plans/start-plan.mjs", PLAN);
  await fixture.implement();
  await fixture.write("example.mjs", "export const value = ;\n");
  fixture.fail("tools/harness/run.mjs", "--plan", PLAN);
  const report = JSON.parse(await fixture.read(".tmp/harness-report.json"));
  assert.equal(report.status, "FAIL");
  await fixture.write(".tmp/audit-result.json", JSON.stringify(createAudit(report)));
  assert.match(fixture.fail("tools/exec-plans/complete-plan.mjs", PLAN,
    "--harness", ".tmp/harness-report.json", "--audit", ".tmp/audit-result.json"), /passing harness/);
});

function planText(status, contract = CONTRACT) {
  return `# Execution Plan: Example\n\n- Status: \`${status}\`\n\n## Harness Contract\n\n\`\`\`json\n${JSON.stringify(contract, null, 2)}\n\`\`\`\n\n## Acceptance Criteria\n\n- The example module and its documentation are updated.\n`;
}

function createAudit(report) {
  return {
    outcome: "clean", mustFix: [], shouldFix: [], acceptableRisk: [], feedbackAssessment: [],
    summary: "Synthetic lifecycle fixture audit.",
    acceptanceEvidence: report.acceptanceCriteria.map((criterion) => ({
      criterionId: criterion.id, status: "verified", evidenceType: "audit",
      evidence: "Fixture implementation and documentation inspected by the lifecycle test.",
    })),
    generatedAt: new Date().toISOString(), harnessGeneratedAt: report.generatedAt,
    harnessChangeFingerprint: report.changeFingerprint, planPath: report.planPath,
  };
}

async function createFixture(t, contract = CONTRACT) {
  const repo = await mkdtemp(path.join(os.tmpdir(), "meport-plan-lifecycle-"));
  t.after(async () => {
    if (path.dirname(repo) !== path.resolve(os.tmpdir()) || !path.basename(repo).startsWith("meport-plan-lifecycle-")) {
      throw new Error("Refusing to remove a fixture outside the intended temporary directory.");
    }
    await rm(repo, { recursive: true, force: true });
  });
  const write = async (file, content) => {
    const target = path.join(repo, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  };
  for (const file of ["tools/harness/run.mjs", "tools/harness/change-state.mjs",
    "tools/exec-plans/start-plan.mjs", "tools/exec-plans/complete-plan.mjs", "tools/exec-plans/plan-state.mjs"]) {
    await mkdir(path.dirname(path.join(repo, file)), { recursive: true });
    await copyFile(path.join(sourceRoot, file), path.join(repo, file));
  }
  await mkdir(path.join(repo, "docs/exec-plans/archive"), { recursive: true });
  await write(".gitignore", ".tmp/\n");
  await write(PLAN, planText("approved", contract));
  await write("example.mjs", "export const value = 1;\n");
  await write("docs/behavior.md", "Example value: 1\n");
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", timeout: 15000 });
  const commit = (message) => {
    git("add", ".");
    git("-c", "user.name=Harness Test", "-c", "user.email=harness@example.invalid", "commit", "-m", message);
  };
  git("init", "--quiet");
  git("config", "core.autocrlf", "false");
  commit("Fixture baseline");
  const run = (script, ...args) => spawnSync(process.execPath, [path.join(repo, script), ...args], {
    cwd: repo, encoding: "utf8", timeout: 15000,
  });
  return {
    write, git, commit, base: git("rev-parse", "HEAD").trim(),
    read: (file) => readFile(path.join(repo, file), "utf8"),
    implement: async () => {
      await write("example.mjs", "export const value = 2;\n");
      await write("docs/behavior.md", "Example value: 2\n");
    },
    ok: (script, ...args) => {
      const result = run(script, ...args);
      assert.equal(result.status, 0, `${script}: ${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
      return result.stdout;
    },
    fail: (script, ...args) => {
      const result = run(script, ...args);
      assert.equal(result.status, 1, `${script}: ${result.error ?? ""}\n${result.stdout}\n${result.stderr}`);
      return result.stderr;
    },
  };
}
