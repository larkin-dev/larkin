// Black-box CLI test: spawns the built dist/cli.js and asserts on stdout/stderr/exit.
// Exercises the actual published artifact so packaging issues (shebang, perms, dist
// resolution of `package.json` for version lookup) are caught alongside argv logic.
//
// NOT covered here: the positional-filename happy path against a valid receipt.
// That path exercises @noble/ed25519 + verifyWithFetch which are already covered
// by tests/verify.test.ts; reproducing the full sign-then-verify round-trip from
// a spawned subprocess requires a local JWKS server + matching key signing, which
// exceeded test budget for 1.0.1. Argv handling and parse-error path through the
// positional code path are exercised below; they catch the original "treats flags
// as filenames" bug. A happy-path subprocess test can land in a future cut.

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "..", "dist", "cli.js");

function run(args: string[], env?: Record<string, string>) {
  return spawnSync("node", [CLI, ...args], {
    encoding: "utf-8",
    env: { ...process.env, ...env },
  });
}

describe("larkin-verify CLI — flag handling", () => {
  it("--help prints usage to stdout and exits 0", () => {
    const r = run(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("Verify Larkin Ed25519-signed receipts");
    expect(r.stdout).toContain("Usage:");
    expect(r.stderr).toBe("");
  });

  it("-h alias produces the same help output", () => {
    const long = run(["--help"]);
    const short = run(["-h"]);
    expect(short.status).toBe(0);
    expect(short.stdout).toBe(long.stdout);
  });

  it("--version prints the package version to stdout and exits 0", () => {
    const r = run(["--version"]);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^@larkinsh\/verify \d+\.\d+\.\d+$/);
    expect(r.stderr).toBe("");
  });

  it("-v alias produces the same version output", () => {
    const long = run(["--version"]);
    const short = run(["-v"]);
    expect(short.status).toBe(0);
    expect(short.stdout).toBe(long.stdout);
  });

  it("unknown flag errors to stderr and exits 2", () => {
    const r = run(["--gibberish"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown flag: --gibberish");
    expect(r.stderr).toContain("--help");
    expect(r.stdout).toBe("");
  });

  it("no arg writes usage to stderr and exits 2", () => {
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("usage: larkin-verify <receipt.json>");
    expect(r.stdout).toBe("");
  });

  it("nonexistent positional file goes through argv parsing into the read-error branch (exits 1)", () => {
    // Exercises argv → readFileSync path; confirms positional args are still
    // accepted (not blanket-rejected as flags) after the --help/--version
    // prefix-handling was added.
    const r = run(["/nonexistent/path/to/receipt.json"]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("✗ Invalid");
    expect(r.stdout).toContain("could not read or parse");
  });
});
