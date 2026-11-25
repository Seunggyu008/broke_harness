# Commit staged changes locally with a plan-type subject

Run only on an explicit /commit or equivalent broke_harness invocation. Accept an optional `--plan <path>` to identify the execution plan.

1. From the selected repository root, run `node tools/exec-plans/commit.mjs --inspect` to inspect the staged diff. If nothing is staged, report that and stop. If a plan is in progress, use its /start-plan completion flow with the required evidence and owner approval.
2. Use the relevant plan's `Type` metadata. If the plan has no type or there is no associated plan, infer the best fit from the staged changes, choosing `feature`, `refactor`, or `fix`. Ask which plan or changes to commit when the staged changes represent multiple unrelated requests.
3. Write a concise, single-line subject in the form `<type>/<summary>`. Use an imperative summary and no space around the slash, as in `fix/Preserve task order`.
4. Run `node tools/exec-plans/commit.mjs --message "fix/Preserve task order"` with the actual subject. Commit only the staged changes. Leave unstaged and untracked files in place. Report the resulting local hash and subject.
