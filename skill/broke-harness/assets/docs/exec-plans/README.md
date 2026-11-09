# Execution plans

Read AGENT.md or AGENTS.md and ARCHITECTURE.md, then use docs/INDEX.md to select task-specific docs. Draft plans live in active/; completed plans move to archive/. Archived plans are history, not current specifications.

1. Ask an agent to write a plan using TEMPLATE.md, or author it manually. Review all active plans first; resolve material conflicts in paths, behavior or assumptions with the user before choosing an ordering. Record coordination in the plan.
2. The user reviews and changes the plan status from draft to approved.
3. Invoke /start-plan --plan docs/exec-plans/active/<file>.md with the chosen agent. It implements, verifies, reports results and asks whether to run the completion gate, mark done/archive and commit with a proposed descriptive message. Clarification or divergence requires user direction before dependent changes.
4. The user can request an independent audit by another agent, or approve completion directly. Audit is optional. A request for review is not completion approval.
5. Any unambiguous approval in a later message authorizes the completion gate and local commit, regardless of wording. No specific word or phrase is required. The helper validates current evidence, marks done, moves the plan locally to archive, then stages and commits only the approved changed files plus archival. The agent reports the archive path, commit hash and message. A failed gate never commits; declined approval leaves work in-progress. An explicit archive-only request omits --commit-message.

## Contract

allowedPaths is the sole edit scope; prose does not expand it. verify is the ordered required command list, run from the repository root. requiresDocs requires a Markdown change; configured documentation-sync rules may require specific docs. Acceptance Criteria uses concrete top-level bullets assigned stable AC IDs. Ask for amendment and re-approval if scope, contract or criteria must change.

## Deterministic helpers

Installation can precede Git. Before starting a real plan, the user initializes Git and commits the scaffold/harness as a clean baseline. Helpers never initialize, reset or push; only approved completion with --commit-message stages and commits. Starting approved work permits only the selected plan as an uncommitted file; resume permits scoped pending changes and rejects baseline/contract drift. Keep implementation uncommitted until archival so the complete diff remains visible. An earlier commit during execution needs explicit baseline reconciliation.

```text
node tools/exec-plans/start-plan.mjs docs/exec-plans/active/<file>.md
node tools/harness/run.mjs --plan docs/exec-plans/active/<file>.md
node tools/exec-plans/complete-plan.mjs docs/exec-plans/active/<file>.md --harness .tmp/harness-report.json --approve <current-change-fingerprint> --commit-message "<implementation summary>"
```

The harness writes .tmp/harness-report.json, .tmp/harness-summary.md, scoped diff evidence and command logs. Passing labels cannot override failed command details, scope divergence or missing docs. Completion rechecks the current plan, contract, HEAD, fingerprint, ordered results and 24-hour freshness. Changes invalidate evidence and require a new report and approval. Comparison-only reports cannot complete a plan. If Git fails after archival, the helper reports that completion passed but the commit failed, preserving files and any staging. Resolve the cause and finish the scoped commit without rerunning archival; never claim a failed commit succeeded.

If the user requests structured independent review, use /start-plan-audit and add --audit .tmp/audit-result.json to completion. Supplied audits require clean findings, criterion evidence, matching fingerprints and freshness. Without --audit no audit file is required, read or fabricated. Missing browser/device execution is recorded honestly as residual uncertainty.

/update-docs is separately user-invoked for maintained documentation cleanup. It does not rewrite execution-plan history or silently change approved contracts. Before archival, account for inbound links to the active plan within authorized scope.

Statuses: draft, approved, in-progress, done, superseded. Only explicit owner-directed completion marks done. Filenames: YYYY-MM-DD-short-title.md. Portable skills and canonical command instructions are installed under .agents/skills/ and .broke-harness/commands/; native slash discovery depends on the host. No CI configuration is generated.
