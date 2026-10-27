# Configuration and compatibility

Node.js 22+ and Git are the only core dependencies. The installer requires the explicit Git root, works without an initial commit, preserves user files, and refuses conflicting owned files. V0.1 has no automatic upgrade/merge or uninstall. Resolve existing harness conflicts manually from the preview; there is no force-overwrite option. Copy the entire skill directory when distributing it; its assets are canonical runtime copies.

Only single-runtime OpenCode orchestration is implemented. Codex, Claude Code and mixed-runtime configurations are rejected. Core modules never import an adapter or model SDK. Tests run the documented OpenCode plugin hook interface with synthetic task results; they do not prove a live model audit happened. The local environment may lack OpenCode/provider access. Doctor reports that limitation and never certifies live provider availability from static model identifiers. Trusted global plugins or managed configuration may change runtime behavior; inspect and validate the effective runtime before use.

Use a JSON file with schemaVersion 1. Unspecified fields inherit the preset. Unknown keys and disabled invariants are rejected. Example:

```json
{
  "schemaVersion": 1,
  "runtime": "opencode",
  "roles": {
    "plan": { "agent": "my-planner", "provider": "my-provider", "model": "my-plan-model", "temperature": 0.1, "steps": 60 },
    "implement": { "agent": "my-builder", "provider": "my-provider", "model": "my-code-model" },
    "audit": { "agent": "my-auditor", "provider": "my-provider", "model": "my-review-model" },
    "fix": { "agent": "my-fixer", "provider": "my-provider", "model": "my-code-model" }
  },
  "documentationSync": {
    "rules": [{ "trigger": ["src/contracts/**"], "require": ["docs/API.md"] }]
  }
}
```

Each triggered rule requires at least one matching changed documentation file. Multiple rules are enforced independently. Empty rules mean no additional discovered synchronization contract; requiresDocs still applies. Inspector reports this as unknown for owner review, rather than inventing application-specific rules. Commands come from approved plans, never from installer execution of package scripts. Role agent names must be distinct. Provider/model fields are identifiers, never secrets; do not put API keys here. Temperature and step limits can be overridden; security permissions and invariant policy cannot.

Existing project config remains byte-for-byte intact. The generated overlay intentionally controls selected role models, tools and delegation; other settings remain owned by the project. Existing command/agent definition conflicts refuse installation. Global/managed settings and third-party plugins are outside the installer’s trust boundary.

OpenCode references used for the adapter: [agents and task permissions](https://opencode.ai/docs/agents/), [permission precedence](https://opencode.ai/docs/permissions/), [plugin hooks](https://opencode.ai/docs/plugins/). The compatibility tests target the legacy two-argument plugin hook API and task metadata.sessionId plus task_result output documented in OpenCode v1.18.29 source. A changed API fails closed and needs adapter validation before use. No particular provider subscription is required.
