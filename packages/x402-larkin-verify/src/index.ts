// @larkinsh/verify — verify Larkin Ed25519-signed receipts.
//
// Pure (caller supplies the public key) or fetching (library pulls JWKS from
// /.well-known/larkin-keys.json). No dependency on Larkin's API beyond the
// optional JWKS fetch — and that fetch uses a URL anyone can point at their
// own mirror. If Larkin disappears tomorrow, every receipt ever issued is
// still verifiable forever with this library and the published public key.
//
// Deps: @noble/ed25519, json-canonicalize. Node runtime — uses node:crypto
// for sync SHA-512 (required by @noble/ed25519 v2 sync verify).

import { createHash } from "node:crypto";
import * as ed from "@noble/ed25519";
import { canonicalize } from "json-canonicalize";

// Wire SHA-512 so ed.verify can run synchronously. Without this, @noble/ed25519
// v2 only exposes verifyAsync — and the spec requires verify() to be sync.
ed.etc.sha512Sync = (...messages: Uint8Array[]): Uint8Array => {
  const hasher = createHash("sha512");
  for (const msg of messages) hasher.update(msg);
  return new Uint8Array(hasher.digest());
};

// ─── types ─────────────────────────────────────────────────────────────────

export interface ReceiptPayload {
  checkId: string;
  wallet: string;
  chainId?: number;
  score: number;
  decision: "allow" | "deny" | "surcharge" | string;
  issuedAt: number;
  expiresAt: number;
  [extra: string]: unknown;
}

export interface Receipt {
  payload: ReceiptPayload;
  sig: string;
  kid: string;
}

export type VerifyResult =
  | { valid: true; payload: ReceiptPayload }
  | { valid: false; reason: string };

export interface VerifyWithFetchOpts {
  keysUrl?: string;
  fetchImpl?: typeof fetch;
}

interface Jwk {
  kid: string;
  kty: string;
  crv: string;
  x: string;
}

interface Jwks {
  keys: Jwk[];
}

// ─── sentinels ─────────────────────────────────────────────────────────────

// Paranoia insurance: the mock sentinel from the server's CP1 mock endpoint.
// A receipt carrying this sig must NEVER validate, even in a dev misconfiguration.
const MOCK_SENTINEL = "MOCK_UNSIGNED_RECEIPT_DO_NOT_TRUST";

const DEFAULT_KEYS_URL = "https://larkin.sh/.well-known/larkin-keys.json";

// ─── pure verify ───────────────────────────────────────────────────────────

export function verify(receipt: Receipt, publicKeyB64Url: string): VerifyResult {
  if (!receipt || typeof receipt !== "object") {
    return { valid: false, reason: "malformed receipt" };
  }

  // Hard reject mock sentinels before any other check.
  if (receipt.sig === MOCK_SENTINEL) {
    return { valid: false, reason: "unsigned mock receipt" };
  }

  if (!receipt.payload || typeof receipt.payload !== "object") {
    return { valid: false, reason: "malformed receipt" };
  }
  if (typeof receipt.sig !== "string" || typeof receipt.kid !== "string") {
    return { valid: false, reason: "malformed receipt" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    typeof receipt.payload.expiresAt === "number" &&
    receipt.payload.expiresAt < now
  ) {
    return { valid: false, reason: "expired" };
  }

  let publicKey: Uint8Array;
  let signature: Uint8Array;
  try {
    publicKey = b64urlToBytes(publicKeyB64Url);
    signature = b64urlToBytes(receipt.sig);
  } catch {
    return { valid: false, reason: "malformed receipt" };
  }

  if (publicKey.length !== 32) {
    return { valid: false, reason: "malformed public key" };
  }
  if (signature.length !== 64) {
    return { valid: false, reason: "signature mismatch" };
  }

  const message = new TextEncoder().encode(canonicalize(receipt.payload));

  let ok = false;
  try {
    ok = ed.verify(signature, message, publicKey);
  } catch {
    return { valid: false, reason: "signature mismatch" };
  }
  if (!ok) return { valid: false, reason: "signature mismatch" };

  return { valid: true, payload: receipt.payload };
}

// ─── fetching verify ───────────────────────────────────────────────────────

// In-memory JWKS cache keyed by URL. Per-process; no TTL (keys rotate rarely
// and the process naturally restarts between deploys).
const keyCache = new Map<string, Map<string, string>>();

export async function verifyWithFetch(
  receipt: Receipt,
  opts: VerifyWithFetchOpts = {},
): Promise<VerifyResult> {
  const keysUrl = opts.keysUrl ?? DEFAULT_KEYS_URL;
  const fetchImpl = opts.fetchImpl ?? fetch;

  // Short-circuit mock sentinels without any network call.
  if (receipt?.sig === MOCK_SENTINEL) {
    return { valid: false, reason: "unsigned mock receipt" };
  }
  if (!receipt || typeof receipt.kid !== "string") {
    return { valid: false, reason: "unknown kid" };
  }

  let kidMap = keyCache.get(keysUrl);
  if (!kidMap) {
    let res: Response;
    try {
      res = await fetchImpl(keysUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { valid: false, reason: `jwks fetch failed: ${msg}` };
    }
    if (!res.ok) {
      return { valid: false, reason: `jwks fetch failed: HTTP ${res.status}` };
    }
    const jwks = (await res.json()) as Jwks;
    kidMap = new Map();
    for (const k of jwks.keys ?? []) {
      if (k.kty === "OKP" && k.crv === "Ed25519" && typeof k.x === "string") {
        kidMap.set(k.kid, k.x);
      }
    }
    keyCache.set(keysUrl, kidMap);
  }

  const publicKey = kidMap.get(receipt.kid);
  if (!publicKey) {
    return { valid: false, reason: "unknown kid" };
  }

  return verify(receipt, publicKey);
}

/** Test-only: clear the in-memory JWKS cache. */
export function __resetKeyCache(): void {
  keyCache.clear();
}

// ─── helpers ───────────────────────────────────────────────────────────────

function b64urlToBytes(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s, "base64url"));
}
