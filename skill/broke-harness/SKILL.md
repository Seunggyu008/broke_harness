---
name: broke-harness
description: Handle broke_harness commands to initialize or upgrade a project-aware development harness and enable its workflow commands in the current agent session.
metadata:
  version: "0.3.0"
---

Handle `broke_harness`, `/broke_harness`, or the host's explicit skill invocation (in Codex, `$broke-harness`). Resolve bundled scripts and references relative to this SKILL.md.

- `broke_harness init [workspace-path]` follows the [project-aware bootstrap](references/bootstrap.md). For a new workspace, ask whether to scaffold the project too. Existing projects receive harness setup.
- `broke_harness update [workspace-path]` follows the [harness upgrade](references/update.md). It brings an existing project harness up to the version in this skill bundle.
- `broke_harness <workflow-command> [arguments]` handles `write-plan`, `start-plan`, `implement-plan`, `start-plan-audit`, and `update-docs`. Read the matching `.broke-harness/commands/<name>.md` in the selected project and pass through the arguments. For `update-docs` before installation, follow [documentation maintenance](references/documentation.md).
- Bare `broke_harness` activates shorthand for the current agent conversation. Confirm the selected workspace and list the commands. For later messages beginning with a listed command, with an optional slash, route the remaining arguments as above. Activation itself changes no files. If the workspace changes, use the newly selected project and confirm it if ambiguous.

For `init` and `update`, default to the selected workspace when the path is omitted. When supplied, the entire remainder is one filesystem path, including spaces. Remove one matching pair of surrounding quotes, resolve relative paths against the invocation workspace, and use a literal argument. Ask for the path if no workspace is selected.

Node.js 22+ is required by the helpers. Setup and upgrade preserve source instructions, architecture, credentials, runtime settings, and Git state. Execution-plan verification uses a user-created clean Git baseline. Follow the project's [plan workflow](references/workflow.md), including a fresh independent read-only audit after passing verification and explicit completion approval before the completion helper archives and commits. Portable command discovery depends on the host. OpenCode integration is opt-in. See [configuration](references/compatibility.md).

For a one-time registration in an agent configuration folder, run `scripts/register.mjs` with `--target <folder> --runtime portable|opencode --dry-run`, review the preview, then repeat with `--approve <preview.approval>`. Reload the host after registration.
