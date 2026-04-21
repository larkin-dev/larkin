# @preflight/x402

> Authorization middleware for x402-paid APIs. One line of code.

```ts
import { preflight } from "@preflight/x402";

export const GET = preflight(handler, {
  apiKey: process.env.PREFLIGHT_KEY!,
  minScore: 40,
  mode: "block",
});
```

## Install

```bash
npm i @preflight/x402
```

## Status

Stubbed in CP1. Adapter implementations land in CP3. See `PREFLIGHT_BRIEF.md`.

## License

MIT
