# broke-harness 0.3

A project-aware skill that creates and upgrades a development harness. Initialization uses AGENT.md (or AGENTS.md) and ARCHITECTURE.md to tailor the harness and optionally scaffold a new project.

## Use the skill

Enter a command in your agent conversation.

```text
broke_harness init "C:/path/to/my project"
broke_harness update "C:/path/to/my project"
broke_harness
```

- `init` runs project-aware setup. It offers full project scaffolding for a new workspace and sets up the harness in an existing project.
- `update` refreshes harness files from the loaded skill bundle. It previews changes, preserves project code, configuration, docs and plans, and reports edits to managed files that require reconciliation.
- Bare `broke_harness` enables shorthand for the rest of the conversation. Use commands like `write-plan`, `start-plan --plan docs/exec-plans/active/example.md`, `commit`, `update-docs`, or `update` directly.

Omit the path to use the selected workspace. Before activating shorthand, use the prefix with a workflow command, such as `broke_harness write-plan`. In Codex, use `$broke-harness` to select the skill explicitly. In OpenCode, the registered entry point is `/broke_harness`.

### Register the entry point

Preview a new registration in your agent configuration, then apply it with the returned approval hash.

```text
node skill/broke-harness/scripts/register.mjs --target <agent-config-folder> --runtime portable --dry-run
node skill/broke-harness/scripts/register.mjs --target <same-folder> --runtime portable --approve <preview.approval>
```

Point `--target` at the folder containing your agent's `skills/` directory, such as `~/.agents` for Codex. For OpenCode, use `--runtime opencode` and its user configuration folder. Reload the host after registration. Registration reports collisions with existing skill or command files. If you already have an older copy of the skill, update that copy through your usual skill installation process, or load the current `skill/broke-harness/SKILL.md` directly.

### Run the project helpers directly

```text
node <skill>/scripts/inspect.mjs --target <absolute-folder>
node <skill>/scripts/install.mjs --target <absolute-folder> --config <absolute-input.json> --dry-run
node <skill>/scripts/install.mjs --target <absolute-folder> --config <same-input.json> --approve <preview.approval>
node <skill>/scripts/update.mjs --target <absolute-folder> --dry-run
node <skill>/scripts/update.mjs --target <absolute-folder> --approve <preview.approval>
node <skill>/scripts/doctor.mjs --target <absolute-folder> --tests
```

Omit --config for the default portable harness. For tailored docs or full bootstrap, the agent writes the input outside the target. See skill/broke-harness/references/compatibility.md. Installation works before Git initialization. No Git actions, CI configuration, credentials, dependencies or MCP providers are installed. The user initializes Git and commits a clean bootstrap baseline before starting the Git-based execution-plan tools.

## Use the generated workflow

1. Ask an agent to /write-plan, or create a draft in docs/exec-plans/active/ using the template.
2. Review and approve its status.
3. Run /start-plan --plan docs/exec-plans/active/<file>.md using the chosen agent. It implements the plan, runs the harness and delegates a fresh read-only audit after verification passes.
4. The fixer addresses verification failures and confirmed in-scope audit findings, with up to five total attempts. The orchestrating agent reruns verification and the audit after edits, then reports the clean result and requests completion approval.
5. Approve running the completion gate, marking done, archiving the plan and committing with the proposed descriptive message. Any clear approval in a later message runs the gate and creates the local commit; the agent reports its hash and message. Failed evidence prevents the commit. No push occurs.
6. Invoke /update-docs explicitly when docs need cleanup, correction or reorganization. It does not run automatically.

Portable mode installs command skills under .agents/skills/ and canonical instructions under .broke-harness/commands/. Native slash discovery depends on the host. The chosen host needs independent read-only audit and fixer delegation to run /start-plan. OpenCode is an explicit optional adapter, with namespaced roles and policy hooks. Other runtime-specific adapters and live-provider compatibility are not certified.

Use `/commit [--plan <path>]` to commit staged changes locally outside an in-progress plan. The subject uses the plan's type and a concise summary, such as `fix/Preserve task order`.

## Development

Node.js 22+ intended baseline, ESM, no npm install needed.

```text
npm test
npm run test:reference
```

Tests exercise installation, upgrades, the completion gate and OpenCode hooks in disposable repositories with synthetic audit results. See VALIDATION.md, ARCHITECTURE.md and reference-inventory.md. Windows is the exercised platform. No upstream reference license was supplied.
