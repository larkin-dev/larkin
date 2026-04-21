# @larkin/x402

> Authorization middleware for x402-paid APIs. One line of code.

```ts
import { preflight } from "@larkin/x402";

export const GET = preflight(handler, {
  apiKey: process.env.LARKIN_KEY!,
  minScore: 40,
  mode: "block",
});
```

> The product is Larkin; the middleware function is named `preflight()` because it describes what it does — a preflight check before the API responds.

## Install

```bash
npm i @larkin/x402
```

## Status

Stubbed in CP1. Adapter implementations land in CP3. See `BRIEF.md`.

## License

MIT
