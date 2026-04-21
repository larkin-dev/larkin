# Larkin

> x402 answers "did they pay?" Larkin answers "should we let them?"

Authorization middleware for the x402 agent payment protocol. One line of code. Every paying wallet scored, signed, and decided before your API responds.

```ts
import { preflight } from "@larkinsh/x402";

export const GET = preflight(handler, {
  minScore: 40,
  mode: "block",
});
```

## Monorepo layout

```
/app                         — Next.js 15 web app (landing, dashboard, API)   [proprietary]
/packages/x402-larkin        — TypeScript SDK (@larkinsh/x402)                  [MIT]
/packages/x402-larkin-verify — Receipt verifier (@larkinsh/verify)              [MIT]
/packages/x402-larkin-mcp    — MCP server (@larkinsh/mcp)                       [MIT]
/packages/x402-larkin-py     — Python SDK (larkin-x402)                       [MIT]
/scripts                     — Setup scripts                                  [proprietary]
```

## License

Larkin uses an **open-core model**.

- All packages under `/packages/*` are **MIT licensed**. Use, fork, modify, sell — no restrictions.
- The hosted service under `/app` is **proprietary**. Not licensed for redistribution.

You can verify any Larkin-issued receipt using only `@larkinsh/verify` and our public key — without ever calling our hosted service. That's the trust model.

## Quick start

```bash
pnpm install
cp .env.example .env.local    # fill in keys
pnpm init:keys                # generate Ed25519 signing key
pnpm seed:stripe              # create Stripe products + prices
pnpm dev                      # localhost:3000
```

## Build status

See `BRIEF.md` for the full spec. Work through checkpoints CP1 → CP6.

## Why this exists

In January 2026, an AI agent called Lobstar Wilde lost $250,000 on a single transaction because no one checked its reputation. The x402 protocol solved machine-to-machine payment but left authorization as an exercise for the reader. Larkin is that exercise, finished.
