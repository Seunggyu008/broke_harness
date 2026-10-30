# Architecture ? broke-harness 0.2

## Purpose

A project-aware skill reads user-created AGENT.md/AGENTS.md and ARCHITECTURE.md, inspects the selected folder, and generates a suitable development harness. For a new workspace it asks whether to also bootstrap the project; existing projects receive harness only. A separate /update-docs command cleans and updates documentation when explicitly requested. CI is outside scope.

## Responsibilities

- The agent reads source instructions, architecture and relevant code, chooses documentation ownership and verification, and authors project-specific text and optional scaffold in a configuration input.
- inspect.mjs inventories a Git repository or ordinary folder without executing discovered commands, returns source document contents, classifies new/existing, and signals whether the full-bootstrap choice is needed.
- install.mjs resolves portable/opencode runtime and harness/project mode, renders static core plus agent-authored project files, produces exact diffs and a content-bound approval token, and applies only non-conflicting operations.
- doctor.mjs checks immutable installation files, configuration, syntax, optional OpenCode policy, idempotency and installed core tests. No-Git workspaces are valid installs, with a warning about the later lifecycle baseline.
- Generated project docs/scaffold are mutable owner files. Harness runtime, commands and policy are immutable installation assets. Reinstallation preserves later owner edits to generated project files.

## Workflow

```text
Read source docs + inspect workspace
  -> new: ask full project + harness, or harness only
  -> existing: harness only
  -> author project-specific docs/scaffold -> preview -> install -> verify

Draft active plan -> user approves -> chosen agent starts/resumes
  -> implement within contract -> deterministic verification -> implementation report
  -> user may request another agent's independent audit
  -> explicit user completion approval -> validate evidence -> done + local archive
```

Git initialization, staging, commits, branches, resets and pushes remain user-controlled. Installation does not require Git; execution-plan verification uses Git diff/HEAD and requires a clean committed starting baseline. A commit during execution invalidates the pinned baseline and requires reconciliation. Archival is a local file move, not a Git operation.

## Runtime boundary

The pre-install `/harness-bootstrap <workspace-path>` entry point is registered separately using scripts/register-bootstrap.mjs. Registration previews and installs a self-contained skills/harness-bootstrap/ bundle into the selected agent configuration directory. OpenCode additionally receives commands/harness-bootstrap.md referencing the copied skill. It preserves existing settings, refuses collisions and needs no target-project harness. A missing path prompts the user; the whole argument is a single path. Host skill invocation syntax may differ from slash commands.

Portable mode is default. Canonical command instructions live in .broke-harness/commands/, with discoverable .agents/skills/<command>/SKILL.md wrappers. Hosts may expose these as slash commands or require an explicit skill/file invocation. This is portable instruction delivery, not a claim of native hooks or permission parity across runtimes. Actual access controls come from the chosen host.

OpenCode is optional. It installs five command bridges, namespaced configurable roles, and a policy plugin. The orchestrator delegates application edits and runs lifecycle commands. The optional auditor is shell-free/read-only and cannot delegate. A dedicated docs agent edits maintained Markdown only; application roles remain scoped to the pinned plan. Existing agent collisions refuse rather than overwrite effective settings. Question tools are allowed for non-audit roles. Live plugin/model/delegation compatibility needs target validation; hook tests use synthetic task results.

## Deterministic lifecycle

The core derives from reference-implementation/tools: start-plan, plan-state, run, change-state, and complete-plan. Preserve scope checking, ordered command results, configuration/contract/criteria pinning, content fingerprints, required documentation synchronization and freshness. Completion requires a passing current local report and explicit fingerprint-bound approval. --audit opts into full structured audit validation; absence of audit is valid and never produces fabricated review evidence. The normal-file fingerprint domain remains meport-change-state-v1 for compatibility.

Original hardening remains: close-based Git output collection, NUL-delimited filenames, both rename paths, symlink/secret boundaries, and verification-mutation rejection. Reference source remains unchanged during this update. No upstream license was supplied; provenance asserts no new rights.

## Documentation maintenance

/update-docs is explicitly invoked. It reads source docs, relevant implementation, maintained docs and active plans; corrects stale claims/commands, consolidates ownership, removes obsolete/repeated material, and updates navigation/affected links. It edits README.md, factual descriptions in ARCHITECTURE.md and maintained docs outside exec-plans. It never silently changes intended architecture, application code, source agent instructions, historical plans or Git state. Material contradictions or active-plan conflicts require user direction. No checker or CI setup is installed automatically.

## Installation boundaries and limits

Generated paths reject traversal, secrets, protected source documents and harness infrastructure. Existing-file conflicts are never force-overwritten. Preview hashes include the current source document contents and target state. Exclusive creation and rechecks reduce routine clobber; hostile concurrent filesystem-parent replacement is outside portable Node guarantees. Install in a quiescent owner-controlled folder. Updates/merges/uninstall remain manual. Portable prompts do not enforce permissions, and approved verification commands execute trusted code. Approval flags cannot authenticate a human or prove a conversation turn. Node 22+ is intended; platform and live-runtime claims must match actual tests.
