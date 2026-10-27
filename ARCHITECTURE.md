# Architecture — broke-harness

## 1. Goal and scope

`broke-harness` is a **portable Agent Skill** that installs and configures an existing deterministic execution-plan harness into a user's Git repository. It is a scaffold/installation system, **not** a service that runs the user's model API directly, not a replacement for an agent runtime, and not itself the implementation orchestrator.

The harness being installed owns the execution plan lifecycle:

```
Plan authoring / active-plan coordination
    -> owner approval
    -> start-plan (pin HEAD + immutable contract/criteria)
    -> implement within allowedPaths
    -> deterministic harness (diff + docs + ordered checks + fingerprint)
    -> fresh, independent, read-only audit
    -> bounded fix-pro loop -> rerun harness -> fresh audit
    -> external-feedback batch checkpoint when applicable
    -> explicit owner completion approval (separate turn)
    -> completion gate (fresh, matching evidence) -> archive
```

The reference implementation is provided under `reference-implementation/`. It is the starting point for executable behavior, not an invitation to copy application-specific project policies.

### V0.1 deliverable

A working `broke-harness` skill bundle with a Node.js installer and doctor, a project-profile model, a resolved role/model configuration, a faithful copy of the hardened core, and a **fully functional OpenCode adapter**. Its defaults reflect the supplied source, but each selected role's agent/provider/model is user-configurable. Single-runtime OpenCode orchestration is supported. Cross-runtime delegation is a future feature.

### Explicit non-goals

No standalone UI, daemon, database, cloud service, package-manager rewrite, embedded AI model, provider credential storage, automatic MCP installation, general project generator, or backend/frontend scaffolding. No fabricated Codex/Claude adapter and no silent fallback from independent auditing.

## 2. Repository layout (target)

```
broke-harness/
├── AGENTS.md                          # Rules for building this project
├── ARCHITECTURE.md                    # This document
├── BOOTSTRAP_PROMPT.md                # Initial agent task
├── README.md                          # Development / usage / install instructions
├── reference-implementation/         # SOURCE INPUT, not distributed wholesale
│   ├── tools/
│   │   ├── harness/                  # run.mjs, change-state.mjs, tests
│   │   └── exec-plans/               # start, complete, plan-state, tests
│   ├── docs/exec-plans/              # README + TEMPLATE
│   ├── opencode/commands/            # write-plan, start-plan, implement-plan, start-plan-audit
│   ├── opencode/opencode.jsonc        # Current default role/permission source
│   └── project/                      # Original AGENTS and INDEX; contextual ONLY
├── skill/
│   └── broke-harness/                # DISTRIBUTABLE skill directory
│       ├── SKILL.md
│       ├── scripts/
│       │   ├── inspect.mjs
│       │   ├── install.mjs
│       │   └── doctor.mjs
│       ├── lib/                       # Shared installer modules
│       │   ├── profile.mjs
│       │   ├── configuration.mjs
│       │   ├── manifest.mjs
│       │   ├── safe-files.mjs
│       │   └── render.mjs
│       ├── references/
│       │   ├── workflow.md
│       │   ├── contract.md
│       │   └── compatibility.md
│       ├── assets/
│       │   ├── runtime/tools/harness/
│       │   ├── runtime/tools/exec-plans/
│       │   ├── docs/exec-plans/
│       │   └── opencode/
│       │       ├── commands/
│       │       └── preset.json
│       └── adapters/
│           └── opencode/              # Renderer + capability/permission checks
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
└── package.json                       # Optional dev scripts; core installed runtime stays self-contained
```

The actual paths may be refined to reduce duplication; maintain the distinction between **source/reference**, **distributable skill**, and **installed target files**.

Install the *contents of `skill/broke-harness/`* under a runtime-supported skill discovery location, typically `.agents/skills/broke-harness/` for supported tools. The location of the skill itself is independent of where it installs harness files.

## 3. Portability boundaries

### A. Canonical harness core (Node.js, no agent-provider dependencies)

