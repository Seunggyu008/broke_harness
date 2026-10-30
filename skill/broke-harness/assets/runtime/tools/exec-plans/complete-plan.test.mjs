import assert from "node:assert/strict";
import test from "node:test";

import {
  getArchivePlanPath,
  parseArgs,
  validateCompletionArtifacts,
} from "./complete-plan.mjs";

const PLAN_PATH = "docs/exec-plans/active/example.md";
const FINGERPRINT = "sha256:current";
const HARNESS_TIME = "2026-07-28T10:00:00.000Z";
const AUDIT_TIME = "2026-07-28T10:05:00.000Z";
const NOW = Date.parse("2026-07-28T10:10:00.000Z");

test("parseArgs requires a harness and accepts optional audit artifacts", () => {
  assert.deepEqual(
    parseArgs([
      PLAN_PATH,
      "--harness",
      ".tmp/harness-report.json",
      "--audit",
      ".tmp/audit-result.json",
    ]),
    {
      audit: ".tmp/audit-result.json",
      harness: ".tmp/harness-report.json",
      plan: PLAN_PATH,
    },
  );

  assert.throws(() => parseArgs([PLAN_PATH]), /--harness/);
  assert.equal(parseArgs([PLAN_PATH, '--harness', '.tmp/harness-report.json']).audit, null);
});

test('completion validates current harness without inventing optional audit evidence', () => {
  const input = createValidationInput();
  delete input.auditResult;
  assert.doesNotThrow(() => validateCompletionArtifacts(input));
  input.harnessReport.verification[0].exitCode = 1;
  assert.throws(() => validateCompletionArtifacts(input), /every required verification/);
});

test('unaudited completion still requires ordered acceptance criteria and fresh evidence', () => {
  const input = createValidationInput();
  delete input.auditResult;
  input.harnessReport.acceptanceCriteria = [];
  assert.throws(() => validateCompletionArtifacts(input), /unique ordered AC IDs/);
  const stale = createValidationInput();
  delete stale.auditResult;
  stale.nowMs = Date.parse('2026-07-30T10:10:00.000Z');
  assert.throws(() => validateCompletionArtifacts(stale), /freshness window/);
});

test("getArchivePlanPath maps only direct active plans into the archive", () => {
  assert.equal(
    getArchivePlanPath("docs/exec-plans/active/example.md"),
    "docs/exec-plans/archive/example.md",
  );
  assert.throws(
    () => getArchivePlanPath("docs/exec-plans/archive/example.md"),
    /direct child/,
  );
  assert.throws(
    () => getArchivePlanPath("docs/exec-plans/active/nested/example.md"),
    /direct child/,
  );
});

test("validateCompletionArtifacts accepts fresh artifacts for the current diff", () => {
  assert.doesNotThrow(() =>
    validateCompletionArtifacts(createValidationInput()),
  );
});

test("validateCompletionArtifacts rejects a harness from an earlier diff", () => {
  const input = createValidationInput();
  input.harnessReport.changeFingerprint = "sha256:stale";

  assert.throws(
    () => validateCompletionArtifacts(input),
    /current changed-file contents/,
  );
});

test("validateCompletionArtifacts rejects an audit bound to another harness", () => {
  const input = createValidationInput();
  input.auditResult.harnessChangeFingerprint = "sha256:stale";

  assert.throws(
    () => validateCompletionArtifacts(input),
    /Audit result is stale/,
  );
});

test("validateCompletionArtifacts rejects artifacts older than 24 hours", () => {
  const input = createValidationInput();
  input.nowMs = Date.parse("2026-07-30T10:10:00.000Z");

  assert.throws(
    () => validateCompletionArtifacts(input),
    /24-hour completion freshness window/,
  );
});

test("validateCompletionArtifacts rejects missing or unverified acceptance evidence", () => {
  const missing = createValidationInput();
  missing.auditResult.acceptanceEvidence = [];
  assert.throws(
    () => validateCompletionArtifacts(missing),
    /evidence count does not match/,
  );

  const unverified = createValidationInput();
  unverified.auditResult.acceptanceEvidence[0].status = "unverified";
  assert.throws(
    () => validateCompletionArtifacts(unverified),
    /AC-1 is not verified/,
  );
});

