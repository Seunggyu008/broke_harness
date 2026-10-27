---
description: Write a bounded execution plan for a requested feature or refactor
agent: plan
model: opencode-go/kimi-k2.6
---

Use this command only when plan authoring is delegated to `opencode`.

If an approved plan was already written by GPT or manually under `docs/exec-plans/active/`, skip this command and run `/start-plan --plan <plan-path>`.

Create or update an execution plan for: $ARGUMENTS

Before writing:

1. Read `AGENTS.md`.
2. Read `docs/INDEX.md`.
3. Read only the docs relevant to the request.
4. Read `docs/exec-plans/README.md`.
5. Inspect the existing code paths the request will touch.
6. Inspect every active plan and its allowedPaths before creating a plan. Material path, contract, behavior or dependency interaction requires explicit owner direction before authoring. Record the coordination decision in the plan.

Output requirements:

- Create or update exactly one plan file under `docs/exec-plans/active/`.
- Name new plans `YYYY-MM-DD-<short-kebab-title>.md`.
- Follow `docs/exec-plans/TEMPLATE.md`.
- Keep the plan bounded to one feature, refactor, or tightly related slice of work.
- Put every editable path only in `Harness Contract.allowedPaths`; do not duplicate the scope in another path list.
- Put every required command only in `Harness Contract.verify`; do not add a duplicate verification section.
- Include concise context, planned changes, and concrete acceptance criteria.
- Separate required work from optional follow-ups.

Planning rules:

- Prefer the smallest implementation that satisfies the request and project docs.
- List explicit non-goals to prevent scope creep.
- If the repo docs are missing or conflicting, note that under Risks / Open Questions.
- Do not implement code.
- After the plan is reviewed and approved, use `/start-plan --plan <plan-path>` as the interactive implementation entry point.
