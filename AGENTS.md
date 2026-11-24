# Repository instructions ? broke-harness

Build a portable Agent Skill matching the user's project-aware bootstrap and execution-plan workflow. Direct user instructions take precedence over historical reference behavior.

## Product contract

- Read root AGENT.md or AGENTS.md and ARCHITECTURE.md, accepting case variants.
- If only those documents and incidental workspace metadata exist, ask whether to bootstrap the full project plus harness. Yes authorizes an appropriate initial project scaffold; no creates harness only.
- Existing projects receive harness structure and relevant documentation only; never regenerate their application.
- Generate project-specific structure/docs from those source documents and repository evidence. Keep application-specific mePort rules out of the bundle.
- Default to portable commands with the user's chosen agent; OpenCode is an optional adapter. Do not claim untested native runtime integration or sandboxing.
- The user or agent drafts an active plan for user approval. /start-plan implements it, verifies it, delegates a fresh read-only audit and asks about completion after a clean result. Never fabricate independent review.
- Explicit final approval authorizes the completion gate, local done/archive and a scoped commit with a descriptive message. Ask about these actions together; any later unambiguous approval, regardless of wording, runs them without another approval prompt. Commit only after the gate passes. Git initialization, the initial baseline commit, branches and pushes belong to the user. Deterministic lifecycle checks require a clean committed baseline. CI configuration is outside scope.
- /update-docs is a separate explicit user command for documentation cleanup/update, not an automatic post-implementation hook.

## Implementation rules

Read ARCHITECTURE.md for boundaries. reference-implementation is historical input; inspect corresponding source/tests before changing packaged core behavior, but do not mutate the reference during routine changes. Record intentional differences and preserve meaningful regressions.

Keep Node.js ESM tooling self-contained. The agent interprets project intent and authors file contents; deterministic scripts inspect, validate, preview, compare, install and diagnose. Do not depend on model APIs, services, databases or third-party packages for installation.

Preserve source instruction/architecture files, existing application files, runtime settings and unrelated user changes. Preview conflicts rather than overwriting them. Approval hashes bind exact content, not human identity. Installation must be non-mutating in dry-run, idempotent, and confined to the selected workspace. Defend against traversal, secrets, symlink escapes and unexpected overwrite.

Keep scope, immutable plan/criteria, ordered verification, required docs, content fingerprints, freshness, and owner approval checks. Completion requires a clean structured audit bound to the current passing harness report. Never treat prompts or post-change scope checks as a sandbox.

Test observable bootstrap branches, rejection of missing audit evidence and audited completion, approved scoped commits, existing-file preservation, docs-maintenance permissions, configurable runtime roles, path safety and regression behavior in disposable folders/repos. Do not commit project changes before final completion approval, push, or delete untracked user files. Do not touch credentials, provider auth stores or install MCP providers.
