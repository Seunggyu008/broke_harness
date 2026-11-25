# Implement and independently audit an approved execution plan

Accept exactly `--plan docs/exec-plans/active/<file>.md`. Work in the current agent session chosen by the user. Read the root AGENT.md or AGENTS.md (case-insensitive), ARCHITECTURE.md, docs/exec-plans/README.md, the selected plan, and relevant project docs through docs/INDEX.md.

## Start and implement

Use the current session's delegation capability for audit and fixes. If the host cannot provide a fresh independent read-only audit agent or a separate fixer, report the blocker before starting or resuming work. Never substitute a self-audit or a nested agent CLI.

Require approved or in-progress status. Run `node tools/exec-plans/start-plan.mjs <plan-path>` before editing to validate scope and pin the baseline. Report a rejection without widening scope or discarding work. On resume, inspect and preserve valid existing changes, then run a new harness and audit before requesting completion.

Restate the objective, allowedPaths, verification commands, and acceptance criteria. Follow .broke-harness/commands/implement-plan.md. Ask before dependent edits when the approved contract is ambiguous, conflicts with the project, or requires amendment. In OpenCode, broke-orchestrator delegates implementation, fixes and audits to the configured roles in broke-harness.config.json and runs the lifecycle helpers itself. In portable mode the current agent implements and runs the helpers, and delegates fixes and audits using the host's tools.

The default step budgets are 150 for implementation, 150 for fixes, and 100 for audits. In portable mode, set these budgets when the host supports per-agent step limits.

## Verify, audit and fix

Count fixer delegations for verification failures and audit findings together. Allow at most five total fix attempts for the plan, including resumed fixer tasks. Once all five are used, run verification and any resulting audit for the last fix. If those checks call for another fix, stop and report the remaining failures or findings.

1. Run `node tools/harness/run.mjs --plan <plan-path>`. Read .tmp/harness-report.json after each run. Stop for scope, baseline, contract or other blocking failures. If only verification commands failed, send the exact failures and relevant logs to the fixer for a minimal in-scope correction, then rerun the full harness.
2. After every passing harness, delegate the audit contract in .broke-harness/commands/start-plan-audit.md, the plan path, and the current report and diff paths to a fresh independent read-only auditor. Use a new task with no prior task ID. Require exactly one structured JSON result with the audit contract's finding, feedback and criterion evidence fields. A malformed or blocked audit stops the workflow.
3. For a fixable audit, send only confirmed, in-scope findings to the fixer. Run the full harness again after edits and delegate another fresh audit against the new report. Use a fresh fixer for the first attempt. Resume a fixer only for a localized follow-up when the approach and evidence still hold. Start a fresh fixer when the approach changes, a finding challenges a boundary or contract, prior assumptions are disproved, or the same failure persists after two attempts.
4. Continue only with a clean audit, empty finding arrays and exactly one verified evidence record per harness criterion. Record observational limits for browser, device and human checks under acceptableRisk. Persist the result as .tmp/audit-result.json with generatedAt (current ISO-8601 time at or after the harness), planPath, harnessGeneratedAt and harnessChangeFingerprint bound to the current report. In OpenCode, persist the exact validated object returned by the task hook. Never fabricate independent evidence.

## Handle external review feedback

While the plan is in progress, pass external feedback verbatim to a fresh independent auditor with the current passing report, scoped diff and plan. Rerun the harness first if the report is missing or stale. Require one evidence-backed assessment per point covering both the claimed issue and any proposed correction before delegating any feedback-driven edits.

When every point and correction is confirmed and in scope, report the assessments and apply actionable findings through the fix loop. If any point is unsupported, unverified or out of scope, or a correction needs review, present the complete assessment and pause the entire batch for explicit user direction. Audit any revised feedback or owner-authorized subset before making dependent edits. After edits, rerun verification and the independent audit before asking for completion approval.

## Request completion approval

Leave the plan in progress. Report changed files, ordered verification results, the audit outcome, specific evidence for every acceptance criterion, fixes and whether each fixer task was fresh or resumed, remaining risks, and both evidence paths. Ask whether to run the completion gate, mark the plan done, archive it, and commit with a concise message describing the implementation. End the turn.

Any unambiguous approval in a later user message authorizes completion and the local commit. Recheck that both artifacts are fresh and match the current plan and changes. If either is stale or the implementation changes, repeat verification and the independent audit, report the refreshed evidence and request approval again. A review request or declined approval leaves the plan in progress.

```text
node tools/exec-plans/complete-plan.mjs <plan-path> --harness .tmp/harness-report.json --audit .tmp/audit-result.json --approve <report.changeFingerprint> --commit-message "<implementation summary>"
```

The helper validates both artifacts before archival and stages and commits only the approved changes and archival. Honor an explicit archive-only request by omitting --commit-message. If the gate fails, leave the plan active. If Git fails after archival, report the archive and failure, preserve the files/index, and finish the scoped commit after resolving the cause without rerunning archival. Report the archive path, commit hash and message on success.
