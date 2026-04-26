// Black-box CLI test: spawns the built dist/cli.js and asserts on stdout/stderr/exit.
// Exercises the actual published artifact so packaging issues (shebang, perms, dist
// resolution of `package.json` for version lookup) are caught alongside argv logic.

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "..", "dist", "cli.js");

function run(args: string[]) {
  // Ensure LARKIN_API_KEY is unset so we don't accidentally start the stdio
  // server during a flag-handling test (which would hang the test runner).
  const env = { ...process.env };
  delete env.LARKIN_API_KEY;
  return spawnSync("node", [CLI, ...args], { encoding: "utf-8", env });
}

describe("larkin-mcp CLI", () => {
  it("--help prints usage to stdout and exits 0", () => {
    const r = run(["--help"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("MCP server exposing Larkin's wallet authorization");
    expect(r.stdout).toContain("Usage:");
    expect(r.stdout).toContain("LARKIN_API_KEY");
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
    expect(r.stdout.trim()).toMatch(/^@larkinsh\/mcp \d+\.\d+\.\d+$/);
    expect(r.stderr).toBe("");
  });

  it("-v alias produces the same version output", () => {
    const long = run(["--version"]);
    const short = run(["-v"]);
    expect(short.status).toBe(0);
    expect(short.stdout).toBe(long.stdout);
  });

  it("unknown argument errors to stderr and exits 2", () => {
    const r = run(["--gibberish"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument: --gibberish");
    expect(r.stderr).toContain("--help");
    expect(r.stdout).toBe("");
  });
});
