# Installed development workflow

The user owns Git initialization, the initial baseline commit, branches and pushes. Installation accepts a normal folder. The deterministic execution-plan tools use Git diff and HEAD, so the user must establish a clean committed baseline before starting the first plan. Keep implementation uncommitted until the user approves completion and its local commit.

Use /write-plan, or ask any agent to write a draft under docs/exec-plans/active/ using TEMPLATE.md. The user reviews and approves its status. Coordinate materially overlapping active plans before authoring. Read the root AGENT.md/AGENTS.md and ARCHITECTURE.md, then select relevant project docs through docs/INDEX.md.

Run /start-plan --plan docs/exec-plans/active/<file>.md using the agent chosen by the user. It starts or resumes the pinned plan, implements within allowedPaths and runs ordered verification. After a passing harness it delegates a fresh read-only audit. A fixer handles confirmed findings, then the agent reruns the full harness and delegates another fresh audit. Ask about clarification or divergence before dependent changes. Scope, baseline, failed verification and stale evidence remain blockers.

After a clean audit, store the result in .tmp/audit-result.json and report the verification results, criterion evidence and remaining risks. Leave the plan in progress and request approval for completion, archival and a scoped commit with a concise message. Any unambiguous approval in a later message authorizes those actions while the reported evidence remains current. Run the completion helper with both artifacts.

```text
node tools/exec-plans/complete-plan.mjs docs/exec-plans/active/<file>.md --harness .tmp/harness-report.json --audit .tmp/audit-result.json --approve <current-change-fingerprint> --commit-message "<implementation summary>"
```

Completion requires a clean, complete, fresh audit matching the current passing harness. Changed implementation or stale evidence requires new verification, a fresh independent audit and renewed approval. The helper validates first, archives the plan, then stages and commits the approved files plus archival. A failed gate never commits. A Git failure leaves archival and any staging intact: report the failure and finish the scoped commit after resolving it, without rerunning archival. Report the archive path, commit hash and message; never push. Declined approval leaves the plan in-progress and uncommitted. For an explicit archive-only request, omit --commit-message.

/update-docs is a separate, explicitly user-invoked maintenance command. It cleans maintained docs and updates their index/links from repository evidence. It never runs automatically after a plan and does not modify application code or historical plans.

Portable mode installs .agents/skills/<command>/SKILL.md plus canonical instructions in .broke-harness/commands/. Use the host's normal skill invocation or explicitly ask it to follow the file if slash discovery differs. The host's actual tools/permissions govern access; this mode does not install a sandbox. The optional OpenCode adapter supplies five command bridges, dedicated namespaced roles, and policy hooks. Both runtimes require independent audit and fixer delegation. OpenCode also delegates application writes. Live OpenCode compatibility must be verified in the target environment. CI setup is out of scope.
