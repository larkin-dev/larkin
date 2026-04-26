# @larkinsh/x402

> Authorization middleware for x402-paid APIs. One line of code wraps your handler; every paying wallet gets a 0-100 trust score and an Ed25519-signed receipt before your business logic runs.

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

## Options

| Option | Type | Required | Description |
|---|---|---|---|
| `apiKey` | string | yes | Your `pf_live_*` key from <https://larkin.sh/dashboard>. |
| `minScore` | number | yes | Threshold (0-100) below which the chosen mode triggers. |
| `mode` | `"block" \| "warn" \| "surcharge"` | yes | What to do when a wallet falls below `minScore`. |
| `surcharge` | `{ below: number, multiplier: number }` | only when `mode === "surcharge"` | Multiplier applied to the x402 price for sub-threshold wallets. |
| `requireERC8004` | boolean | no | If true, deny wallets without an ERC-8004 registration regardless of score. |

## Why "preflight"?

The product is **Larkin**; the function is named `preflight()` because it describes the operation — a preflight check before the API responds. Stripe uses the same pattern (`stripe.charges.create()`).

## Receipt verification

Every Larkin-issued receipt is independently verifiable forever using only the published public key. See [`@larkinsh/verify`](https://www.npmjs.com/package/@larkinsh/verify).

## Documentation

Full docs: <https://docs.larkin.sh>
Marketing site: <https://larkin.sh>
Issues: <https://github.com/larkin-dev/larkin-public-tmp/issues>

## License

MIT