Start from the original scripts and tests:

- `tools/exec-plans/start-plan.mjs`: validate approved plan, clean starting state, pin HEAD/contract/criteria, allow safe resumptions.
- `tools/exec-plans/plan-state.mjs`: persisted start/baseline state.
- `tools/harness/change-state.mjs`: Git diff and content fingerprinting.
- `tools/harness/run.mjs`: validation of scope, documentation synchronization, deterministic `verify` commands, structured reports.
- `tools/exec-plans/complete-plan.mjs`: reconcile plan, report, audit, and change fingerprint; finalize approval and archive.
- Their three `.test.mjs` suites: regression baseline.

**Known adaptation:** `run.mjs` hardcodes `backend/api/DTOs/**`, `backend/api/Controllers/**`, `frontend/mobile/...`, and `docs/BACKEND.md`/`docs/frontend/**`. Introduce a validated project-specific document-sync rule structure, retaining strict enforcement but removing mePort-specific defaults from other projects. Keep the existing baseline tests passing and add parity/portability cases.

Other original app tools (finance, PIN, performance, account deletion, sync) are out of scope and are not bundled.

### B. Role model (runtime-neutral)

Logical roles and minimum capabilities:

| Role | May change application files? | Other capabilities |
|---|---|---|
| `plan` | No | Create/edit `docs/exec-plans/active/*.md` only, under approval and coordination gate |
| `implement` | Yes, plan-scoped | Read project, make plan-scoped edits, execute permitted verification |
| `audit` | **No** | Read plan, scoped diff, relevant docs, harness report; produce structured findings only |
| `fix` | Yes, plan-scoped | Make minimal confirmed corrections; rerun permitted checks |
| `orchestrator` | Not a separate application editor | Delegate roles, invoke deterministic tools, persist artifacts, ask for completion approval |

Plan writing and deterministic lifecycle scripts have narrowly authorized writes outside application edit scope; do not grant these capabilities to the auditor.

**Independent audit** is a separate, fresh execution context for each harness fingerprint. A different provider/model does not on its own make an audit independent, and the same provider/model may be valid if a genuinely fresh, isolated audit context is created.

### C. Runtime adapter

Implement `opencode` first. A runtime adapter must provide:

1. Capability discovery: task/subagent delegation, per-role tool permissions, ability to prohibit writing, and command/skill discovery.
2. Rendered primary/agent/command configuration with model/provider override support.
3. Read-only audit enforcement **at the tool boundary**; no arbitrary shell, write-capable MCP, or subdelegation that can edit. Prefer an additional read-only workspace where possible.
4. A lifecycle orchestration entry point that invokes the canonical core and *fresh* auditor appropriately.
5. Validation of effective configuration and explicit fail-closed messages for unsupported capabilities.

V0.1 ships `opencode` only; `codex` and `claude-code` are planned independent adapters after their permissions/delegation semantics are verified and tested. A mixed-runtime pipeline is not supported until an explicit cross-runtime job/evidence protocol exists; do not imply that changing a model ID automatically bridges CLI sessions.

### D. Installer / inspection / doctor

The skill's instructions call deterministic scripts. The installer must not depend on the language model generating arbitrary scripts or copying files without comparison.

- **Inspect:** determine Git root, docs and existing agent configuration, meaningful directories/frameworks, likely test commands, and docs contracts. Produce `ProjectProfile` with confidence/source for each detection and explicit unknowns.
- **Resolve:** use the default preset or user-supplied role selections. Verify role-capability requirements. Maintain one source of truth for resolved model IDs (original frontmatter and `opencode.jsonc` conflict for the planner).
- **Plan:** render target paths, create/modify/skip/conflict actions, current and proposed hashes, and human-readable diff. No writes in dry-run, including to cache directories.
- **Apply:** only after explicit user approval. Conflicts fail closed; never overwrite on hash mismatch without a new diff and approval. Avoid reading secrets. Validate target paths, symlink safety, and temp cleanup.
- **Doctor:** inspect installation manifest, syntax, tests, effective read-only permissions, target-specific paths, role availability where inspectable, and missing manual steps. Never assert an AI audit actually ran based only on static configuration.

