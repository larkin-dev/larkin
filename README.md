# Larkin

> x402 answers "did they pay?" Larkin answers "should we let them?"

Authorization middleware for the [x402](https://www.x402.org/) agent payment protocol. When an AI agent pays your API via x402, Larkin scores the wallet's trust before your handler runs and returns an Ed25519-signed receipt of the decision. Block, warn, or surcharge low-trust agents — your call.

## TypeScript SDK

```bash
npm i @larkinsh/x402
```

```ts
import { preflight } from "@larkinsh/x402/next";

export const GET = preflight(handler, {
  apiKey: process.env.LARKIN_API_KEY!,
  minScore: 40,
  mode: "block",
});
```

Hono and Express adapters: `@larkinsh/x402/hono` and `@larkinsh/x402/express`.

## Receipt verifier

```bash
npm i @larkinsh/verify
```

```ts
import { verify } from "@larkinsh/verify";

const result = verify(receipt, publicKeyBase64Url);
// → { valid: true, payload: {...} } | { valid: false, reason: "..." }
```

Verify any receipt Larkin has ever issued using only this library and our published public key — no call to our infrastructure required. Receipts remain independently verifiable forever.

CLI:

```bash
npx @larkinsh/verify receipt.json
```

## Other packages

- `@larkinsh/mcp` — MCP server exposing wallet checks as a tool for Claude Code, Cursor, and other MCP-aware agents.
- `larkin-x402` (PyPI) — Python SDK with the same shape as the TypeScript client.

## Repo layout

```
packages/x402-larkin         — TypeScript SDK (@larkinsh/x402)
packages/x402-larkin-verify  — Receipt verifier (@larkinsh/verify)
packages/x402-larkin-mcp     — MCP server (@larkinsh/mcp)
packages/x402-larkin-py      — Python SDK (larkin-x402 on PyPI)
tests/x402-demo              — End-to-end SDK consumer example
```

## Why Larkin exists

In January 2026, an AI agent called Lobstar Wilde lost $250,000 on a single transaction because no one checked its reputation. The x402 protocol solved machine-to-machine payment but left authorization as an exercise for the reader. Larkin is that exercise, finished.

## Documentation

Full docs and API reference: <https://docs.larkin.sh>
Marketing and signup: <https://larkin.sh>
Issue tracker: <https://github.com/larkin-dev/larkin-public-tmp/issues>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

MIT. The hosted scoring service that produces the trust scores is a separate proprietary codebase. Every receipt these packages verify works forever, independently of that service — that's the trust model.
