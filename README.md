# broke-harness V0.1

A portable Agent Skill that installs the supplied contract-driven execution-plan harness into an existing Git repository. Node.js 22+ and Git are the core dependencies. The default adapter targets a single OpenCode runtime. Codex, Claude Code and mixed-runtime orchestration are rejected.

The executable core is adapted from `reference-implementation/`. See [inventory](reference-inventory.md), [architecture](ARCHITECTURE.md), [compatibility changes](skill/broke-harness/references/contract.md), and [validation](VALIDATION.md).

## Structure

```text
skill/broke-harness/
  SKILL.md
  scripts/                 inspect.mjs, install.mjs, doctor.mjs
  lib/                     safe-files, profile, configuration, render, manifest, CLI
  adapters/opencode/       role renderer and executable policy hooks
  assets/
    SOURCE.json            source hashes and provenance
    runtime/tools/         canonical harness, lifecycle scripts, original suites
    docs/exec-plans/        portable README and TEMPLATE
    opencode/commands/     four adapted original command contracts
  references/              workflow, contract, compatibility
tests/integration.test.mjs
```

## Install elsewhere

Copy the entire `skill/broke-harness/` directory to a supported skill location, for example `<target>/.agents/skills/broke-harness/`. It can also live outside the target. Use absolute script paths and select the explicit Git root. PowerShell example:

```powershell
$skillPath = 'C:\path\to\broke-harness'
$targetPath = 'C:\path\to\existing project'
node "$skillPath/scripts/inspect.mjs" --target "$targetPath"
node "$skillPath/scripts/install.mjs" --target "$targetPath" --dry-run
# Review every operation, diff, role and warning, then explicitly approve:
node "$skillPath/scripts/install.mjs" --target "$targetPath" --approve '<preview.approval>'
node "$skillPath/scripts/doctor.mjs" --target "$targetPath" --tests
```

The preview writes nothing. Its approval hash binds the exact target, discovered state and proposed content. Obtain owner approval before applying it; repository changes require a fresh preview. Existing configuration and instructions are preserved. Harness conflicts refuse installation with diffs; there is no force-overwrite option. A repeated unchanged installation skips every file.

For custom agents/providers/models, temperature/step limits and documentation-sync rules, create a reviewed JSON input in the target and pass `--config <relative-file>` to both preview and apply. See [configuration examples](skill/broke-harness/references/compatibility.md). Partial overrides inherit the supplied preset. The planner default follows the original config rather than conflicting command frontmatter. Model IDs are presets, not availability guarantees. No dependencies, credentials or MCP providers are installed.

Generated target files are `tools/harness/`, `tools/exec-plans/`, `docs/exec-plans/`, `broke-harness.config.json`, manifest/provenance/workflow/role overlay under `.broke-harness/`, and commands plus a policy plugin under `.opencode/`. An approved final `.tmp/` ignore rule is appended. Existing AGENTS/AGENT, architecture, documentation index and OpenCode files remain intact. Review and commit the bootstrap yourself before starting a real plan; the installer never commits.

Restart OpenCode at the target root, then use:

```text
/write-plan <bounded request>
# Owner reviews the draft and changes its status to approved.
/start-plan --plan docs/exec-plans/active/YYYY-MM-DD-title.md
```

The orchestrator delegates application edits, invokes the harness, obtains a fresh independent auditor, and bounds combined fix attempts to three. Auditor has no write tools, shell, MCP or delegation. Implementation/fix writes are checked against pinned scope. After clean evidence, the command requests completion approval and ends the turn. Completion in a later turn requires `--approve <current-fingerprint>`. No nested runtime sessions are launched. Read [workflow](skill/broke-harness/references/workflow.md) before use.

The deterministic tools also run without OpenCode:

```text
node tools/exec-plans/start-plan.mjs docs/exec-plans/active/<file>.md
node tools/harness/run.mjs --plan docs/exec-plans/active/<file>.md
node tools/exec-plans/complete-plan.mjs docs/exec-plans/active/<file>.md --harness .tmp/harness-report.json --audit .tmp/audit-result.json --approve sha256:<fingerprint>
```

These tools do not themselves run an AI auditor. Independent audit and owner approval remain required; never fabricate application audit evidence.

## Development tests

```text
node --test reference-implementation/tools/harness/*.test.mjs reference-implementation/tools/exec-plans/*.test.mjs
node --test tests/*.test.mjs skill/broke-harness/assets/runtime/tools/harness/*.test.mjs skill/broke-harness/assets/runtime/tools/exec-plans/*.test.mjs
node --test tests/*.test.mjs
```

Equivalent scripts are `npm run test:reference`, `npm test`, and `npm run test:integration`; no npm install is needed. The original 53 tests passed before adaptation. A delayed-stdout regression demonstrates the exit-before-stdio-close race; three patched reference runs passed 54/54. Integration tests use disposable Git repositories and synthetic task/audit fixtures. They exercise installed regressions, CLI, preservation/conflicts/idempotency, overrides, paths/secrets/symlinks, write denials, scope/configuration/freshness/approval gates and archival. Synthetic fixtures never substitute for a real independent audit.

## Limits

OpenCode is absent here. Generated configuration and actual hook functions are tested against the documented API and synthetic child-task results; live plugin loading, provider/model availability and real delegation are unverified. Validate the effective runtime before application work. Global plugins and managed settings are trusted external components.

Approved verification commands are executable trusted input, outside the tool-write boundary. The completion flag cannot authenticate an owner or prove a conversation turn. The feedback checkpoint requires faithful transmission of the complete batch; disputed points need owner direction and fresh assessment. Installation should occur in a quiescent owner-controlled checkout; portable Node APIs cannot prevent a hostile concurrent replacement of filesystem parents. No automatic upgrade/merge/uninstall is supplied. Windows is tested; macOS/Linux are untested. No upstream reference license was supplied, and no new third-party rights are asserted.
