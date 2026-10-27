# Execution Plans

Execution plans are bounded contracts for `/start-plan`.

## Run a plan

1. Create and approve one plan under `docs/exec-plans/active/`.
2. Run `/start-plan --plan docs/exec-plans/active/<plan-file>.md`. Use this same command to resume interrupted in-progress work.
3. Review the implementation, passing harness, structured audit, and residual risks.
4. Explicitly approve or decline completion.

`/start-plan` keeps the plan `in-progress` while the orchestrator delegates implementation, runs the deterministic harness, delegates a fresh read-only audit, and sends confirmed findings to the configured fixer. Browser, device, and human checks are optional runtime evidence rather than completion gates. Read `.broke-harness/WORKFLOW.md` for runtime controls and configuration overrides.

After approval, `tools/exec-plans/complete-plan.mjs` validates the unchanged diff and fresh artifacts, marks the plan `done`, and moves it to `archive/`.

## Start and resume

`/start-plan` runs `tools/exec-plans/start-plan.mjs` automatically. A new approved plan requires a clean worktree except for its own plan file. The helper validates the contract and criteria before changing status and records the starting HEAD, contract, and criteria under ignored `.tmp/exec-plans/`.

An in-progress plan can resume with existing staged, unstaged, or untracked changes when every pending path belongs to its approved `allowedPaths` or is the selected plan. Resume checks the recorded HEAD, contract, and criteria, then the agent inspects the existing implementation and continues the remaining work. Unrelated changes remain blockers. Older in-progress plans without a record adopt the current HEAD after path validation; the agent must inspect those existing changes against the approved plan.

Keep implementation changes uncommitted until completion. A changed HEAD requires explicit baseline reconciliation; it is never silently accepted by resume, the local harness, or completion when a start record exists. Contract or criterion amendments require re-approval and restarting from a clean baseline. Every resumed session reruns the full harness and obtains a fresh audit before completion approval.

## Active-plan coordination gate

Before creating a plan, inspect every existing plan under `docs/exec-plans/active/` and compare its planned changes and `Harness Contract.allowedPaths` with the proposed work. Record the relevant active plans, path overlap, sequencing constraints, and implementation assumptions in the new plan's `Active Plan Coordination` section.

If an active plan may add, remove, rename, or materially change a path, contract, behavior, or assumption used by the proposed plan—or if the proposed work may change the scope or implementation of an active plan—stop before creating the new plan. Ask the user or designated owner for explicit confirmation of the intended ordering, scope split, supersession, or combined behavior. Do not silently choose an order, assume a future rebase, or create the plan first and defer the conflict. Record the confirmed decision in the plan after confirmation is received.

When there is no material interaction, record that the active-plan review found none. Shared files still require an explicit note explaining why sequential implementation will not invalidate either contract.

## Plan contract

Use `TEMPLATE.md`. The machine-required fields are:

- `Status`: `approved` or `in-progress` when executed.
- `Harness Contract.allowedPaths`: the sole authoritative edit and audit scope.
- `Harness Contract.verify`: the sole required-command list.
- `Harness Contract.requiresDocs`: whether the diff must contain a Markdown change.
- `Acceptance Criteria`: concrete top-level bullets, assigned stable `AC-<number>` IDs by the harness.

Narrative context and planned changes explain the contract but do not create additional scope. Amend and re-approve the plan before changing a path outside `allowedPaths`.

## Harness

From the repository root:

```bash
node tools/harness/run.mjs --plan docs/exec-plans/active/<plan-file>.md
```

Use `--base <ref>` only for comparisons; completion requires a local-worktree run. The harness writes `.tmp/harness-report.json`, `.tmp/harness-summary.md`, and command logs under `.tmp/harness/<run-id>/`.

Pull-request CI runs `node tools/harness/run.mjs --ci --base <ref>`. This comparison-only mode accepts one existing changed active executable plan or archived `done` plan. For an archived plan, the selected active-to-archive move is lifecycle metadata and is excluded from implementation scope. Other changed paths still require the selected plan's `allowedPaths`. Deleted active plans are excluded from autodetection, and ambiguous plan selection fails. Archived contracts are used only to validate that completed change, not as current product specifications. `--ci` requires `--base`, and its artifacts cannot satisfy completion.

It rejects out-of-scope changes, required documentation omissions, known API-contract changes without canonical docs, failed verification commands, and malformed plan contracts. Rerun it after every implementation change.

## Audit and completion

The audit contract is `.opencode/commands/start-plan-audit.md`. A clean result must have empty finding arrays and exactly one verified evidence record for every harness criterion. Unexecuted runtime UI behavior is recorded under `acceptableRisk`; it is not a failure by itself.

External reviewer feedback has a batch checkpoint before fixes: when every point and its correction are confirmed within scope, the primary agent proceeds automatically. If any point is unsupported, unverified, or out-of-scope, it presents the complete assessment and pauses all feedback-driven fixes for explicit user direction, including otherwise confirmed fixes. A confirmed problem whose proposed correction needs review also pauses the batch. See `AGENTS.md` and section 6 of `.opencode/commands/start-plan.md` for cross-review and resumption rules.

After explicit approval, `/start-plan` runs:

```bash
node tools/exec-plans/complete-plan.mjs <plan-path> \
  --harness .tmp/harness-report.json \
  --audit .tmp/audit-result.json \
  --approve <current-harness-change-fingerprint>
```

Completion requires matching plan paths, HEAD revisions, and change fingerprints, a passing local harness, a clean audit, complete criterion evidence, and artifacts no more than 24 hours old. It validates scope and documentation details, successful results for every required command in order, and the report's contract/criteria against the current plan. A `clean` audit must contain empty `mustFix` and `shouldFix` arrays plus the required risk, feedback, evidence, and summary fields. Top-level `PASS`/`clean` labels cannot override contradictory or missing details. Rerun the harness and audit after upgrading the workflow if older artifacts lack these fields. Never mark a plan `done` manually.

When configuring CI, run the harness and execution-plan tests independently of the selected plan's verification list. Installation does not create or replace a CI workflow:

```bash
node --test tools/harness/run.test.mjs tools/exec-plans/complete-plan.test.mjs tools/exec-plans/lifecycle.test.mjs
```

The lifecycle suite uses disposable Git repositories and synthetic audit fixtures to exercise start, interrupted resume, verification, completion, archival, and pull-request validation. It does not invoke an AI auditor or replace the independent audit required by `/start-plan`.

## Layout and status

- `TEMPLATE.md`: format for new plans.
- `active/`: `draft`, `approved`, or `in-progress` work.
- `archive/`: completed or superseded history; do not use archived plans as current specifications.

Name plans `YYYY-MM-DD-short-kebab-title.md`.

Statuses are `draft`, `approved`, `in-progress`, `done`, and `superseded`. Only the completion gate performs `in-progress` to `done`.
