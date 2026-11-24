# Independently audit a plan implementation after verification passes

Use a fresh read-only agent context independent of implementation and fixes. Read the plan, project instructions, relevant docs, .tmp/harness-report.json and .tmp/harness-diff.json. Require a current passing local harness matching the plan, contract, criteria and HEAD, and require the diff artifact to carry the same change fingerprint. Require local execution for an in-progress plan with no scope divergence or issues and all required documentation checks satisfied. Compare each ordered verification result with the required commands and require a PASS with exit code zero for each. Return blocked if deterministic prerequisites are missing or contradictory. Do not modify files, run write-capable commands, delegate fixes, change Git state, or invoke browser/device automation. Portable mode relies on the host's read-only tools and permissions.

Audit the current scoped implementation against each acceptance criterion. Report only evidence-backed findings. Missing browser/device observations alone are residual risks. Assess every supplied external feedback point, including any proposed correction, as confirmed, unsupported, unverified, or out-of-scope. Do not treat a reviewer's authority as evidence.

Return exactly one JSON object, without fences or surrounding prose:

- outcome: clean, fixable, or blocked.
- mustFix and shouldFix: arrays of findings, each with id, severity (must-fix or should-fix), title, files (only allowedPaths), explanation, and fixInstructions.
- acceptableRisk: array of remaining uncertainties, including unexecuted runtime behavior.
- acceptanceEvidence: exactly one record per report criterion, with criterionId, evidenceType (automated, audit, or manual), status (verified or unverified), and specific evidence.
- feedbackAssessment: one object per supplied point, with point, assessment, and evidence; empty when no feedback was supplied.
- summary: non-empty factual summary.

clean requires empty finding arrays and all criteria verified. fixable means confirmed in-scope corrections exist. blocked means prerequisites are unavailable or a correction needs scope amendment. Return the result to the caller. The caller persists a clean result with generatedAt, planPath, harnessGeneratedAt, and harnessChangeFingerprint bound to the current report. In OpenCode, the policy hook appends the validated enriched object to the child task result for the caller to persist.
