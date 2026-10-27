import { createHash } from "node:crypto";
import { readFile, lstat, readlink } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export async function getChangedFiles(repoRoot, baseRef = null) {
  if (baseRef) {
    const diff = await runProcess(
      "git",
      ["diff", "--no-renames", "--name-only", "-z", "--diff-filter=ACMRDT", `${baseRef}...HEAD`, "--"],
      repoRoot,
    );
    return uniqueNormalizedPaths(diff.stdout);
  }

  const [unstaged, staged, untracked] = await Promise.all([
    runProcess("git", ["diff", "--no-renames", "--name-only", "-z", "--diff-filter=ACMRDT"], repoRoot),
    runProcess("git", ["diff", "--cached", "--no-renames", "--name-only", "-z", "--diff-filter=ACMRDT"], repoRoot),
    runProcess("git", ["ls-files", "-z", "--others", "--exclude-standard"], repoRoot),
  ]);

  return uniqueNormalizedPaths(
    [unstaged.stdout, staged.stdout, untracked.stdout].join("\0"),
  );
}

export async function getHeadRevision(repoRoot) {
  const result = await runProcess("git", ["rev-parse", "HEAD"], repoRoot);
  return result.stdout.trim();
}

export async function computeChangeFingerprint(repoRoot, changedFiles) {
  const hash = createHash("sha256");
  const files = [...new Set(changedFiles)].sort((left, right) =>
    left.localeCompare(right),
  );

  hash.update("meport-change-state-v1\0");

  for (const file of files) {
    hash.update(file);
    hash.update("\0");

    try {
      await assertSafeRepoPath(repoRoot, file, true);
      const info = await lstat(path.join(repoRoot, file));
      if (info.isSymbolicLink()) {
        hash.update("symlink\0");
        hash.update(await readlink(path.join(repoRoot, file)));
        continue;
      }
      const content = await readFile(path.join(repoRoot, file));
      hash.update("file\0");
      hash.update(String(content.byteLength));
      hash.update("\0");
      hash.update(content);
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
      hash.update("deleted\0");
    }
  }

  return `sha256:${hash.digest("hex")}`;
}

export async function assertSafeRepoPath(root, name, allowLeafSymlink = false) {
  if (name.split('/').some(p => /^(\.env(?:\..*)?|auth\.json|credentials(?:\..*)?|\.aws|\.ssh|secrets?(?:\..*)?)$/i.test(p))) throw new Error(`Secret path access denied: ${name}`);
  if (typeof name !== 'string' || !name || /[\\\x00-\x1f:]/.test(name) || path.isAbsolute(name) || name.split('/').some(p => !p || p === '.' || p === '..')) throw new Error(`Unsafe repository path: ${name}`);
  const parts = name.split('/');
  let target = root;
  for (let i = 0; i < parts.length; i++) {
    target = path.join(target, parts[i]);
    try {
      const info = await lstat(target);
      if (info.isSymbolicLink() && !(allowLeafSymlink && i === parts.length - 1)) throw new Error(`Symlink boundary refused: ${name}`);
    } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return target;
}

function uniqueNormalizedPaths(output) {
  const seen = new Set();
  const files = [];

  for (const line of output.split("\0")) {
    const normalized = line;
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    files.push(normalized);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

export function runProcess(command, args, cwd, spawnProcess = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => {
      stdout.push(Buffer.from(chunk));
    });

    child.stderr.on("data", (chunk) => {
      stderr.push(Buffer.from(chunk));
    });

    child.on("error", reject);
    child.on("close", (code) => {
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code === 0) {
        resolve({ stderr: err, stdout: out });
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} exited with code ${code}.${err ? ` ${err.trim()}` : ""}`,
        ),
      );
    });
  });
}
