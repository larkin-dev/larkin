#!/usr/bin/env node
// Wrapper around `pnpm publish` that strips the `scripts` block from the
// published package.json without touching the source tree. Operates on a
// temp staging directory; safe to interrupt at any point.
//
// Usage:
//   node scripts/clean-publish.mjs <package-dir> [--dry-run | extra pnpm-publish args]
//
// Examples:
//   node scripts/clean-publish.mjs packages/x402-larkin-verify
//   node scripts/clean-publish.mjs packages/x402-larkin-mcp --tag next
//   node scripts/clean-publish.mjs packages/x402-larkin --dry-run

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

const [pkgDirArg, ...extraArgs] = process.argv.slice(2);
if (!pkgDirArg) {
  process.stderr.write(
    "usage: clean-publish.mjs <package-dir> [extra pnpm-publish args]\n",
  );
  process.exit(2);
}

const pkgDir = path.resolve(pkgDirArg);
const pkgPath = path.join(pkgDir, "package.json");
if (!fs.existsSync(pkgPath)) {
  process.stderr.write(`no package.json at ${pkgDir}\n`);
  process.exit(2);
}

// Build first so dist/ is fresh.
process.stderr.write(`[clean-publish] building ${path.basename(pkgDir)}…\n`);
const buildResult = spawnSync("pnpm", ["build"], {
  cwd: pkgDir,
  stdio: "inherit",
});
if (buildResult.status !== 0) {
  process.stderr.write("[clean-publish] build failed; aborting publish.\n");
  process.exit(buildResult.status ?? 1);
}

// Read source package.json, strip scripts block.
const original = fs.readFileSync(pkgPath, "utf8");
const pkg = JSON.parse(original);
delete pkg.scripts;

// Stage to a temp dir. Source tree is never modified.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "larkin-publish-"));
fs.writeFileSync(
  path.join(tmpDir, "package.json"),
  JSON.stringify(pkg, null, 2) + "\n",
);

// Copy files referenced in `files` plus the npm-default inclusions.
const inclusions = new Set([
  ...(pkg.files ?? []),
  "README.md",
  "LICENSE",
]);
for (const item of inclusions) {
  const src = path.join(pkgDir, item);
  if (!fs.existsSync(src)) continue;
  const dst = path.join(tmpDir, item);
  if (fs.statSync(src).isDirectory()) {
    fs.cpSync(src, dst, { recursive: true });
  } else {
    fs.cpSync(src, dst);
  }
}

process.stderr.write(`[clean-publish] staged ${pkg.name}@${pkg.version} at ${tmpDir}\n`);

// Run `pnpm publish` from the staged tmp dir.
const publishResult = spawnSync(
  "pnpm",
  ["publish", "--access", "public", "--no-git-checks", ...extraArgs],
  {
    cwd: tmpDir,
    stdio: "inherit",
  },
);

// Clean up.
fs.rmSync(tmpDir, { recursive: true, force: true });
process.exit(publishResult.status ?? 1);
