# @larkinsh/verify

> Verify any Larkin receipt anywhere, forever, with zero dependency on Larkin's API.

You do not need to trust Larkin. You do not need to call our servers. Every signed receipt we have ever issued is verifiable forever using only this library and our published public key.

## Install

```bash
npm i @larkinsh/verify
```

## Usage

```ts
import { verify, verifyWithFetch } from "@larkinsh/verify";

// Pure — caller supplies the public key
const result = verify(receipt, publicKeyBase64Url);
// → { valid: true, payload: {...} } | { valid: false, reason: "..." }

// Convenience — fetches JWKS from /.well-known/larkin-keys.json, caches in memory
const result2 = await verifyWithFetch(receipt);
```

## CLI

```bash
npx @larkinsh/verify receipt.json
# ✓ Valid. wallet=0x... score=72 decision=allow issued=2026-04-21T...
```

## Status

Stubbed in CP1. Full implementation lands in CP2. See `BRIEF.md`.

## License

MIT
