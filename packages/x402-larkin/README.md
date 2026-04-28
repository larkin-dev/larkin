# @larkinsh/x402

> Authorization middleware for x402-paid APIs. One line of code wraps your handler; every paying wallet gets a 0-100 trust score and an Ed25519-signed receipt before your business logic runs.

## Requirements

Node 18+ with ESM. This package is ESM-only — use `import` syntax, not `require()`.
CJS callers can use dynamic import: `const m = await import("@larkinsh/x402/next")`.

## Install

```bash
npm i @larkinsh/x402
```

## Next.js (App Router)

```ts
import { preflight } from "@larkinsh/x402/next";

export const GET = preflight(handler, {
  apiKey: process.env.LARKIN_API_KEY!,
  minScore: 40,
  mode: "block",
});
```

## Hono

```ts
import { Hono } from "hono";
import { preflight } from "@larkinsh/x402/hono";

const app = new Hono();
app.use("/paid/*", preflight({ apiKey: process.env.LARKIN_API_KEY!, minScore: 40, mode: "block" }));
app.get("/paid/data", (c) => c.json({ ok: true }));
```

## Express

```ts
import express from "express";
import { preflight } from "@larkinsh/x402/express";

const app = express();
app.use("/paid", preflight({ apiKey: process.env.LARKIN_API_KEY!, minScore: 40, mode: "block" }));
app.get("/paid/data", (_req, res) => res.json({ ok: true }));
```

## Modes

| Mode | Behavior below `minScore` |
|---|---|
| `block` | Returns `403 payment_denied`. Handler does not run. |
| `warn` | Always runs the handler. Adds `X-Larkin-Score`, `X-Larkin-Decision`, `X-Larkin-CheckId` response headers. |
| `surcharge` | Signals the x402 layer to multiply price (`X-Larkin-Surcharge-Multiplier` header) instead of denying. |

## Error states

When the Larkin API returns an error rather than a decision, the SDK surfaces it as one of three outcomes (visible via the `X-Larkin-Error` response header in warn mode, and via a `console.warn` from the SDK in either mode):

| `X-Larkin-Error` | Meaning |
|---|---|
| `service_unavailable` | Larkin's API is unreachable (timeout, network error, 5xx). Block mode returns `503`; warn mode runs the handler and adds the header. |
| `free_tier_exhausted` | Your Larkin account has used its monthly Free-tier quota (10,000 checks). The SDK logs a `console.warn` containing the upgrade URL — `https://larkin.sh/dashboard/billing`. Block mode returns `503` (the trust gate is effectively unavailable until you upgrade); warn mode runs the handler with the header. Upgrade to keep block-mode endpoints serving. |
| `tier_hard_cap_exceeded` | Your Pro or Scale account has hit its 2x hard cap (Pro: 1M/month, Scale: 10M/month). Pro and Scale tiers include 2x overage headroom over their stated limit before this fires. The SDK logs a `console.warn` with `mailto:sales@larkin.sh`. Block mode returns `503`; warn mode runs the handler with the header. Email sales to right-size your plan. |

## Options

| Option | Type | Required | Description |
|---|---|---|---|
| `apiKey` | string | yes | Your `pf_live_*` key from <https://larkin.sh/dashboard>. |
| `minScore` | number | yes | Threshold (0-100) below which the chosen mode triggers. |
| `mode` | `"block" \| "warn" \| "surcharge"` | yes | What to do when a wallet falls below `minScore`. |
| `surcharge` | `{ below: number, multiplier: number }` | only when `mode === "surcharge"` | Multiplier applied to the x402 price for sub-threshold wallets. |
| `requireERC8004` | boolean | no | If true, deny wallets without an ERC-8004 registration regardless of score. |

## A note on naming

This package is `@larkinsh/x402` — `larkinsh` is the npm scope (because `larkin` was taken at publish time), `x402` because it adds authorization to x402-paid endpoints. The product is **Larkin**; the verb is `preflight()`. You'll see all three in the docs.

## Why "preflight"?

The product is **Larkin**; the function is named `preflight()` because it describes the operation — a preflight check before the API responds. Stripe uses the same pattern (`stripe.charges.create()`).

## Receipt verification

Every Larkin-issued receipt is independently verifiable forever using only the published public key. See [`@larkinsh/verify`](https://www.npmjs.com/package/@larkinsh/verify).

## Documentation

Full docs: <https://larkin.sh/docs>
Marketing site: <https://larkin.sh>
Issues: <https://github.com/larkin-dev/larkin/issues>

## License

MIT
