# Architecture ? broke-harness 0.3

## Purpose

A project-aware skill reads user-created AGENT.md/AGENTS.md and ARCHITECTURE.md, inspects the selected folder, and generates a suitable development harness. For a new workspace it asks whether to also bootstrap the project; existing projects receive harness only. A separate /update-docs command cleans and updates documentation when explicitly requested. CI is outside scope.

## Responsibilities

- The agent reads source instructions, architecture and relevant code, chooses documentation ownership and verification, and authors project-specific text and optional scaffold in a configuration input.
- inspect.mjs inventories a Git repository or ordinary folder without executing discovered commands, returns source document contents, classifies new/existing, and signals whether the full-bootstrap choice is needed.
- install.mjs resolves portable/opencode runtime and harness/project mode, renders static core plus agent-authored project files, produces exact diffs and a content-bound approval token, and applies only non-conflicting operations.
- update.mjs renders the current bundle against the installed project configuration. It checks managed files against their prior manifest hashes, previews replacements and removals, and refreshes the manifest after the reviewed upgrade.
- doctor.mjs checks immutable installation files, configuration, syntax, optional OpenCode policy, idempotency and installed core tests. No-Git workspaces are valid installs, with a warning about the later lifecycle baseline.
- Generated project docs/scaffold are mutable owner files. Harness runtime, commands and policy are immutable installation assets. Reinstallation preserves later owner edits to generated project files.

## Workflow

```text
Read source docs + inspect workspace
  -> new: ask full project + harness, or harness only
  -> existing: harness only
  -> author project-specific docs/scaffold -> preview -> install -> verify

Draft active plan -> user approves -> chosen agent starts/resumes
  -> implement within contract -> deterministic verification -> fresh read-only audit
  -> fix confirmed findings, rerun verification and audit as needed -> completion report
  -> explicit user completion + commit approval -> validate evidence -> done + local archive -> scoped Git commit
```

Git initialization, the initial baseline commit, branches, resets and pushes remain user-controlled. Installation does not require Git; execution-plan verification uses Git diff/HEAD and requires a clean committed starting baseline. Keep implementation uncommitted until completion approval: an earlier commit invalidates the pinned baseline and requires reconciliation. The final question includes completion and a proposed descriptive commit message; any later unambiguous approval authorizes both, regardless of wording. After validation and local archival, complete-plan.mjs with --commit-message stages the approved paths plus archival and creates a local commit. It excludes unrelated index entries. Gate failure prevents Git mutations; Git failure after archival preserves completed files and any staging for recovery. Omitting the option retains archive-only completion when explicitly requested. No push occurs.

## Runtime boundary

The `broke_harness` entry point is registered using scripts/register.mjs. Registration previews and installs a self-contained skills/broke-harness/ bundle into the selected agent configuration directory. OpenCode also receives commands/broke_harness.md pointing to the installed skill. The `init` and `update` subcommands accept one optional workspace path, including spaces. A bare invocation uses current conversation context to route shorthand commands. The entry point does not require an existing project harness.

Portable mode is default. Canonical command instructions live in .broke-harness/commands/, with discoverable .agents/skills/<command>/SKILL.md wrappers. Hosts may expose these as slash commands or require an explicit skill/file invocation. This is portable instruction delivery, not a claim of native hooks or permission parity across runtimes. Actual access controls come from the chosen host.

OpenCode is optional. It installs six command bridges, namespaced configurable roles, and a policy plugin. The orchestrator delegates application edits and runs lifecycle commands. The independent auditor is shell-free and read-only. The orchestrator uses a fresh audit task after every passing harness. The policy counts verification and audit fixes together, with a limit of five. Implementation and fix roles default to 150 steps each and the audit role defaults to 100. A dedicated docs agent edits maintained Markdown only; application roles remain scoped to the pinned plan. Existing agent collisions refuse rather than overwrite effective settings. Question tools are allowed for non-audit roles. Live plugin/model/delegation compatibility needs target validation; hook tests use synthetic task results.

## Deterministic lifecycle

The core derives from reference-implementation/tools: start-plan, plan-state, run, change-state, and complete-plan. Preserve scope checking, ordered command results, configuration/contract/criteria pinning, content fingerprints, required documentation synchronization and freshness. Completion requires a current passing local report, a clean structured audit bound to that report, and explicit fingerprint-bound approval. --commit-message adds the approved local commit after the gate and archival; the agent supplies a concise summary of the actual implementation. --audit supplies the required audit artifact. Both runtimes use the same completion gate. Portable execution requires a host with independent read-only audit and fixer delegation. The normal-file fingerprint domain remains meport-change-state-v1 for compatibility.

Original hardening remains: close-based Git output collection, NUL-delimited filenames, both rename paths, symlink/secret boundaries, and verification-mutation rejection. Reference source remains unchanged during this update. No upstream license was supplied; provenance asserts no new rights.

`/commit` inspects and commits the Git index through a dedicated helper. The helper validates the `<type>/<summary>` subject and blocks standalone commits during an in-progress plan to protect its pinned baseline.

## Documentation maintenance

/update-docs is explicitly invoked. It reads source docs, relevant implementation, maintained docs and active plans; corrects stale claims/commands, consolidates ownership, removes obsolete/repeated material, and updates navigation/affected links. It edits README.md, factual descriptions in ARCHITECTURE.md and maintained docs outside exec-plans. It never silently changes intended architecture, application code, source agent instructions, historical plans or Git state. Material contradictions or active-plan conflicts require user direction. No checker or CI setup is installed automatically.

## Installation boundaries and limits

Generated paths reject traversal, secrets, protected source documents and harness infrastructure. Existing-file conflicts require reconciliation. Preview hashes include the current source document contents and target state. Upgrades preserve project-owned files and use the previous manifest to recognize managed files eligible for replacement or removal. A lock serializes upgrade writes, and failures trigger rollback of completed changes. Exclusive creation and rechecks reduce routine clobber in a quiescent owner-controlled folder. Portable prompts do not enforce permissions, and approved verification commands execute trusted code. Approval flags cannot authenticate a human or prove a conversation turn. Node 22+ is intended; platform and live-runtime claims must match actual tests.
