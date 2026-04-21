#!/usr/bin/env node
// larkin-verify — CLI wrapper around verifyWithFetch.
//
//   larkin-verify receipt.json
//   → ✓ Valid. wallet=0x... score=72 decision=allow issued=2026-04-21T...
//   → ✗ Invalid. reason=<explanation>
//
// Exit codes: 0 on valid, 1 on any invalid result or error, 2 on misuse.

import { readFileSync } from "node:fs";
import { verifyWithFetch, type Receipt } from "./index.js";

async function main(): Promise<number> {
  const filePath = process.argv[2];
  if (!filePath) {
    process.stderr.write("usage: larkin-verify <receipt.json>\n");
    return 2;
  }

  let receipt: Receipt;
  try {
    receipt = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stdout.write(`✗ Invalid. reason=could not read or parse ${filePath}: ${msg}\n`);
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
