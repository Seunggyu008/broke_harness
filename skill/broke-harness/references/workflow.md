# Installed development workflow

The user owns Git initialization, staging, commits, branches and pushes. Installation accepts a normal folder. The deterministic execution-plan tools use Git diff and HEAD, so the user must establish a clean committed baseline before starting the first plan. Do not initialize or commit automatically.

Use /write-plan, or ask any agent to write a draft under docs/exec-plans/active/ using TEMPLATE.md. The user reviews and approves its status. Coordinate materially overlapping active plans before authoring. Read the root AGENT.md/AGENTS.md and ARCHITECTURE.md, then select relevant project docs through docs/INDEX.md.

Run /start-plan --plan docs/exec-plans/active/<file>.md using the agent chosen by the user. It starts or resumes the pinned plan, implements allowedPaths, runs ordered verification, and produces a report with acceptance evidence and risks. Ask about clarification or divergence before dependent changes. Scope, baseline, failed verification and stale evidence remain blockers.

Leave the plan in-progress and ask whether to mark done/archive or obtain an independent audit. End the turn. Another agent's /start-plan-audit is optional; never claim implementation verification is independent review. After explicit completion approval, use:

```text
node tools/exec-plans/complete-plan.mjs docs/exec-plans/active/<file>.md --harness .tmp/harness-report.json --approve <current-change-fingerprint>
```

If the owner requests a structured audit, add `--audit .tmp/audit-result.json` to validate that evidence. Do not fabricate an audit. Supplied audits must be clean, complete, fresh, and match the current report. Without --audit, completion requires the current passing local harness and owner approval; no audit file is read or invented. Any implementation change requires new verification and a new implementation report before approval. Archival moves a local plan file; it does not push to Git.

/update-docs is a separate, explicitly user-invoked maintenance command. It cleans maintained docs and updates their index/links from repository evidence. It never runs automatically after a plan and does not modify application code or historical plans.

Portable mode installs .agents/skills/<command>/SKILL.md plus canonical instructions in .broke-harness/commands/. Use the host's normal skill invocation or explicitly ask it to follow the file if slash discovery differs. The host's actual tools/permissions govern access; this mode does not install a sandbox. The optional OpenCode adapter supplies five command bridges, dedicated namespaced roles, and policy hooks. It delegates application writes but retains the same optional-audit, user-directed flow. Live OpenCode compatibility must be verified in the target environment. CI setup is out of scope.