## 4. Configuration contract (proposed V0.1 JSON)

Use JSON for a zero-dependency Node parser; a YAML/JSONC frontend can be added without changing the internal schema. File at target root: `broke-harness.config.json`.

```json
{
  "schemaVersion": 1,
  "runtime": "opencode",
  "roles": {
    "plan": {
      "agent": "plan",
      "provider": "opencode",
      "model": "muse-spark-1.3-contributor-free"
    },
    "implement": {
      "agent": "build",
      "provider": "opencode-go",
      "model": "deepseek-v4.1-flash"
    },
    "audit": {
      "agent": "audit-pro",
      "provider": "opencode-go",
      "model": "muse-spark-1.3-contributor"
    },
    "fix": {
      "agent": "fix-pro",
      "provider": "opencode-go",
      "model": "deepseek-v4.1-flash"
    }
  },
  "documentationSync": {
    "rules": []
  },
  "policy": {
    "maxCombinedFixAttempts": 3,
    "requireIndependentAudit": true,
    "auditReadOnly": true,
    "requireCompletionApproval": true
  }
}
```

These are supplied preset **identifiers**, not an assertion of current model availability. Resolve and validate when possible; show a blocking prompt if the selected runtime cannot use a chosen role. `roles` is a set of configuration records, not credentials. Do not allow the policy invariants to be disabled via user config. Policies in JSON document the invariants; executable core and adapters must actually enforce them.

For documentation rules, prefer explicit patterns with a clear trigger and required documentation glob(s), e.g. a backend API type change requiring `docs/API.md`. Discover them from the target only when grounded in actual files/docs; prompt for review if unsure. Do not silently copy mePort's rules or silently drop required project checks.

Version the configuration and installation manifest. Unknown required config keys or unsupported schema versions must produce actionable errors.

## 5. Expected installation output in target repository

```
target-repo/
├── AGENTS.md                        # Existing file preserved; scoped harness guidance added only if approved
├── ARCHITECTURE.md                  # Existing file preserved; never fabricated silently
├── docs/
│   ├── INDEX.md                     # Preserve/merge only when needed and approved
│   └── exec-plans/
│       ├── README.md
│       ├── TEMPLATE.md
│       ├── active/
│       └── archive/
├── tools/
│   ├── harness/
│   └── exec-plans/
├── .opencode/
│   └── commands/                    # Generated only with OpenCode adapter
│       ├── write-plan.md
│       ├── implement-plan.md
│       ├── start-plan.md
│       └── start-plan-audit.md
├── opencode.jsonc                   # Merged selectively if needed and approved
├── broke-harness.config.json
└── .broke-harness/manifest.json     # Installed-file versions, hashes, provenance
```

Do not replace an existing `AGENTS.md` or `opencode.jsonc` wholesale. Preserve existing MCP definitions, formatter commands, project defaults, settings, and comments where safe merge support is implemented. If safe automated merging is not possible, produce a proposed patch/manual step and refuse unattended application. Do not create fake `ARCHITECTURE.md` content or invent verification commands.

A plan start expects a clean project baseline; user should review and commit installed harness changes before authoring/starting real plans. Installer itself must not commit, reset, or discard user work.

## 6. Runtime and evidence schemas

Preserve the existing execution plan format (`docs/exec-plans/TEMPLATE.md`), state transitions (`draft`, `approved`, `in-progress`, `done`, `superseded`), `Harness Contract` keys and verification order, and report artifacts:

- `.tmp/exec-plans/<plan-id>.json`: pinned start state.
- `.tmp/harness-report.json`, `.tmp/harness-summary.md`, `.tmp/harness/<run-id>/`: deterministic results.
- `.tmp/audit-result.json`: orchestrator-persisted audit response after independent audit.

