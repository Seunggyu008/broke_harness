# Approved completion and commit validation — 2026-11-09 (Asia/Seoul)

Final approval now covers the completion gate, done/archive transition and a scoped local commit with an agent-authored descriptive message. The completion helper accepts --commit-message; omitting it preserves explicit archive-only completion. Bootstrap continues to leave Git unchanged.

- `npm test`: 88/88 passed, zero failures/skips/cancellations. The installation doctor also ran all 57 installed core regressions successfully.
- `npm run test:reference`: 54/54 passed. Historical reference source remains unchanged.
- Portable and OpenCode installations committed approved implementation and archival for new, staged and previously committed plans. Fixtures cover partially staged implementation, added files, deleted files, staged renames, spaces and literal bracket characters in paths, exact commit messages and clean final Git state.
- Missing/wrong approval, failed/stale reports and post-review changes prevented commits and preserved active work and the index. A rejecting commit hook left the plan archived and files staged, reported the commit failure explicitly and allowed recovery without rerunning archival.
- Audited completion created a commit only after current audit validation. Synthetic OpenCode policy hooks accepted safe quoted messages, including Korean, and rejected shell interpolation and raw Git commands.
- Staged-rename coverage exposed an existing diff-artifact bug: deleted index paths were mistaken for untracked files. Evidence collection now queries actual untracked files; regression fixtures assert their contents and the rename-source patch.
- After narrowing the registered bootstrap entry point's Git restriction to bootstrap itself, `node --test tests/bootstrap-command.test.mjs` passed 3/3. Skill creator validation and `git diff --check` passed.

Executed on Windows with Node.js v24.14.0. Git writes occurred only in disposable test repositories. No user repository commit/push or installed user-skill update was performed. Live agent approval interpretation and live OpenCode execution remain instruction-driven and were not independently exercised.

---

# Bootstrap command registration validation ? 2026-10-30

Added a pre-install harness-bootstrap entry point with deterministic registration into a chosen agent configuration directory. Portable registration creates a self-contained skills/harness-bootstrap/ bundle. Optional OpenCode registration also creates commands/harness-bootstrap.md. No target project needs an existing harness.

- `npm test`: 79/79 passed, zero skipped/cancelled, including three new registration tests.
- Registration tests verify non-mutating preview, stale-token/conflict rejection, idempotency, independent execution of the copied inspector from another working directory, paths with spaces, existing settings preservation, and symlink/recursive-target refusal.
- Skill validator passed for the source skill, a disposable registered alias, and the actual registered user alias. Node syntax check passed for register-bootstrap.mjs. `git diff --check` passed.
- At the user's selection, portable registration was applied to C:/Users/GCLabs/.agents/skills/harness-bootstrap/ with 40 files and no conflicts. A repeat preview skips every file. No existing skills/configuration were modified. No OpenCode user command was registered.
- Native host discovery and live model bootstrap execution remain separate from filesystem registration. Official OpenAI documentation confirms user skills under ~/.agents/skills and explicit dollar/skill-picker invocation; restart/reload if discovery does not refresh.

---

# 0.2 validation ? 2026-10-30 (Asia/Seoul)

Executed on Windows with Node.js v24.14.0. The implementation follows the user-directed bootstrap/report/optional-audit flow; CI configuration is outside scope. The 0.1 record below is historical and does not define the current product contract.

| Check | Result | Evidence |
| --- | --- | --- |
| `npm test` after final functional changes | 76/76 passed; zero skipped/cancelled | `validation/v0.2-full-2026-10-30.log` (ignored local log) |
| `node --test tests/product-flow.test.mjs` | 7/7 passed | Repeated while implementing the new product branches; included in the final full run |
| Skill creator `quick_validate.py skill/broke-harness` | Valid | Executed in this session |
| `node --check` for distributable Node modules | 20 modules valid | Executed in this session; full tests also load generated runtime assets |
| Configuration documentation example | Valid JSON | Parsed with Python json.loads |
| `git diff --check` | Passed | Executed with normal repository line-ending settings |

