# Implement an approved execution plan and report for owner completion approval

Accept exactly `--plan docs/exec-plans/active/<file>.md`. Work in the current agent session chosen by the user. Read the root AGENT.md or AGENTS.md (case-insensitive), ARCHITECTURE.md, docs/exec-plans/README.md, the selected plan, and relevant project docs through docs/INDEX.md.

1. Require approved or in-progress status. Run `node tools/exec-plans/start-plan.mjs <plan-path>`. This uses Git to inspect changes and pin the baseline; it does not initialize, stage, commit, or push. If Git or a clean committed baseline is missing, explain the required user action and stop. Never discard pending work. On resume, inspect and preserve valid existing changes.
2. Restate the objective, allowedPaths, verification commands, and acceptance criteria. Implement only the approved contract. Ask the user about ambiguity, conflicts, or necessary divergence before dependent edits; never silently widen scope or approve the plan yourself.
3. Run `node tools/harness/run.mjs --plan <plan-path>`. Inspect .tmp/harness-report.json and logs. Fix in-scope implementation/test failures and rerun. Stop for scope or baseline divergence. Bound repeated unsuccessful correction attempts to three before reporting the blocker.
4. Present an implementation report: changed files, every acceptance criterion with specific evidence and limits, required command results, remaining risks, and .tmp/harness-report.json. Leave the plan in-progress. Do not automatically delegate an audit or require another agent. Do not describe implementation checks as an independent audit.
5. Ask whether the user wants to mark the plan done and move it to archive, or obtain an independent audit first. End the turn. A request for audit is not approval to complete.
6. After explicit completion approval in a later message, recheck that the report is fresh and matches the current plan and changes, then run `node tools/exec-plans/complete-plan.mjs <plan-path> --harness .tmp/harness-report.json --approve <report.changeFingerprint>`. If the user requested and supplied a structured audit, add `--audit .tmp/audit-result.json`; that evidence must be fresh, clean, and bound to this harness. Never fabricate an audit. Report the archive path. Archival is a local file move, not a Git push.

The user may choose another agent to perform /start-plan-audit before approving completion. Assess any resulting feedback against the current code; ask about disputed claims or out-of-scope corrections. After edits, rerun verification and replace stale evidence. Independent review is optional throughout.

For the optional OpenCode adapter, the command runs as broke-orchestrator: delegate application edits to the configured implementation role, then run the harness yourself. Use the fixer for verification failures or confirmed audit findings when useful. Preserve the same report/owner-choice flow; missing audit delegation never blocks an unaudited implementation.

Git initialization, staging, commits, branches, resets, and pushes remain with the user. Do not generate CI configuration.