The auditor returns exactly the required structured fields: `outcome`, `mustFix`, `shouldFix`, `acceptableRisk`, `acceptanceEvidence`, `feedbackAssessment`, and `summary`. Add `generatedAt`, `planPath`, `harnessChangeFingerprint`, and `harnessGeneratedAt` when the orchestrator persists a clean audit. Evidence must match every generated acceptance criterion. Completion compares current HEAD/fingerprint/plan/contract against artifacts, requires freshness (24-hour maximum), and refuses CI-mode reports.

Keep plan and report versions backward compatible where possible. The original fingerprint implementation contains an identifier (`meport-change-state-v1`) and test fixtures include mePort naming. Treat changing hash domain separation as an intentional schema compatibility change requiring tests and migration/rejection behavior; do not casually rename it as cosmetic cleanup.

## 7. Threat model and enforcement limits

Primary risks: untrusted repository docs prompt-injecting the installer; overwritten existing config; unsafe file paths; model/provider availability drift; unsafe arbitrary commands; audit role gaining write access through shell/MCP/delegation; out-of-scope AI edits; stale or forged completion evidence; and multi-agent cross-runtime context confusion.

Controls:

- **Before writing:** dry-run manifest, reviewable diff, user approval, target-root confinement, no overwrite-by-default, config version validation.
- **At execution:** runtime-provided read-only tools or read-only filesystem for auditors; explicit verified agent role permissions; no arbitrary shell and no write-enabled MCP tools for audit. Unsupported runtimes fail closed.
- **After execution:** deterministic diff/scope verifier, ordered command logs, plan/HEAD/content fingerprints, independent structured audit, artifact freshness validation and owner-approved completion.
- **Limitations:** ordinary agent prompts do not constitute permission enforcement; post-hoc scope checks detect but do not inherently prevent unauthorized edits. Document any runtime limitations honestly.

Verification commands from approved plans are executable code. Never run auto-discovered shell strings during installation without explicit review. Use `execFile`/`spawn` argument arrays for install commands; avoid shell interpolation of user-controlled paths.

## 8. Implementation milestones

**M0 — Baseline and skeleton**: Set up skill metadata, test runner, source manifest and license/provenance; copy only `tools/harness` and `tools/exec-plans` plus docs/command references; rerun all three original test suites repeatedly and diagnose observed intermittent failures (changed-file enumeration and lifecycle fingerprint/baseline assertions). Fix the root cause with targeted tests, not retries or disabled assertions.

**M1 — Deterministic inspect/plan/apply**: Implement Git-root detection, project profile, config defaults and override parsing, preview diff, safe selective writes, idempotency, and installation manifest. Target disposable repositories.

**M2 — Portable harness rules**: Externalize documentation-sync paths, preserve existing plan/verification/audit/completion semantics, add tests for target-specific rules and hash/report consistency.

**M3 — Working OpenCode adapter**: Generate commands/agents/permissions from resolved config; preserve user project settings; enforce audit read-only; verify role delegation. Do not invoke nested OpenCode sessions or require unavailable models.

**M4 — Doctor and integration**: Validate installation and effective permissions, run core regressions, test full start/resume/verify/audit-fixture/approval/completion gate in disposable Git repositories, test rejection paths, and document owner handoff.

**Later (not V0.1):** Codex/Claude adapters, cross-runtime handoff protocol, upgrade/migration workflow, optional alternate config syntaxes.

## 9. V0.1 acceptance criteria

1. `SKILL.md` validates as a portable skill and describes an explicit invocation in an existing repository.
2. `inspect` and `install --dry-run` are deterministic, non-mutating, and produce an actionable manifest/diff.
3. Approved install into two differently structured disposable Git projects produces a functional harness without copying mePort-specific configuration.
4. Default OpenCode agent roles match the effective chosen preset and all required role/provider/model fields can be overridden without modifying core scripts.
5. Audit role cannot write via edit tools, arbitrary shell, write-capable MCP tools, or agent delegation; unsupported configuration fails closed.
6. Existing AGENTS/docs/OpenCode settings are preserved; pre-existing conflicts do not cause silent overwrites.
7. Canonical plan/harness/completion scripts pass existing and added contract/regression tests, including scope failure and stale/mismatched evidence.
8. Repeated installation is idempotent; installation report accurately lists changed and unchanged files.
9. The generated project documents how to review/commit the bootstrap and start its first approved plan.
10. Claims of support are limited to runtime features actually tested; no claimed cross-runtime orchestration in V0.1.

