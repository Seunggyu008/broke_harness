# broke-harness 0.2

A project-aware skill that creates a development harness from AGENT.md (or AGENTS.md) and ARCHITECTURE.md. A new workspace offers full project bootstrap plus harness, or harness only. Existing projects receive harness only. /update-docs separately cleans and updates documentation when the user requests it.

## Use the skill

Register the bootstrap command once, then use it from your agent:

```text
/harness-bootstrap "C:/path/to/my project"
```

The bootstrap command is registered independently of a target project's harness, so it is available before that project has any workflow files. It reads AGENT.md and ARCHITECTURE.md, asks about full bootstrap for a new workspace, and adds only the harness to an existing project. The path may contain spaces; no Git operations are performed.

For OpenCode, register into its user configuration folder (normally `~/.config/opencode`):

```text
node skill/broke-harness/scripts/register-bootstrap.mjs --target <opencode-config-folder> --runtime opencode --dry-run
node skill/broke-harness/scripts/register-bootstrap.mjs --target <same-folder> --runtime opencode --approve <preview.approval>
```

For portable skill discovery, use `--runtime portable` and point --target at the agent configuration folder containing its skills/ directory (for example `~/.agents`). The registered skill is named harness-bootstrap; use the host's explicit skill syntax if it does not expose skills as slash commands. In Codex, invoke `$harness-bootstrap "C:/path/to/my project"` or select it through /skills. See the [official skill invocation documentation](https://learn.chatgpt.com/docs/build-skills#how-codex-uses-skills). Restart/reload the agent after registration. Registration copies a self-contained bundle and preserves existing configuration; conflicting commands/skills refuse replacement. Later source updates require reviewing registration conflicts rather than silently replacing an installed copy.

You can also load skill/broke-harness/SKILL.md directly and select the target folder. The agent reads the project sources, inspects existing code, asks about full bootstrap only for a new workspace, and authors project-specific documentation and optional initial scaffold. The deterministic installer previews/validates/applies those files without overwriting existing project content.

```text
node <skill>/scripts/inspect.mjs --target <absolute-folder>
node <skill>/scripts/install.mjs --target <absolute-folder> --config <absolute-input.json> --dry-run
node <skill>/scripts/install.mjs --target <absolute-folder> --config <same-input.json> --approve <preview.approval>
node <skill>/scripts/doctor.mjs --target <absolute-folder> --tests
```

Omit --config for the default portable harness. For tailored docs or full bootstrap, the agent writes the input outside the target. See skill/broke-harness/references/compatibility.md. Installation works before Git initialization. No Git actions, CI configuration, credentials, dependencies or MCP providers are installed. The user initializes Git and commits a clean bootstrap baseline before starting the Git-based execution-plan tools.

## Use the generated workflow

1. Ask an agent to /write-plan, or create a draft in docs/exec-plans/active/ using the template.
2. Review and approve its status.
3. Run /start-plan --plan docs/exec-plans/active/<file>.md using the chosen agent. It implements, verifies, reports and asks about completion or clarification/divergence.
4. Optionally ask another agent to /start-plan-audit. Independent audit is not required for completion.
5. Approve marking done and moving the plan locally to archive. The helper validates current evidence; it never commits or pushes.
6. Invoke /update-docs explicitly when docs need cleanup, correction or reorganization. It does not run automatically.

Portable mode installs command skills under .agents/skills/ and canonical instructions under .broke-harness/commands/. Native slash discovery depends on the host; ask it to read the command file if needed. OpenCode is an explicit optional adapter, with namespaced roles and policy hooks. Other runtime-specific adapters and live-provider compatibility are not certified.

## Development

Node.js 22+ intended baseline, ESM, no npm install needed.

```text
npm test
npm run test:reference
```

Tests use disposable folders/repos and synthetic optional audit fixtures; they do not prove a real independent audit or live OpenCode run. See VALIDATION.md, ARCHITECTURE.md and reference-inventory.md. Generated project docs/scaffold become owner-editable; immutable runtime assets remain hash-checked. Existing 0.1 installations require manual conflict reconciliation rather than automatic overwrite. Windows is the exercised platform; other platforms need validation. No upstream reference license was supplied.
