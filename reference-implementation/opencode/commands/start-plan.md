---
description: Start or resume an approved plan in the current session and request final completion approval
agent: build
model: opencode-go/deepseek-v4.1-flash
---

Parse `$ARGUMENTS` as exactly `--plan <plan-path>`. If the flag, path, or argument count is invalid, show this usage and stop:

`/start-plan --plan docs/exec-plans/active/<plan-file>.md`

Run the complete workflow inside this already-open OpenCode session.

Hard orchestration rules:

- Do not invoke `opencode`, `opencode run`, or any other nested OpenCode CLI process.
- Do not read, copy, print, or modify `auth.json` or any API credential.
- Use the current session's task/subagent capability for the independent code-audit and fix roles.
- If task/subagent delegation is unavailable, stop and explain that the command cannot preserve the required independent audit/fix roles. Do not silently replace them with a self-audit.
- Delegate code audit only to `audit-pro` and confirmed edits only to `fix-pro`.
- When the user supplies external review feedback on this implementation, including after a clean audit or instead of completion approval, follow the external-feedback gate in `AGENTS.md` and section 6 below. Do not edit from the forwarded feedback directly.
- Audit tasks are read-only. Never ask them to edit implementation, tests, documentation, plan, or workflow files.
- Every `audit-pro` delegation after a harness run must use a fresh task without a prior `task_id` and must audit the current harness fingerprint.
- Browser and device UI automation are not part of `/start-plan`. Do not invoke external UI automation or require `.tmp/ui-verification-*.json` artifacts.
- The first `fix-pro` delegation after implementation must use a fresh task without a prior `task_id`. Before every later fix delegation, decide whether to resume that immediately preceding fix task or start a fresh one. Resume only for a narrow follow-up to the same localized finding when the prior assumptions and chosen approach remain valid.
- Start a fresh `fix-pro` task without a prior `task_id` when an audit challenges an architectural boundary, data flow, public contract, or dependency choice; the implementation approach must be replaced rather than adjusted; the same failure category remains after two fix attempts; or later evidence disproves an assumption from the prior implementation/fix context. If the required correction exceeds the approved plan, stop for plan amendment instead of delegating it.
- Keep the plan `in-progress` until the user explicitly approves completion.
- Never bypass a failed harness, unverified deterministic prerequisite, scope divergence, or blocked audit.

## 1. Validate and start

1. Read `AGENTS.md`, `docs/exec-plans/README.md`, and the selected plan.
2. Require the plan status to be `approved` or `in-progress`.
3. Run `node tools/exec-plans/start-plan.mjs <plan-path>` before editing. For an `approved` plan, it requires a clean worktree except for the selected plan, records the starting HEAD/contract/criteria under `.tmp/exec-plans/`, and transitions it to `in-progress`. For an `in-progress` plan, it permits only pending changes inside `Harness Contract.allowedPaths` plus the selected plan and checks that the starting HEAD/contract/criteria are unchanged. Stop and report any rejection; do not widen scope or discard pending files to make it pass. This local helper does not launch OpenCode.
4. On resume, inspect the existing diff against the objective and acceptance criteria, preserve valid implementation, and continue the remaining work. An older in-progress plan without a start record can adopt the current HEAD only after the helper validates all pending paths; inspect that diff carefully. Keep implementation uncommitted until completion, so the local harness sees the full diff. If HEAD changed, reconcile the baseline explicitly instead of silently adopting it. A resume always requires a new harness run and fresh audit before requesting completion approval.
5. Restate the objective, non-goals, `Harness Contract.allowedPaths`, deterministic verification commands, and acceptance criteria.
6. Treat browser, device, and human-only checks already written in an older plan as optional runtime-verification notes, not standard completion gates.

## 2. Implement in the current session

Follow the implementation rules in `.opencode/commands/implement-plan.md`. The status transition has already run; do not invoke it again. Implement only the approved scope. If repository evidence requires a scope or contract change beyond the plan, stop for plan amendment and approval.

## 3. Harness and fix loop

Run:

`node tools/harness/run.mjs --plan <plan-path>`

Read `.tmp/harness-report.json` after every run.

- If it passes, continue to the structured code audit.
- If it reports scope divergence, contract-sync failure, missing plan requirements, or another non-fixable issue, stop and report it.
- If only verification commands fail, delegate the exact failures, diagnostic excerpts, and artifact paths to `fix-pro`. Require minimal plan-scoped fixes, then rerun the harness.
- Allow at most three combined harness/audit fix attempts. Stop if the limit is reached.