New behavioral coverage includes case-insensitive source document discovery and actual source contents; docs-only folders before Git initialization; content-bound non-mutating previews; harness-only versus explicit full bootstrap; application scaffolding and authored domain docs; existing/ignored project detection; preservation of source files and an existing index; external input paths; owner edits and removal of generated docs surviving reinstallation; completion without audit artifacts; rejection of failed/stale/mismatched evidence and absent approval; retained validation when an audit is supplied; no automatic Git initialization, staging, commit or push; docs-only edits/consolidation patches, protected code/instructions/plan paths and question tools; and JSONC/runtime role collisions without overwriting built-in agents.

The original integration fixtures explicitly select the optional OpenCode adapter. The default portable path is exercised separately. Doctor runs the 56 installed core regressions in a disposable target as part of integration testing. No source files under reference-implementation/ were changed; its previously passing 54-test baseline remains historical reference evidence.

Limits: the agent's interpretation and application design are instruction-driven; fixture blueprints test deterministic installation, not a live model's project-generation quality. Documentation-maintenance tests exercise command delivery and actual policy hooks, not a live agent rewrite of a production documentation tree. Native slash discovery and live OpenCode provider/model/delegation behavior remain unverified. No new dedicated adapter for another runtime is claimed. Portable mode uses existing host permissions and explicitly supports reading command files when native discovery differs. Git is required for regression tests and execution-plan verification, but not for target initialization/installation. No Git mutations were performed in the user's repositories; disposable fixtures create their own baselines.

---

# V0.1 validation record

Executed on Windows with Node.js **v24.14.0**, on **2026-10-27 (Asia/Seoul)**. Commands below run from this repository root. No dependencies or MCP providers were installed. No project commits or pushes were made; disposable test repositories create their own fixture commits and are removed afterward.

Raw logs remain local under `validation/` and are ignored by Git. The artifact paths below refer to those local files; this summary and the executable tests are intended for version control.

| Command / check | Result | Evidence |
| --- | --- | --- |
| `node --test reference-implementation/tools/harness/run.test.mjs reference-implementation/tools/exec-plans/complete-plan.test.mjs reference-implementation/tools/exec-plans/lifecycle.test.mjs` before changes | 53/53 | `validation/baseline-before.log` |
| `node --test reference-implementation/tools/harness/*.test.mjs reference-implementation/tools/exec-plans/*.test.mjs` after M0 | 54/54 in three consecutive runs | `validation/baseline-after-{1,2,3}.log` |
| `node --test reference-implementation/tools/exec-plans/lifecycle.test.mjs` | 12/12 in isolation | `validation/lifecycle-isolated.log` |
| `node --test tests/*.test.mjs skill/broke-harness/assets/runtime/tools/harness/*.test.mjs skill/broke-harness/assets/runtime/tools/exec-plans/*.test.mjs` | 67/67, zero skipped/cancelled | `validation/full-final.log`; `validation/full-second.log` |
| `node --test tests/*.test.mjs` | 13/13, zero skipped/cancelled; includes a doctor child run of all 54 installed core tests | `validation/integration-final-current.log` |
| `node --test --test-name-pattern='existing configuration' tests/integration.test.mjs` | 1/1, including CommonJS project and ignored OpenCode files | `validation/commonjs-check.log` |
| `node --test --test-name-pattern='actual OpenCode' tests/integration.test.mjs` | 1/1 after final adapter hardening, including denied implementer reuse after harness and all audit/fix gates | `validation/adapter-final.log` |
| `python C:/Users/GCLabs/.codex/skills/.system/skill-creator/scripts/quick_validate.py skill/broke-harness` | Skill is valid | `validation/skill-check.log` |

The skill validator belongs to the development environment and is not a runtime dependency. The bundle contains no required third-party packages. Equivalent npm scripts are declared in package.json; no npm install is needed.

