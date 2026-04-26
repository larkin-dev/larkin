# x402-demo

Manual integration test for `@larkinsh/x402/next`. Three routes — one per mode.

## Run

```bash
pnpm --filter x402-demo dev
# listens on http://localhost:3457
```

Routes (all POST, all require a `PAYMENT-SIGNATURE` header):

| path | mode | expected with vitalik (~62) + minScore 90 |
|---|---|---|
| `/paid/block` | block | 403 `payment_denied` |
| `/paid/warn` | warn | 200 + `X-Larkin-Score`, `X-Larkin-Decision`, `X-Larkin-CheckId` |
| `/paid/surcharge` | surcharge | 200 + `X-Larkin-Surcharge-Multiplier: 10` |

To see the block mode allow path: edit `block/route.ts` and lower `minScore` to
40. Vitalik's score (~62) then passes.
