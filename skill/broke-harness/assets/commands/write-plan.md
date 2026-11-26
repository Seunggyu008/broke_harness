# Write a bounded draft execution plan for user approval

Read root AGENT.md or AGENTS.md (case-insensitive), ARCHITECTURE.md, docs/INDEX.md when present, and docs/exec-plans/TEMPLATE.md. Inspect the relevant code and every active plan before authoring.

Create one draft plan in docs/exec-plans/active/YYYY-MM-DD-title.md. Derive scope, documentation changes, commands, and criteria from this project. When the request or project defines a concrete maintainability requirement for the change, record it as a verifiable acceptance criterion. Record overlaps with active plans; ask the user about material conflicts before choosing an ordering. allowedPaths is the sole edit scope and verify is the sole required command list. Do not invent existing files, available commands, or passing checks.

Do not implement application code or grant approval. Present the draft and leave status draft for the user to approve. A manually authored plan uses the same template and lifecycle. Once approved, the user can invoke /start-plan --plan <path> with the agent of their choice. Do not run Git mutations or create CI configuration.