## Intermittent lifecycle investigation

The first unchanged baseline run passed; spontaneous historical failures were not reproduced during this session. Inspection found both Git collectors resolving on process `exit`, which does not guarantee stdout has drained. Missing changed-file output and missing HEAD values can then invalidate scope/fingerprint/baseline assertions. Both collectors now wait for `close`.

`reference-implementation/tools/harness/change-state.test.mjs` injects a process that emits exit, then delayed split UTF-8 stdout, then close. A disposable copy with the old exit collector **fails deterministically**, returning empty output. The proof runner expected that failure, then removed its own temporary directory. See local artifact `validation/race-proof.log`. The corrected collector passes in all recorded runs. This establishes a concrete output-loss race consistent with the historical symptoms; it does not prove every historical intermittent failure had the same cause. No retries or assertions were removed to hide failures.

Git paths now use NUL records; both sides of renames are scoped. Packaged fingerprints do not follow symlink targets or inspect secret paths. Normal-file fingerprint domain separation remains unchanged. Intentional portability/security differences are documented in ARCHITECTURE.md and the distributed references/contract.md.

## Acceptance coverage

The integration suite installs the actual skill assets into disposable repositories with empty/existing harness state, unrelated untracked work, project instructions/aliases, documentation indexes, root CommonJS and nested Node manifests, a .NET manifest, existing JSONC comments/MCP/formatter settings, ignored runtime configuration and pre-existing conflicts.

It checks non-mutating deterministic previews, content-bound approval, byte preservation, conflict refusal, idempotency, role/provider/model overrides, schema/policy rejection, unsupported runtimes, traversal/Windows paths/spaces/Unicode, symlink/secret boundaries, independent documentation rules, immutable configuration, verification failure/mutation, scope divergence, stale evidence, wrong/missing approval, successful archival, CLI installation and doctor execution.

The generated OpenCode plugin is imported and its actual documented hook functions are exercised. Audit write/edit/patch/bash/MCP/task attempts throw before execution and leave application contents unchanged. Implementation writes require pinned allowedPaths and cannot reach harness infrastructure. Planner cannot edit application code or approve a plan. Unknown identities/models fail closed. Audit task reuse is rejected, child task metadata binds clean evidence, forged audit persistence is rejected, disputed feedback pauses all fixes, and the three-attempt bound survives a new plugin session.

After the first harness report for a plan/baseline, the implementation role cannot edit or be redelegated to bypass the fixer attempt bound. The final adapter check verifies both denials. Initial implementation/resume before that report remains available.

Doctor checks source hashes, syntax, resolved policy/delegation, ignored artifacts, canonical idempotency and installed core tests. Child tests explicitly remove inherited NODE_TEST_CONTEXT so they really execute rather than returning an empty successful test process.

Earlier development failures are retained locally in `validation/packaged-first.log` and `validation/integration-first.log`: the intentional completion-approval change initially needed its fixture updated; a CRLF-sensitive expectation and inherited child test context were then corrected. Final runs pass without skipping those assertions.

## Unverified boundaries

- OpenCode is not installed here. Live plugin discovery/loading, effective managed/global configuration, provider/model availability and real AI delegation have not been exercised. Contract tests use synthetic child-task/audit outputs and never claim a real independent audit occurred.
- Node.js 22 is the intended minimum; this session tested Node.js 24.14.0. macOS and Linux were not run.
- Trusted runtime plugins and managed settings can change behavior. Tool hooks are not an OS sandbox for owner-approved verification commands or manual terminal actions.
- Approval flags bind acknowledgments to reviewed content; they cannot authenticate a human or prove a separate conversation turn. Complete feedback transmission and explicit owner direction remain workflow obligations. Discarded points require a fresh assessment of the remaining batch.
- Install in a quiescent owner-controlled checkout. Portable path checks cannot defend against every hostile concurrent filesystem replacement. Updates/merges/uninstall are manual; conflicts fail closed. No reference license was supplied.