for (const [name, mutate, message] of [
  ["unresolved must-fix findings", (input) => { input.auditResult.mustFix = [{ title: "Still broken" }]; }, /empty mustFix/],
  ["unresolved should-fix findings", (input) => { input.auditResult.shouldFix = [{ title: "Still broken" }]; }, /empty mustFix/],
  ["missing audit finding arrays", (input) => { delete input.auditResult.mustFix; }, /mustFix array/],
  ["missing audit risk arrays", (input) => { delete input.auditResult.acceptableRisk; }, /acceptableRisk array/],
  ["missing feedback arrays", (input) => { delete input.auditResult.feedbackAssessment; }, /feedbackAssessment array/],
  ["missing audit summary", (input) => { input.auditResult.summary = " "; }, /non-empty summary/],
  ["malformed feedback evidence", (input) => { input.auditResult.feedbackAssessment = [{ point: "Example", assessment: "confirmed" }]; }, /malformed feedback/],
  ["failed command under PASS", (input) => { input.harnessReport.verification[0].exitCode = 1; }, /every required verification/],
  ["failed verification status under PASS", (input) => { input.harnessReport.verification[0].status = "FAIL"; }, /every required verification/],
  ["missing verification results", (input) => { input.harnessReport.verification = []; }, /every required verification/],
  ["a different command", (input) => { input.harnessReport.verification[0].command = "node --version"; }, /every required verification/],
  ["scope divergence under PASS", (input) => { input.harnessReport.scope.hasDivergence = true; }, /scope divergence/],
  ["out-of-scope files under PASS", (input) => { input.harnessReport.scope.outsideScopeFiles = ["unrelated.txt"]; }, /scope divergence/],
  ["unresolved harness issues", (input) => { input.harnessReport.issues = ["Missing requirement"]; }, /scope divergence/],
  ["missing scope details", (input) => { delete input.harnessReport.scope; }, /scope divergence/],
  ["inconsistent scope file list", (input) => { input.harnessReport.scopeFiles = []; }, /scope divergence/],
  ["missing required docs", (input) => { input.harnessReport.harnessContract.requiresDocs = true; }, /documentation evidence/],
  ["unsatisfied contract docs", (input) => { input.harnessReport.contractSync.docsSatisfied = false; }, /documentation evidence/],
  ["invented documentation evidence", (input) => { input.harnessReport.docsChanged = true; }, /documentation evidence/],
  ["CI validation artifacts", (input) => { input.harnessReport.ci = true; }, /local execution report/],
  ["base comparison artifacts", (input) => { input.harnessReport.baseRef = "main"; }, /local-worktree/],
  ["different starting revision", (input) => { input.currentHeadRevision = "other"; }, /starting revision changed/],
  ["duplicate criterion IDs", (input) => {
    input.harnessReport.acceptanceCriteria.push({ id: "AC-1", text: "Another" });
    input.auditResult.acceptanceEvidence.push({ ...input.auditResult.acceptanceEvidence[0] });
  }, /unique ordered AC/],
  ["a mismatched harness run", (input) => { input.auditResult.harnessGeneratedAt = AUDIT_TIME; }, /different harness run/],
]) {
  test(`validateCompletionArtifacts rejects ${name}`, () => {
    const input = createValidationInput();
    mutate(input);
    assert.throws(() => validateCompletionArtifacts(input), message);
  });
}

test("validateCompletionArtifacts compares the report with the current plan", () => {
  const input = createValidationInput();
  input.planText = '- Status: `in-progress`\n\n## Harness Contract\n\n```json\n' +
    JSON.stringify(input.harnessReport.harnessContract) + '\n```\n\n## Acceptance Criteria\n\n- The observable behavior is covered.\n';
  assert.doesNotThrow(() => validateCompletionArtifacts(input));
  input.planText = input.planText.replace("behavior is covered", "behavior changed");
  assert.throws(() => validateCompletionArtifacts(input), /do not match the current plan/);
});

function createValidationInput() {
  return {
    auditResult: {
      acceptanceEvidence: [
        {
          criterionId: "AC-1",
          evidence: "The focused automated test passed.",
          evidenceType: "automated",
          status: "verified",
        },
      ],
      generatedAt: AUDIT_TIME,
      harnessChangeFingerprint: FINGERPRINT,
      harnessGeneratedAt: HARNESS_TIME,
      outcome: "clean",
      planPath: PLAN_PATH,
      mustFix: [],
      shouldFix: [],
      acceptableRisk: [],
      feedbackAssessment: [],
      summary: "Focused automated evidence verified the criterion.",
    },
    currentChangeFingerprint: FINGERPRINT,
    harnessReport: {
      acceptanceCriteria: [
        { id: "AC-1", text: "The observable behavior is covered." },
      ],
      baseRef: null,
      ci: false,
      headRevision: "current-head",
      planStatus: "in-progress",
      changeFingerprint: FINGERPRINT,
      generatedAt: HARNESS_TIME,
      planPath: PLAN_PATH,
      status: "PASS",
      changedFiles: [PLAN_PATH, "example.txt"],
      scopeFiles: ["example.txt"],
      scope: { hasDivergence: false, outsideScopeFiles: [] },
      harnessContract: { allowedPaths: ["example.txt"], verify: ["node --check example.txt"], requiresDocs: false },
      docsChanged: false,
      contractSync: { detected: false, backendFiles: [], frontendFiles: [], docsFiles: [], docsRequired: false, docsSatisfied: true },
      issues: [],
      verification: [{ command: "node --check example.txt", status: "PASS", exitCode: 0 }],
    },
    nowMs: NOW,
    planPath: PLAN_PATH,
  };
}