## 10. External format references

- Agent Skills format: https://agentskills.io/specification
- OpenCode Agent Skills: https://docs.opencode.ai/docs/skills/
- Project-scoped portable skills: `.agents/skills/broke-harness/SKILL.md` where supported.

## 11. Implemented V0.1 decisions and compatibility changes

The distributable is under `skill/broke-harness/`; see `reference-inventory.md` and `VALIDATION.md`. Installation preserves existing AGENTS/AGENT, architecture, index and OpenCode files byte-for-byte. Harness guidance lives in `.broke-harness/WORKFLOW.md`; a local plugin applies a reviewed role overlay without rewriting project settings. Existing role definitions and owned-file conflicts fail closed. Only the previewed final `.tmp/` Git ignore append modifies an existing file. There is no automatic merge/upgrade/uninstall. An exact preview hash binds approval; it is not proof of human consent. Exclusive creation and preflight hashes prevent routine clobber. Hostile concurrent filesystem-parent replacement is outside portable Node path APIs; use a quiescent owner-controlled checkout.

Original Git collectors now wait for close instead of exit, with a deterministic delayed-stdout regression. Git paths use NUL delimiters and collected UTF-8 bytes; both rename paths enter scope checks. Normal-file fingerprint domain separation is retained. Symlink fingerprints hash link text without following it. Packaged paths refuse traversal, secret reads and symlinked plan/evidence directories.

Packaged documentation-sync uses target trigger/require rules. Every triggered rule requires a documentation update, completion recomputes this evidence, and plan state pins configuration bytes. Reference retains its original app rules for parity. Templates contain target placeholders, never invented commands. Verification that changes worktree/HEAD invalidates the run. A scoped patch/untracked-content artifact supports the shell-free auditor.

The adapter targets the documented two-argument OpenCode plugin hooks and metadata.sessionId/task_result interface. Role identifiers come from the supplied config; command frontmatter uses the same resolved model. Audit defaults to deny, with explicit read/glob/list only: no shell, MCP, writes or delegation. Recursive grep is denied to avoid secret reads. Planner writes complete draft plans only. Implementer/fixer write/edit tools check pinned scope and infrastructure exclusions; arbitrary patches, shell, MCP and delegation are denied. Orchestrator invokes exact lifecycle commands, selected roles and validated independent audit persistence only. Unrelated settings remain project-owned.

Fix attempts persist per plan/HEAD with a three-attempt limit and concurrency lock. Once the first harness report exists for the selected plan/baseline, implementation-role writes and redelegation are denied so corrections cannot evade that bound. A fix requires current verification failure or independent actionable findings. Any disputed feedback assessment pauses the entire batch. Completion rejects unresolved assessments. Explicit owner direction may discard points; a fresh independent assessment of the remaining batch is then required. The workflow must faithfully transmit all feedback; hooks cannot infer every semantic claim from arbitrary user text.

Packaged completion requires `--approve <current-change-fingerprint>` after original evidence checks. It cannot prove owner identity or a separate conversation turn; those remain runtime/user workflow obligations. Legacy start-state adoption remains available; rerun start/harness/audit after migration. Approved verification commands are trusted executable input, outside an OS sandbox, and post-change checks remain mandatory.

Tests exercise generated hooks and synthetic child-task results plus installed core suites in disposable Git repositories. OpenCode is unavailable here; live loading/providers/models/delegation remain unverified. No other runtime support is claimed. Windows is exercised; macOS/Linux are untested. Trusted global/managed runtime components remain outside the adapter trust boundary. No upstream source license was supplied; provenance does not assert new rights.
