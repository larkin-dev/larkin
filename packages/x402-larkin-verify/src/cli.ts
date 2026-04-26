#!/usr/bin/env node
// larkin-verify — CLI wrapper around verifyWithFetch.
//
//   larkin-verify <receipt.json>     verify a receipt; exits 0 on valid, 1 on invalid.
//   larkin-verify --help             print this help.
//   larkin-verify --version          print version.
//
// Exit codes: 0 on valid, 1 on any invalid result or error, 2 on misuse.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { verifyWithFetch, type Receipt } from "./index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
) as { name: string; version: string };

const HELP = `${pkg.name} ${pkg.version}

Verify Larkin Ed25519-signed receipts.

Usage:
  larkin-verify <receipt.json>     Verify a receipt; prints ✓/✗ and exits 0/1.
  larkin-verify --help, -h         Show this help.
  larkin-verify --version, -v      Show version.

Environment:
  LARKIN_KEYS_URL                  Override the JWKS URL
                                   (default: https://larkin.sh/.well-known/larkin-keys.json).
`;

async function main(): Promise<number> {
  const arg = process.argv[2];

  if (arg === "--version" || arg === "-v") {
    process.stdout.write(`${pkg.name} ${pkg.version}\n`);
    return 0;
  }
  if (arg === "--help" || arg === "-h") {
    process.stdout.write(HELP);
    return 0;
  }
  if (!arg) {
    process.stderr.write("usage: larkin-verify <receipt.json>\n");
    return 2;
  }
  if (arg.startsWith("-")) {
    process.stderr.write(`larkin-verify: unknown flag: ${arg}\n`);
    process.stderr.write("run 'larkin-verify --help' for usage.\n");
    return 2;
  }

  let receipt: Receipt;
  try {
    receipt = JSON.parse(readFileSync(arg, "utf8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`✗ Invalid. reason=could not read or parse ${arg}: ${msg}\n`);
    return 1;
  }

  // Env override mostly for dev/testing before the DNS for larkin.sh is propagated
  // and for running against self-hosted mirrors.
  const keysUrl = process.env.LARKIN_KEYS_URL;
  const result = await verifyWithFetch(receipt, keysUrl ? { keysUrl } : {});

  if (result.valid) {
    const p = result.payload;
    const issued = new Date((p.issuedAt ?? 0) * 1000).toISOString();
    process.stdout.write(
      `✓ Valid. wallet=${p.wallet} score=${p.score} decision=${p.decision} issued=${issued}\n`,
    );
    return 0;
  }
  process.stdout.write(`✗ Invalid. reason=${result.reason}\n`);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`✗ Invalid. reason=${msg}\n`);
    process.exit(1);
  });
