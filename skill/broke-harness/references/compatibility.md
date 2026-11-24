# Configuration and compatibility

Node.js 22+ is the intended baseline; tests run on the available Node version. Installation requires an existing folder, not an initialized Git repository. Running the canonical regression suites with --tests still requires the Git executable. The plan lifecycle requires Git and a user-created clean committed baseline. No dependencies, credentials, MCP servers or CI are installed. macOS/Linux and native command discovery in other hosts require target validation.

Default runtime is portable. It installs command skills for the user's chosen agent without model selection or runtime hooks. OpenCode is an optional adapter with configurable role/provider/model identifiers. Other dedicated runtime adapters and cross-runtime orchestration are not supplied; portable command instructions can be followed by any capable agent using its existing tools.

Configuration is schemaVersion 1. Unspecified values inherit defaults. Example agent-authored bootstrap input, stored outside the workspace and passed with --config to preview and apply:

```json
{
  "schemaVersion": 1,
  "runtime": "portable",
  "bootstrap": "project",
  "project": {
    "summary": "Project boundaries and initial scope derived from AGENT.md and ARCHITECTURE.md.",
    "documentation": [
      { "path": "docs/PRODUCT.md", "content": "# Product\n\nProject-specific scope and implemented versus planned behavior.\n" }
    ],
    "scaffold": [
      { "path": "src/main.mjs", "content": "export const ready = true;\n" },
      { "path": "package.json", "content": "{\"type\":\"module\",\"scripts\":{\"check\":\"node --check src/main.mjs\"}}\n" }
    ]
  },
  "documentationSync": {
    "rules": [{ "trigger": ["src/**"], "require": ["docs/PRODUCT.md"] }]
  }
}
```

This schema is an illustration, not a universal application scaffold. The agent chooses actual files from the source documents. bootstrap: project requires a new workspace, both source documents and non-empty scaffold. bootstrap: harness never accepts application scaffold. Generated documentation must be Markdown under docs/, outside exec-plans. Traversal, secrets, hidden infrastructure, source instruction/architecture files and owned harness paths are refused. Existing-file conflicts never overwrite user content. Generated project files become mutable after install; canonical harness assets remain hash-checked. Updates/merges/uninstall are manual.

To opt into OpenCode, set runtime: opencode. Partial role overrides use roles.plan, roles.implement, roles.audit, roles.fix with agent, provider, model, optional temperature and steps. Defaults use namespaced agent names to avoid changing built-in build/plan. Existing role collisions fail preview or runtime overlay loading rather than replacing owner settings. Names and model IDs do not establish provider availability. The OpenCode audit role is shell-free and read-only. Portable execution requires the host to support independent read-only audit and fixer delegation.

The retained policy fields are maxCombinedFixAttempts: 3, requireIndependentAudit: true, auditReadOnly: true and requireCompletionApproval: true. For an older installed configuration, reconcile the harness files together and set requireIndependentAudit to true. Completion's approval token binds the reviewed diff, not a human identity or conversation turn. --commit-message creates the approved local commit only after validation and archival; the agent asks for both actions in its final question. The OpenCode shell grammar accepts a double-quoted message of up to 120 characters using letters, numbers, spaces and . , : / _ - ( ) punctuation. Raw Git commands remain denied. The completion helper requires a clean structured audit bound to a current passing local harness.

Every configured documentation-sync trigger requires at least one matching documentation change. The agent derives rules from actual project ownership, with user direction for ambiguity. Empty rules add no special synchronization contract; requiresDocs in each plan still applies. Never invent verification commands or claim an unexecuted check passed. Default portable mode respects existing runtime settings. OpenCode hooks are integration-tested with synthetic child results, not certified against every live runtime version.
