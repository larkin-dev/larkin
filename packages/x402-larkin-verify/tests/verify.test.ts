import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as ed from "@noble/ed25519";
import { canonicalize } from "json-canonicalize";
import {
  verify,
  verifyWithFetch,
  __resetKeyCache,
  type Receipt,
  type ReceiptPayload,
} from "../src/index.js";

// ─── fixtures ──────────────────────────────────────────────────────────────

const b64url = (b: Uint8Array): string => Buffer.from(b).toString("base64url");

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function makePayload(over: Partial<ReceiptPayload> = {}): ReceiptPayload {
  return {
    checkId: "chk_TEST1234",
    wallet: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    chainId: 1,
    score: 72,
    decision: "allow",
    issuedAt: nowSec() - 60,
    expiresAt: nowSec() + 3600,
    ...over,
  };
}

async function signReceipt(
  payload: ReceiptPayload,
  privateKey: Uint8Array,
  kid = "test-v1",
): Promise<Receipt> {
  const msg = new TextEncoder().encode(canonicalize(payload));
  const sig = await ed.signAsync(msg, privateKey);
  return { payload, sig: b64url(sig), kid };
}

// ─── tests ─────────────────────────────────────────────────────────────────

describe("verify() — pure", () => {
  let privA: Uint8Array;
  let pubA: string;
  let privB: Uint8Array;
  let pubB: string;

  beforeEach(async () => {
    privA = ed.utils.randomPrivateKey();
    pubA = b64url(await ed.getPublicKeyAsync(privA));
    privB = ed.utils.randomPrivateKey();
    pubB = b64url(await ed.getPublicKeyAsync(privB));
  });

  it("accepts a hand-signed receipt", async () => {
    const receipt = await signReceipt(makePayload(), privA);
    const res = verify(receipt, pubA);
    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.payload.wallet).toBe("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045");
      expect(res.payload.score).toBe(72);
    }
  });

  it("rejects a tampered payload with reason='signature mismatch'", async () => {
    const receipt = await signReceipt(makePayload(), privA);
    // Flip a field after signing — canonical JSON will differ, sig won't match.
    receipt.payload.score = 99;
    const res = verify(receipt, pubA);
    expect(res).toEqual({ valid: false, reason: "signature mismatch" });
  });

  it("rejects verification against the wrong key with reason='signature mismatch'", async () => {
    const receipt = await signReceipt(makePayload(), privA);
    const res = verify(receipt, pubB);
    expect(res).toEqual({ valid: false, reason: "signature mismatch" });
  });

  it("rejects the MOCK_UNSIGNED_RECEIPT_DO_NOT_TRUST sentinel with reason='unsigned mock receipt'", () => {
    const receipt: Receipt = {
      payload: makePayload(),
      sig: "MOCK_UNSIGNED_RECEIPT_DO_NOT_TRUST",
      kid: "larkin-v1",
    };
    const res = verify(receipt, pubA);
    expect(res).toEqual({ valid: false, reason: "unsigned mock receipt" });
  });

  it("rejects an expired receipt with reason='expired'", async () => {
    const expired = makePayload({
      issuedAt: nowSec() - 7200,
      expiresAt: nowSec() - 60,
    });
    const receipt = await signReceipt(expired, privA);
    const res = verify(receipt, pubA);
    expect(res).toEqual({ valid: false, reason: "expired" });
  });
});

describe("verifyWithFetch() — JWKS lookup", () => {
  let priv: Uint8Array;
  let pub: string;
  const kid = "test-v1";
  const keysUrl = "https://example.test/.well-known/larkin-keys.json";

  beforeEach(async () => {
    __resetKeyCache();
    priv = ed.utils.randomPrivateKey();
    pub = b64url(await ed.getPublicKeyAsync(priv));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetKeyCache();
  });

  it("verifies a receipt against the fetched JWKS", async () => {
    const receipt = await signReceipt(makePayload(), priv, kid);
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            keys: [{ kid, kty: "OKP", crv: "Ed25519", x: pub }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    ) as unknown as typeof fetch;

    const res = await verifyWithFetch(receipt, { keysUrl, fetchImpl });
    expect(res.valid).toBe(true);
  });

  it("rejects a receipt whose kid is not in the JWKS with reason='unknown kid'", async () => {
    const receipt = await signReceipt(makePayload(), priv, "some-other-kid");
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ keys: [{ kid, kty: "OKP", crv: "Ed25519", x: pub }] }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    const res = await verifyWithFetch(receipt, { keysUrl, fetchImpl });
    expect(res).toEqual({ valid: false, reason: "unknown kid" });
  });

  it("short-circuits the MOCK sentinel without fetching", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const receipt: Receipt = {
      payload: makePayload(),
      sig: "MOCK_UNSIGNED_RECEIPT_DO_NOT_TRUST",
      kid: "larkin-v1",
    };
    const res = await verifyWithFetch(receipt, { keysUrl, fetchImpl });
    expect(res).toEqual({ valid: false, reason: "unsigned mock receipt" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("caches the JWKS — a second call does not re-fetch", async () => {
    const receipt = await signReceipt(makePayload(), priv, kid);
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ keys: [{ kid, kty: "OKP", crv: "Ed25519", x: pub }] }),
          { status: 200 },
        ),
    ) as unknown as typeof fetch;

    const r1 = await verifyWithFetch(receipt, { keysUrl, fetchImpl });
    const r2 = await verifyWithFetch(receipt, { keysUrl, fetchImpl });
    expect(r1.valid).toBe(true);
    expect(r2.valid).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
