# Documentation Index

Read the nearest `AGENTS.md`, then select only the documents needed for the task. An approved plan's `Harness Contract` remains the execution scope.

## Core routing

- `PRODUCT.md`: MVP scope, user flows, acceptance criteria, and canonical copy.
- `BACKEND.md`: endpoints, DTOs, services, and backend runtime behavior.
- `DATA_MODEL.md`: schema, migrations, financial types, and formulas.
- `MARKET_DATA.md`: providers, search, quotes, refresh, FX, and market-data fallback.
- `SECURITY.md`: secrets, validation, CORS, authentication security, and privacy.
- `AUTH_MULTI_USER.md`: accounts, authorization, identity, transfer, and future multi-user constraints.
- `../ARCHITECTURE.md`: system boundaries and cross-layer data flow; skip for localized work.

## Frontend routing

`FRONTEND.md` is an index. Prefer the specific topic:

- `frontend/UI_AND_SCREENS.md`: screens, components, layout, motion, accessibility, and theme.
- `frontend/CLIENT_STATE_AND_RUNTIME.md`: API client, requests, state, startup, local-first ownership, and calculations.
- `frontend/AUTH_AND_TRANSFER.md`: authentication UI/services and portfolio transfer.
- `frontend/VERIFICATION.md`: lint, tests, performance checks, and native smoke coverage.

## Canonical detail contracts

Product sections describe user-visible scope and behavior. Detailed contracts have one owner; follow section links from other documents instead of maintaining a second full description.

- [Request timeout and cancellation](frontend/CLIENT_STATE_AND_RUNTIME.md#request-timeout-and-cancellation), [Dashboard loading](frontend/CLIENT_STATE_AND_RUNTIME.md#dashboard-startup-paired-portfolio-read), [refresh/currency transitions](frontend/CLIENT_STATE_AND_RUNTIME.md#refresh-and-base-currency-transition-behavior), and [lazy loading](frontend/CLIENT_STATE_AND_RUNTIME.md#screen-lazy-loading): frontend runtime.
- [Launch presentation](frontend/CLIENT_STATE_AND_RUNTIME.md#launch-presentation-non-blank-first-paint) and [startup/render recovery](frontend/CLIENT_STATE_AND_RUNTIME.md#app-startup-and-render-recovery): frontend runtime.
- [Language preference](frontend/UI_AND_SCREENS.md#language-preference), [target-warning lifecycle](frontend/UI_AND_SCREENS.md#target-allocation-warning-notice), and [holding-card motion](frontend/UI_AND_SCREENS.md#dashboard-holdings-presentation): frontend UI.
- [Empty-state destinations and exclusions](PRODUCT.md#empty-states): product; [component/navigation wiring](frontend/CLIENT_STATE_AND_RUNTIME.md#empty-state-actions): frontend runtime.

## Reliability routing

Read `reliability/CORE.md` for cross-cutting failure policy, then only the affected domain file:

- `reliability/PORTFOLIO_AND_MARKET.md`: portfolio actions, assets, refresh, FX, and empty states.
- `reliability/STORAGE_AND_NETWORK.md`: persistence, offline behavior, requests, validation, dashboard loading, and startup.
- `reliability/OPERATIONS.md`: health, backend runtime, migrations, caching, performance, and projections.
- `reliability/AUTH_AND_LIFECYCLE.md`: authentication, transfer, preferences, export, and native smoke evidence.

Read `exec-plans/README.md` only when authoring, running, auditing, or completing an execution plan. Archived plans are history, not current specifications.
