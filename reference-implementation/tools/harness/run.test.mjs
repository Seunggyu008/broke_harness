import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { computeChangeFingerprint } from "./change-state.mjs";
import {
  matchesGlob,
  parseAcceptanceCriteria,
  runVerification,
} from "./run.mjs";

test("parseAcceptanceCriteria assigns stable IDs to concrete criteria", () => {
  assert.deepEqual(
    parseAcceptanceCriteria(`# Example

## Acceptance Criteria

- First observable outcome.
- Second observable outcome.

## Risks / Open Questions

- A risk.
`),
    [
      { id: "AC-1", text: "First observable outcome." },
      { id: "AC-2", text: "Second observable outcome." },
    ],
  );
});

test("parseAcceptanceCriteria rejects missing, empty, and placeholder criteria", () => {
  assert.throws(
    () => parseAcceptanceCriteria("# Example\n"),
    /missing an `Acceptance Criteria` section/,
  );
  assert.throws(
    () => parseAcceptanceCriteria("## Acceptance Criteria\n\n## Risks / Open Questions\n"),
    /at least one concrete bullet/,
  );
  assert.throws(
    () => parseAcceptanceCriteria("## Acceptance Criteria\n\n- <Observable outcome>\n"),
    /at least one concrete bullet/,
  );
});

test("computeChangeFingerprint changes when changed-file content changes", async () => {
  const repoRoot = await createTempDir("harness-fingerprint-");
  const filePath = path.join(repoRoot, "example.txt");
  await writeFile(filePath, "first", "utf8");
  const first = await computeChangeFingerprint(repoRoot, ["example.txt"]);

  await writeFile(filePath, "second", "utf8");
  const second = await computeChangeFingerprint(repoRoot, ["example.txt"]);

  assert.notEqual(first, second);
});

test("runVerification captures stdout and stderr in artifacts and excerpts", async () => {
  const diagnosticDir = await createTempDir("harness-diagnostics-");
  const result = await runVerification(
    `node -e "console.log('captured stdout'); console.error('captured stderr'); process.exit(2)"`,
    1,
    diagnosticDir,
  );

  assert.equal(result.status, "FAIL");
  assert.equal(result.exitCode, 2);
  assert.match(result.stdoutExcerpt, /captured stdout/);
  assert.match(result.stderrExcerpt, /captured stderr/);
  assert.match(await readFile(result.stdoutPath, "utf8"), /captured stdout/);
  assert.match(await readFile(result.stderrPath, "utf8"), /captured stderr/);
});

test("matchesGlob matches *.tsx within a single segment", () => {
  assert.equal(
    matchesGlob(
      "frontend/mobile/src/screens/DashboardScreen.tsx",
      "frontend/mobile/src/screens/*.tsx",
    ),
    true,
  );
  assert.equal(
    matchesGlob(
      "frontend/mobile/src/components/Card.tsx",
      "frontend/mobile/src/components/*.tsx",
    ),
    true,
  );
});

test("matchesGlob does not let * cross path separators", () => {
  assert.equal(
    matchesGlob(
      "frontend/mobile/src/screens/nested/DashboardScreen.tsx",
      "frontend/mobile/src/screens/*.tsx",
    ),
    false,
  );
  assert.equal(
    matchesGlob(
      "frontend/mobile/src/screens/DashboardScreen.tsx",
      "frontend/mobile/src/screens/*.tsx",
    ),
    true,
  );
});

test("matchesGlob keeps ? matching exactly one character", () => {
  assert.equal(
    matchesGlob(
      "frontend/mobile/src/screens/DashboardScreen.tsx",
      "frontend/mobile/src/screens/Dashboard?creen.tsx",
    ),
    true,
  );
  assert.equal(
    matchesGlob(
      "frontend/mobile/src/screens/DashboardScreen.tsx",
      "frontend/mobile/src/screens/Dashboard?reen.tsx",
    ),
    false,
  );
  assert.equal(
    matchesGlob(
      "frontend/mobile/src/screens/b.tsx",
      "frontend/mobile/src/screens/?b.tsx",
    ),
    false,
  );
});

test("matchesGlob keeps ** recursive matching intact", () => {
  assert.equal(
    matchesGlob(
      "frontend/mobile/src/screens/DashboardScreen.tsx",
      "frontend/mobile/**",
    ),
    true,
  );
  assert.equal(
    matchesGlob(
      "frontend/mobile/src/screens/DashboardScreen.tsx",
      "frontend/mobile/src/**/*.tsx",
    ),
    true,
  );
  assert.equal(
    matchesGlob(
      "frontend/mobile/src/screens/DashboardScreen.tsx",
      "frontend/mobile/src/**",
    ),
    true,
  );
});

test("matchesGlob escapes literal regex characters", () => {
  assert.equal(
    matchesGlob(
      "frontend/mobile/src/utils/format.ts",
      "frontend/mobile/src/utils/format.ts",
    ),
    true,
  );
  assert.equal(
    matchesGlob(
      "frontend/mobile/src/utils/formatXts",
      "frontend/mobile/src/utils/format.ts",
    ),
    false,
  );
});

async function createTempDir(prefix) {
  const { mkdtemp } = await import("node:fs/promises");
  return mkdtemp(path.join(os.tmpdir(), prefix));
}
