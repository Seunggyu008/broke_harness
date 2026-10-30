# Explicit documentation maintenance

If a harness is already installed, read and follow `.broke-harness/commands/update-docs.md`, or invoke the installed /update-docs command. If no harness exists, use `assets/commands/update-docs.md` from this skill as the same procedure; documentation maintenance does not require installing a harness or initializing Git.

This is a user-triggered operation, separate from bootstrap and plan execution. Read the project's source instructions, architecture, relevant code, docs and active plans. Reconcile current behavior and documented intent, remove stale or repeated statements, consolidate ownership, update navigation and affected links, and report evidence and unresolved conflicts. Keep changes to maintained documentation. Update factual architecture descriptions when needed while preserving intended boundaries. Do not change application code, source AGENT instructions, archived/active plans, or Git state as part of this command.

If architecture and implementation conflict materially, ask the user which is intended before rewriting the contract. Do not silently turn proposed features into implemented claims. Use existing checks when available; otherwise inspect affected links and report the verification limits. No CI configuration is created.
