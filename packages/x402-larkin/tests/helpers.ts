// Shared fixtures for adapter tests.
//
// makeProofHeader — produces a base64-encoded PaymentPayload that an adapter
// will decode to recover the supplied wallet (EVM EIP-3009 scheme shape).
//
// makeFetchMock — returns a fetch-compatible function that always resolves to
// a specific Larkin /v1/check response, configured by score + decision.
// Using vi.fn() so call counts can be asserted.
//
// fetchMockThrowing — simulates network/timeout error so "service unavailable"
// paths can be tested.

import { vi } from "vitest";

export const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
export const RANDOM_WALLET = "0x1234567890123456789012345678901234567890";

export function makeProofHeader(wallet: string): string {
  const payload = {
    x402Version: 2,
    accepted: {
      scheme: "exact",
      network: "eip155:1",
      asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      amount: "1000",
      payTo: "0x0000000000000000000000000000000000000001",
      maxTimeoutSeconds: 60,
      extra: {},
    },
    payload: {
      signature: "0xSIGNATURE_UNVERIFIED_IN_SDK",
      authorization: {
        from: wallet,
        to: "0x0000000000000000000000000000000000000001",
        value: "1000",
        validAfter: "0",
        validBefore: "9999999999",
        nonce:
          "0x0000000000000000000000000000000000000000000000000000000000000001",
      },
    },
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

export function makeCheckOk(opts: {
  score: number;
  decision: "allow" | "deny" | "surcharge";
  wallet?: string;
  checkId?: string;
}) {
  return {
    ok: true,
    data: {
      checkId: opts.checkId ?? "chk_TEST1234",
      wallet: opts.wallet ?? VITALIK,
      score: opts.score,
      decision: opts.decision,
      reasons: opts.decision === "deny" ? ["below threshold"] : [],
      surchargeMultiplier: 1,
      receipt: { payload: {}, sig: "fake", kid: "larkin-v1" },
    },
    meta: { cached: false, latencyMs: 1, partial: false },
  };
}

export function fetchMockReturning(body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

export function fetchMockThrowing(): typeof fetch {
  return vi.fn(async () => {
    throw new Error("simulated network error");
  }) as unknown as typeof fetch;
}

/** Simulates the 402 free_tier_exhausted response from /v1/check (1.0.4 shape). */
export function fetchMock402FreeTierExhausted(): typeof fetch {
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "free_tier_exhausted",
          message:
            "Free tier limit reached (10,000 checks/month). Upgrade to Pro at https://larkin.sh/dashboard/billing.",
          tier: "free",
          checksUsed: 10_000,
          hardCap: 10_000,
          upgradeUrl: "https://larkin.sh/dashboard/billing",
        },
      }),
      {
        status: 402,
        headers: { "content-type": "application/json" },
      },
    ),
  ) as unknown as typeof fetch;
}

/** Simulates the 402 tier_hard_cap_exceeded response from /v1/check. */
export function fetchMock402TierHardCapExceeded(
  tier: "pro" | "scale" = "pro",
): typeof fetch {
  const hardCap = tier === "pro" ? 1_000_000 : 10_000_000;
  return vi.fn(async () =>
    new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: "tier_hard_cap_exceeded",
          message: `${tier} tier hard cap reached (${hardCap.toLocaleString()} checks/month, 2x stated limit). Contact sales@larkin.sh for higher volume.`,
          tier,
          checksUsed: hardCap,
          hardCap,
          upgradeUrl: "mailto:sales@larkin.sh",
        },
      }),
      {
        status: 402,
        headers: { "content-type": "application/json" },
      },
    ),
  ) as unknown as typeof fetch;
}

export const PROOF_HEADER = makeProofHeader(VITALIK);

/** Payload that decodes as JSON but matches neither EIP-3009 nor Permit2. */
export function makeUnknownShapeHeader(): string {
  const payload = {
    x402Version: 2,
    accepted: { scheme: "experimental", network: "future:1" },
    payload: { futureSchemeField: { payerDelegation: "0x..." } },
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64");
}
