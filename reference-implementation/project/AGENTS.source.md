# Repository Instructions

mePortMobile is an MVP portfolio tracker with an Expo React Native client, an ASP.NET Core API, Neon Postgres persistence, and Yahoo Finance behind backend abstractions. Prefer simple, maintainable implementations over speculative platform design.

## Read strategy

1. Read the nearest applicable `AGENTS.md`.
2. Use `docs/INDEX.md` to select only the task-relevant specification files.
3. For approved work, read the selected plan under `docs/exec-plans/active/`; its `Harness Contract` is the authoritative change scope and verification list.

Read `ARCHITECTURE.md` only for system boundaries or broad cross-layer changes. Backend work also uses `backend/AGENTS.md`; mobile work also uses `frontend/mobile/AGENTS.md`.

## Core invariants

Intended system flow:

```text
React Native Expo app
        |
        v
ASP.NET Core Web API
        |
        +--> Neon Postgres
        |
        +--> Market data provider abstraction
                 |
                 v
             Yahoo Finance
```

Hard rules:

- Mobile never accesses Neon directly.
- Mobile never calls Yahoo Finance directly.
- Backend is the source of truth for portfolio calculations and summary data.
- Price refresh is manual for MVP.
- One failed asset refresh must not fail the entire refresh.
- If fresh price or FX data is unavailable, reuse the most recent stored value where possible and return warnings.

## Operating rules

1. Inspect the repository structure before editing.
2. Make minimal, focused changes.
3. Preserve existing style where reasonable.
4. Do not introduce features outside the documented MVP unless explicitly requested.
5. Do not hardcode credentials, secrets, Neon URLs, or local machine paths.
6. Do not expose EF Core entities directly from API responses.
7. When API contracts change, update backend DTOs and frontend types together.
8. Use decimal-compatible types for financial values and avoid floating point calculations for authoritative finance logic.
9. Add useful loading, empty, warning, and error states for user-visible flows.

## Scope control

Product scope lives in `docs/PRODUCT.md`. Authentication and multi-user work require an explicit request; see `docs/AUTH_MULTI_USER.md`.

## Documentation maintenance

When a code change adds to, removes from, or contradicts documentation, update the affected Markdown files in the same patch.

Prefer updating the most specific relevant document instead of repeating the same rule in multiple places.

Remove stale or replaced rules instead of layering conflicting ones on top.

## Final review

For final approval, follow `docs/exec-plans/README.md`. Keep the review read-only and plan-scoped. Raise findings only from direct code or artifact evidence; report unproven concerns as residual risks.

## External review feedback

When the user forwards criticism or proposed fixes from Codex or another reviewer about an implementation, treat each point as an unverified claim. This rule applies to ordinary OpenCode CLI messages; the user does not need to invoke a command or repeat these instructions.

Before editing code, tests, or documentation in response, delegate the complete feedback to a fresh, read-only `audit-pro` task. Give it the current diff, the relevant approved plan and scope, and the latest harness report when one exists. Require a separate, evidence-based assessment of every point against the current repository state. The primary agent must not confirm the feedback by itself or pass it directly to `fix-pro`.

The auditor returns its assessment to the primary agent and must not delegate fixes. Before any feedback-driven fix delegation or edit, the primary agent must assess the complete feedback batch:

- If every point is confirmed and its correction is within the approved scope, proceed automatically with only confirmed, in-scope findings through the existing fix workflow; no additional feedback approval is required.
- If any point is unsupported, unverified, or out-of-scope, pause the entire batch before delegating to `fix-pro` or editing, including fixes for already confirmed points. Show every point's assessment, repository evidence, the auditor's reasoning, and the questions or disagreements needing cross-review. End the turn and wait for the user's explicit direction resolving or disposing of those points before proceeding. Reporting disagreements alone does not authorize continuation, and the primary agent must not resolve them on the user's behalf.

Do not implement unsupported or unverified points as facts. If a valid correction exceeds the approved plan, follow the plan amendment and re-approval process before editing. After any fix, rerun the required harness and a fresh audit before requesting completion approval. If `audit-pro` is unavailable, stop the feedback-driven edit and explain that independent assessment could not run.
