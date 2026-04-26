#!/usr/bin/env node
// larkin-mcp — MCP server for Larkin wallet authorization checks.
//
//   npx @larkinsh/mcp                Run the server (speaks MCP over stdio).
//   npx @larkinsh/mcp --help         Print this help.
//   npx @larkinsh/mcp --version      Print version.
//
// Exit codes: 0 on clean shutdown, 1 on missing config or runtime error, 2 on misuse.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
) as { name: string; version: string };

const HELP = `${pkg.name} ${pkg.version}

MCP server exposing Larkin's wallet authorization check as a tool for AI agents.
Provides one tool: check_wallet.

Usage:
  npx ${pkg.name}                  Run the server (speaks MCP over stdio).
  npx ${pkg.name} --help, -h       Show this help.
  npx ${pkg.name} --version, -v    Show version.

Environment:
  LARKIN_API_KEY                   Required. Your pf_live_* key from
                                   https://larkin.sh/dashboard.
  LARKIN_BASE_URL                  Optional override for the API base URL
                                   (default: https://larkin.sh).
`;

const arg = process.argv[2];
if (arg === "--version" || arg === "-v") {
  process.stdout.write(`${pkg.name} ${pkg.version}\n`);
  process.exit(0);
}
if (arg === "--help" || arg === "-h") {
  process.stdout.write(HELP);
  process.exit(0);
}
if (arg) {
  process.stderr.write(`${pkg.name}: unknown argument: ${arg}\n`);
  process.stderr.write(`run 'npx ${pkg.name} --help' for usage.\n`);
  process.exit(2);
}

const apiKey = process.env.LARKIN_API_KEY;
if (!apiKey) {
  process.stderr.write(
    `${pkg.name}: LARKIN_API_KEY environment variable is required.\n`,
  );
  process.stderr.write(
    `run 'npx ${pkg.name} --help' for usage.\n`,
  );
  process.exit(1);
}

const server = createServer({
  apiKey,
  baseUrl: process.env.LARKIN_BASE_URL,
});

const transport = new StdioServerTransport();
server.connect(transport).catch((err: unknown) => {
  process.stderr.write(`${pkg.name}: failed to start — ${err}\n`);
  process.exit(1);
});
