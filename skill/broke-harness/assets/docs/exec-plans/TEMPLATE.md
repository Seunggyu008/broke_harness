# Execution Plan: <short title>

## Metadata

- Status: `draft`
- Type: `feature | refactor | fix`
- Created: `YYYY-MM-DD`
- Owner: `<person or agent>`
- Target Area: `<target repository area>`
- Source Request: `<short summary or link>`

## Objective

<Describe the observable outcome in 1-3 sentences.>

## Non-Goals

- <Explicitly out of scope work>

## Active Plan Coordination

- Reviewed: `<each relevant file under docs/exec-plans/active/, or "No other active plans">`
- Coordination: `<path/scope/assumption overlap and confirmed ordering or scope decision, or "No material interaction">`

Before creating this file, inspect every active plan's planned changes and `Harness Contract.allowedPaths`. If another active plan may change this plan's paths, contracts, behavior, or implementation assumptions—or this plan may change theirs—obtain explicit confirmation from the user or designated owner before choosing an ordering, scope split, supersession, or combined behavior and before creating the plan. Record that decision above. Do not assume that a later plan or implementation will rebase automatically. For shared files with no material conflict, explain why sequential edits preserve both contracts.

## Context

- Docs: `<relevant existing project documents; use the documentation index when present>`
- Inspect: `<existing path>` — <why it matters>
- Current behavior: <brief facts needed to implement safely>

Do not list `AGENTS.md`, `docs/INDEX.md`, or this workflow guide; `/start-plan` already loads them. Do not use archived plans as current specifications.

## Planned Changes

- `<path or area>`: <concise change and any important contract effect>

This section explains the implementation. It does not add edit scope beyond `Harness Contract.allowedPaths`.

## Harness Contract

```json
{
  "allowedPaths": [
    "<reviewed repository-relative path or glob>"
  ],
  "verify": [
    "<reviewed deterministic command discovered in this repository>"
  ],
  "requiresDocs": true
}
```

`allowedPaths` is the sole edit and audit scope. `verify` is the sole required-command list. Commands run from the repository root. The plan file itself is excluded from scope checks.

## Acceptance Criteria

- <One concrete observable outcome per top-level bullet>
- <Include required deterministic coverage or compatibility behavior>

The harness assigns stable-in-order IDs (`AC-1`, `AC-2`, and so on). The implementation report explains the evidence and remaining uncertainty for each criterion. If the user requests an independent structured audit, it provides one evidence record per ID. Audit is optional.

## Optional Runtime Checks

Include only when rendered, device, or human observation would add useful evidence. These checks are not `/start-plan` completion gates.

- <Optional runtime observation>

## Risks / Follow-Ups

- <Known risk, open question, or explicitly optional later work>
