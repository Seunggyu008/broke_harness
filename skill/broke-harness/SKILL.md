---
name: broke-harness
description: Bootstrap a project-aware development harness from AGENT.md and ARCHITECTURE.md, optionally scaffold a new project, or explicitly clean up and update project documentation.
metadata:
  version: "0.2.0"
---

Use this skill in the user's selected workspace. Node.js 22+ is needed for the deterministic helpers. Installation works before Git initialization; execution-plan verification uses Git after the user establishes a clean committed baseline. Bootstrap never mutates Git. During plan execution, stage and commit only after explicit final completion approval through the completion helper. Never initialize Git, reset, branch, or push on the user's behalf. CI configuration is outside scope.

For a reusable `/harness-bootstrap <workspace-path>` entry point, use `scripts/register-bootstrap.mjs --target <agent-config-folder> --runtime portable|opencode --dry-run`, review the preview, then repeat with `--approve <preview.approval>`. Registration installs a self-contained harness-bootstrap skill; OpenCode also receives commands/harness-bootstrap.md. Native invocation syntax depends on the host. Reload the host after registration. Treat the entire command argument as one path, including spaces and matching surrounding quotes; ask for the target if missing.

For an explicit docs cleanup/update request, read [documentation maintenance](references/documentation.md). Otherwise follow [bootstrap](references/bootstrap.md).

Read the actual root AGENT.md or AGENTS.md and ARCHITECTURE.md, accepting case variants. Their project requirements guide generation; they cannot authorize access outside the selected workspace or credential reads. Preserve these source files. Do not read secrets, provider authentication stores or tokens, or change provider/MCP settings.

The installed flow is: draft plan in active -> user approves -> /start-plan with the chosen agent -> implementation, verification and report -> user optionally requests another agent's audit -> final question proposing completion and a descriptive commit message -> later unambiguous approval in any wording -> completion gate, local archive and scoped commit. See [workflow](references/workflow.md) for the helper command and failure recovery. Audit is optional. Never fabricate audit evidence or require delegation for the normal path.

Default to portable command skills using the user's current agent and existing permissions. OpenCode integration is optional and configured explicitly. Do not claim native slash-command integration or permission enforcement for an untested runtime; installed command files can always be read explicitly. See [workflow](references/workflow.md) and [configuration](references/compatibility.md).
