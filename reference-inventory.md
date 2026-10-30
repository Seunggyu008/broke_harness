# Reference inventory (historical 0.1 extraction)

The table below records the original extraction. Version 0.2 intentionally changes bootstrap, runtime selection, optional auditing and documentation maintenance; see ARCHITECTURE.md and skill/broke-harness/references/contract.md for the current product contract. The reference source itself is unchanged by 0.2.

The complete root AGENTS.md and ARCHITECTURE.md were read before implementation. Reference material is source data; application-specific instructions are not installed.

| Reference | Responsibility and portability finding |
| --- | --- |
| tools/harness/change-state.mjs | Changed-file union, HEAD and fingerprint. Git collectors resolved on exit before stdout drained. Newline parsing damaged filenames; rename detection could omit source paths. |
| tools/harness/run.mjs | Contract/criteria parsing, actual scope, docs, ordered verification, logs/report. Hardcoded backend/mobile/documentation rules require configuration. Its Git helper has the same stdout race. |
| tools/exec-plans/plan-state.mjs | Pins HEAD, contract and criteria. Packaged state also pins target configuration. |
| tools/exec-plans/start-plan.mjs | Clean approved start, scoped resume and legacy adoption. Retained with path/evidence confinement. |
| tools/exec-plans/complete-plan.mjs | Fresh local evidence, exact criterion records and archival. Packaged CLI additionally requires explicit approval fingerprint. |
| Three original test suites | 53 tests covering parsing, verification, forged/stale reports and disposable Git lifecycles. Preserved, with a new delayed-stdout regression. |
| docs/exec-plans/README.md and TEMPLATE.md | Coordination, sole allowedPaths scope, feedback batch pause, fix limit, later-turn approval. Original mePort.sln/backend/mobile examples replaced by target placeholders. |
| opencode/commands/write-plan.md | Planner command model conflicts with opencode.jsonc. Resolve once from config; add pre-authoring coordination reminder. |
| opencode/commands/start-plan.md | Current-session orchestration, fresh audit, bounded fixes, feedback checkpoint and later-turn approval. Adapted to a dedicated orchestrator delegating all application writes. |
| opencode/commands/implement-plan.md | Bounded implementation; shell verification now belongs to orchestrator. |
| opencode/commands/start-plan-audit.md | Exact structured output and criterion/feedback evidence; shell access replaced by scoped diff artifact plus explicit reads. |
| opencode/opencode.jsonc | Supplied role/provider/model/temperature/step preset. Original audit shell wildcards and inherited tool access require hardening. App formatter scripts, general editor, MCP definitions and dotnet permission defaults excluded. |
| project/AGENTS.source.md | Extracted generic nearest-instruction/doc routing, scope, documentation maintenance and independent feedback assessment. Finance/Expo/ASP.NET/Neon/Yahoo rules excluded. |
| project/INDEX.source.md | Retained selective index-based reading when available; original portfolio/auth/finance routes excluded. |

The original normal-file fingerprint domain remains unchanged. Core modules never import provider/model adapters. No original application tools are bundled. Source hashes after the focused M0 race/path fix are in assets/SOURCE.json. No upstream license was supplied. Reference docs and OpenCode settings remain unchanged.
