# Provenance and intentional contract changes

The deterministic runtime and original regression suites derive from the supplied reference-implementation/tools. No upstream license was supplied; this bundle asserts no new third-party rights. The normal-file fingerprint domain remains meport-change-state-v1.

0.2 changes the product contract to match the user-directed workflow:

- Installation accepts folders before Git initialization. Source instruction/architecture contents inform an agent-authored project design; deterministic helpers classify, preview, validate, install and diagnose it.
- A new workspace offers full project bootstrap or harness only. Existing projects receive harness only. User-owned source documents and existing project files are preserved.
- Portable command skills are the default; OpenCode is optional. Five commands cover writing, implementing, reporting, optional independent auditing, and explicit docs maintenance.
- Independent auditing is optional. Completion accepts a current passing local harness plus explicit approval. --audit opts into the full pre-existing audit validation contract; no synthetic audit is created for normal completion.
- /update-docs explicitly reconciles maintained docs with code and documented intent, without implementation or Git mutations.
- Final completion approval includes a scoped local commit with a descriptive message: any later unambiguous approval, regardless of wording, runs the gate, archival and commit through --commit-message. Invalid evidence prevents committing. Git setup, the initial baseline commit, branches and pushes remain user-controlled. Local lifecycle checks still depend on an initialized repository, clean starting baseline, immutable contract/criteria, scope, ordered verification and current content fingerprints. No CI setup is generated.

Existing hardening remains: Git collectors wait for close; NUL-delimited paths and both rename sides are scoped; symlink fingerprints do not follow targets; secret/traversal boundaries fail closed; verification mutations invalidate evidence; optional audit evidence is complete, clean, fingerprint-bound and fresh. The reference implementation remains unchanged as historical input. Synthetic audit fixtures validate the opted-in artifact contract only; they never prove a real independent review occurred.
