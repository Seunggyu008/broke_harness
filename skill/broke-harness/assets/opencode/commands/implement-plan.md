---
description: Implement an approved execution plan with bounded scope
agent: build
model: opencode-go/deepseek-v4.1-flash
---

Read the executable plan from $ARGUMENTS.

This is the implementation stage used by `/start-plan`; the caller already validated the start or resume and ensured the plan is `in-progress`. Do not run the start/resume helper again. When resuming, inspect and preserve valid existing scoped changes, then implement the remaining acceptance criteria.

Before editing:

1. Read `AGENTS.md`, the nearest scoped `AGENTS.md`, and only the task-relevant docs selected through `docs/INDEX.md`.
2. Read the plan's objective, non-goals, `Harness Contract`, planned changes, and acceptance criteria.
3. Inspect the relevant files listed by the plan and every existing file matched by `Harness Contract.allowedPaths`.

Implementation rules:

- Implement only the approved scope and required acceptance criteria.
- Do not add optional follow-ups or adjacent improvements.
- If the approved plan conflicts with the current repo state or requires new scope, stop and report the mismatch.
- Treat `Harness Contract.allowedPaths` as the sole authoritative edit scope. If another path is required, stop for plan amendment and re-approval.
- Prefer small, reviewable changes.
- Do not rewrite unrelated files.
- Do not change secrets, env files, package lockfiles, migrations, or deployment config unless the plan explicitly requires it.
- Keep contract changes synchronized across touched layers when the plan requires them.
- Do not run `node tools/harness/run.mjs`; the caller runs the execution-plan harness after `implement-plan` completes.
- After implementation, return the changed paths and verification requirements to the orchestrator. Only the orchestrator invokes the canonical harness to execute reviewed verification commands; this role has no shell access.
- Leave the plan `in-progress`; only the completion gate may mark it `done`.
- Show changed files, verification run, remaining risks, and any deviation from the plan.