## 4. Structured code audit and fix loop

After a passing harness, read `.opencode/commands/start-plan-audit.md`. Delegate that complete audit contract and `<plan-path>` to a fresh `audit-pro` subagent using the current session's task tool. The auditor must consume `.tmp/harness-report.json` and return exactly one JSON object with `outcome`, `mustFix`, `shouldFix`, `acceptableRisk`, `acceptanceEvidence`, `feedbackAssessment`, and `summary`.

- Do not create or require `.tmp/ui-verification-web.json`, `.tmp/ui-verification-native.json`, or `.tmp/ui-verification-human.json`.
- Treat malformed JSON or missing acceptance evidence as blocked.
- When external feedback was supplied, evaluate the complete batch under section 6 before acting on `outcome` or delegating any fix. A `fixable` outcome does not bypass the feedback checkpoint.
- If `outcome` is `blocked`, stop and report the reason.
- If `outcome` is `fixable`, delegate only its actionable findings to `fix-pro`, rerun the full harness, and request a fresh `audit-pro` audit.
- Continue only when the audit is `clean`, both finding arrays are empty, and every harness acceptance criterion has exactly one `verified` evidence record based on deterministic verification or direct code audit.
- For user-visible behavior not executed in a browser or on a device, require the auditor to describe the supporting tests/code path and record the remaining runtime uncertainty under `acceptableRisk`; missing runtime UI evidence alone is not a blocker.

Persist the clean audit as `.tmp/audit-result.json`. Include the clean audit fields plus:

- `generatedAt`: current ISO-8601 timestamp after the harness run
- `harnessChangeFingerprint`: `.tmp/harness-report.json.changeFingerprint`
- `harnessGeneratedAt`: `.tmp/harness-report.json.generatedAt`
- `planPath`: the selected repository-relative plan path

Do not change code, tests, docs, or the plan after producing the final harness and audit artifacts. Any change invalidates both and requires rerunning the harness and audit.

## 5. Request final approval

Summarize:

- implemented changes
- harness verification results
- structured audit outcome
- fixes applied
- whether each fix used a fresh or resumed `fix-pro` task and why
- acceptable risks, including any user-visible behavior not runtime-tested
- `.tmp/harness-report.json` and `.tmp/audit-result.json`

Then ask exactly:

`All gates passed. Approve marking the plan done?`

Do not run the completion gate in the same turn as the question.

After the user explicitly approves in a follow-up message, run:

`node tools/exec-plans/complete-plan.mjs <plan-path> --harness .tmp/harness-report.json --audit .tmp/audit-result.json`

Report whether the completion gate changed the plan from `in-progress` to `done` and moved it from `active/` to `archive/`. If approval is declined or changes are requested, leave the plan `in-progress` under `active/`.

## 6. Handle later external review feedback

If the user sends Codex or other reviewer feedback while this plan remains `in-progress`, do not treat it as approval or as an instruction to apply the proposed fixes. First ensure the harness report passes for the current diff; rerun the harness if it is missing or stale. Delegate the verbatim feedback, current diff, selected plan, and current harness report to a fresh read-only `audit-pro` task under `.opencode/commands/start-plan-audit.md`. Require one `feedbackAssessment` entry per point with current code or test evidence.

Before delegating any feedback-driven fix or making edits, require exactly one valid `feedbackAssessment` entry per supplied point. Missing or malformed assessments block continuation. The auditor returns evidence to the primary agent and must not delegate fixes.

- If every point is `confirmed` and its correction is within approved scope, show the assessment and proceed automatically with actionable findings through the existing fix workflow. Do not ask for additional feedback approval.
- If any point is `unsupported`, `unverified`, or `out-of-scope`, pause the entire batch, including confirmed fixes. Present every point's assessment, specific repository evidence, the auditor's reasoning, and the questions or disagreements needing cross-review. End the turn and wait for explicit user direction resolving or disposing of those points. Do not delegate to `fix-pro`, edit, or silently drop disputed points while waiting. A confirmed problem with a proposed correction that still needs review also requires this pause.

After user direction, retain the requirement for independent evidence before treating a disputed claim or correction as confirmed. Delegate any revised feedback to a fresh read-only `audit-pro` task and apply the checkpoint again. The user may explicitly discard disputed points or authorize proceeding with the confirmed subset; never infer that decision. A required out-of-scope correction still needs plan amendment and re-approval. After edits, rerun the full harness and a fresh audit. Replace stale audit artifacts before asking for completion approval again. If independent audit cannot run, stop without making feedback-driven edits.
