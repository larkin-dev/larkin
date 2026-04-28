// Shared SDK logic — not imported directly by users. Use the adapter entry
// points: @larkinsh/x402/next, /hono, /express.
//
// Naming note: the product is Larkin; the middleware function is still named
// `preflight()` because it describes what it does — a preflight check before
// the API responds. Same pattern as Stripe's `stripe.charges.create()`.

export interface PreflightOptions {
  apiKey: string;
  minScore?: number;
  mode?: "block" | "warn" | "surcharge";
  surcharge?: { below: number; multiplier: number };
  chainId?: number;
  /** Overrides the default https://larkin.sh endpoint (self-hosting, staging). */
  endpoint?: string;
  /** Inject custom fetch — used by tests. */
  fetchImpl?: typeof fetch;
}

export interface CheckResponse {
  ok: boolean;
  data?: {
    checkId: string;
    wallet: string;
    score: number;
    decision: "allow" | "deny" | "surcharge";
    reasons?: string[];
    surchargeMultiplier?: number;
    receipt?: unknown;
  };
  error?: {
    code: string;
    message: string;
    /** Present on 402 responses (free_tier_exhausted, tier_hard_cap_exceeded). */
    upgradeUrl?: string;
    /** Legacy field from 1.0.3-era 402 free_tier_exhausted responses. */
    checksRemaining?: number;
    /** Present on 1.0.4+ 402 responses. */
    tier?: "free" | "pro" | "scale";
    /** Present on 1.0.4+ 402 responses. */
    checksUsed?: number;
    /** Present on 1.0.4+ 402 responses. */
    hardCap?: number;
  };
  meta?: { cached?: boolean; partial?: boolean };
}

/**
 * Result of a preflight pass, before the adapter emits an HTTP response.
 * `kind` is the adapter's action (pass through / reject). `decision` is the
 * server's raw verdict — they can diverge in warn mode, where a `decision: "deny"`
 * still lands in `kind: "allow"` because warn mode always runs the handler.
 *
 * `free_tier_exhausted` and `tier_hard_cap_exceeded` are distinct from
 * `service_unavailable` so monitoring and dashboards can distinguish
 * "Larkin is down" from "your Larkin account hit a tier cap." Adapters
 * surface all three as 503 to end users in block mode (the trust gate is
 * effectively unavailable) but with different `X-Larkin-Error` header
 * values.
 *
 * Free tier hits `free_tier_exhausted` at the stated 10K/month. Pro and
 * Scale get a 2x overage headroom band; hitting that 2x ceiling triggers
 * `tier_hard_cap_exceeded`. Both outcomes carry tier + checksUsed +
 * hardCap so consumers can render their own UX (e.g., "1.0M / 1.0M used").
 */
export type PreflightOutcome =
  | { kind: "missing_proof" }
  | { kind: "service_unavailable" }
  | {
      kind: "free_tier_exhausted";
      tier: "free";
      upgradeUrl: string;
      message: string;
      checksUsed: number;
      hardCap: number;
    }
  | {
      kind: "tier_hard_cap_exceeded";
      tier: "pro" | "scale";
      upgradeUrl: string;
      message: string;
      checksUsed: number;
      hardCap: number;
    }
  | {
      kind: "allow";
      score: number;
      checkId: string;
      decision: "allow" | "deny" | "surcharge";
    }
  | { kind: "deny"; score: number; checkId: string; reason?: string };

const DEFAULT_ENDPOINT = "https://larkin.sh";
const CHECK_TIMEOUT_MS = 5000;

// ─── payment-proof extraction ──────────────────────────────────────────────
//
// x402 sends the payment proof as a PAYMENT-SIGNATURE header (case-insensitive
// per HTTP spec). Value is base64(JSON.stringify(PaymentPayload)).
//
// Payer wallet for EVM schemes lives at one of two paths inside the
// scheme-specific payload:
//   EIP-3009 (USDC transferWithAuthorization): payload.authorization.from
//   Permit2:                                   payload.permit2Authorization.from
// Non-EVM schemes (Solana, Aptos, Stellar) are v2.

const EVM_ADDR = /^0x[a-fA-F0-9]{40}$/;

interface ScaffoldedPayload {
  payload?: {
    authorization?: { from?: string };
    permit2Authorization?: { from?: string };
  };
}

export function extractWalletFromHeader(
  headerValue: string | null | undefined,
): string | null {
  if (!headerValue) return null;
  let decoded: unknown;
  try {
    const json = Buffer.from(headerValue, "base64").toString("utf8");
    decoded = JSON.parse(json);
  } catch {
    return null;
  }
  const paymentPayload = decoded as ScaffoldedPayload;
  const eip3009 = paymentPayload?.payload?.authorization?.from;
  const permit2 = paymentPayload?.payload?.permit2Authorization?.from;
  const candidate = eip3009 ?? permit2;
  if (candidate && EVM_ADDR.test(candidate)) return candidate;

  // Decoded OK but neither EVM scheme matched. Log a visible signal so we
  // notice when x402 adds a new scheme or a non-EVM chain sends us traffic.
  // Response behavior is unchanged (400 missing_or_invalid_payment_proof);
  // this is pure observability.
  if (decoded && typeof decoded === "object") {
    const inner = (decoded as { payload?: unknown }).payload;
    const innerKeys =
      inner && typeof inner === "object" ? Object.keys(inner as object) : [];
    console.warn(
      `[@larkinsh/x402] unrecognized payload shape. Schemes supported: ` +
        `eip-3009, permit2. Received keys: [${innerKeys.join(", ")}]. ` +
        `If this is a valid new x402 scheme, please file an issue.`,
    );
  }
  return null;
}

export function readPaymentSignatureHeader(
  get: (name: string) => string | null | undefined,
): string | null {
  return get("payment-signature") ?? get("PAYMENT-SIGNATURE") ?? null;
}

// ─── Larkin API call ───────────────────────────────────────────────────────

async function callCheck(
  wallet: string,
  opts: PreflightOptions,
): Promise<CheckResponse | null> {
  const endpoint = (opts.endpoint ?? DEFAULT_ENDPOINT).replace(/\/+$/, "");
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${endpoint}/v1/check`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": opts.apiKey,
      },
      body: JSON.stringify({
        wallet,
        chainId: opts.chainId ?? 1,
        minScore: opts.minScore,
      }),
      signal: controller.signal,
    });
    // 402 carries a structured cap-exhaustion body with `upgradeUrl`,
    // `tier`, `checksUsed`, `hardCap` — propagate it instead of collapsing
    // to null. The orchestrator distinguishes 402 from generic non-2xx via
    // the body's `error.code` (`free_tier_exhausted` or
    // `tier_hard_cap_exceeded`).
    if (res.status === 402) {
      try {
        return (await res.json()) as CheckResponse;
      } catch {
        return null;
      }
    }
    if (!res.ok) return null;
    return (await res.json()) as CheckResponse;
  } catch {
    return null; // timeout / network / parse error — treat as unavailable
  } finally {
    clearTimeout(timer);
  }
}

// ─── main orchestrator (framework-neutral) ─────────────────────────────────

export async function evaluate(
  getHeader: (name: string) => string | null | undefined,
  opts: PreflightOptions,
): Promise<PreflightOutcome> {
  const rawHeader = readPaymentSignatureHeader(getHeader);
  const wallet = extractWalletFromHeader(rawHeader);
  if (!wallet) return { kind: "missing_proof" };

  const response = await callCheck(wallet, opts);

  // Tier-cap exhaustion: developer's Larkin account is at the stated Free
  // limit OR over the 2x hard cap on Pro/Scale. Surface as distinct outcomes
  // (and a console.warn with the upgrade URL) so the developer sees an
  // actionable signal in their logs — not just a generic "service
  // unavailable" that looks indistinguishable from a network blip. Both
  // outcomes carry tier + checksUsed + hardCap so consumers can render
  // their own UX without round-tripping the dashboard.
  if (response && !response.ok && response.error?.code === "free_tier_exhausted") {
    const err = response.error;
    const upgradeUrl =
      err.upgradeUrl ?? "https://larkin.sh/dashboard/billing";
    const message =
      err.message ?? "Larkin free tier limit reached. Upgrade required.";
    console.warn(`[larkin] ${message} (${upgradeUrl})`);
    return {
      kind: "free_tier_exhausted",
      tier: "free",
      upgradeUrl,
      message,
      checksUsed: typeof err.checksUsed === "number" ? err.checksUsed : 0,
      hardCap: typeof err.hardCap === "number" ? err.hardCap : 10_000,
    };
  }

  if (response && !response.ok && response.error?.code === "tier_hard_cap_exceeded") {
    const err = response.error;
    const upgradeUrl = err.upgradeUrl ?? "mailto:sales@larkin.sh";
    const message =
      err.message ?? "Larkin tier hard cap reached. Contact sales for higher volume.";
    const tier: "pro" | "scale" = err.tier === "scale" ? "scale" : "pro";
    console.warn(`[larkin] ${message} (${upgradeUrl})`);
    return {
      kind: "tier_hard_cap_exceeded",
      tier,
      upgradeUrl,
      message,
      checksUsed: typeof err.checksUsed === "number" ? err.checksUsed : 0,
      // Tier-aware fallback. Unreachable in practice (the route always sends
      // hardCap on tier_hard_cap_exceeded), but ships sane values if the
      // response shape ever drifts.
      hardCap:
        typeof err.hardCap === "number"
          ? err.hardCap
          : err.tier === "scale"
            ? 10_000_000
            : 1_000_000,
    };
  }

  if (!response || !response.ok || !response.data) {
    return { kind: "service_unavailable" };
  }

  const { score, decision, checkId, reasons } = response.data;
  const mode = opts.mode ?? "block";

  if (mode === "block" && decision === "deny") {
    return { kind: "deny", score, checkId, reason: reasons?.[0] };
  }
  return { kind: "allow", score, checkId, decision };
}

// ─── shared helpers for emitting standardized responses ────────────────────

export const MISSING_PROOF_BODY = {
  error: "missing_or_invalid_payment_proof",
} as const;

export const SERVICE_UNAVAILABLE_BODY = {
  error: "trust_service_unavailable",
} as const;

export function denyBody(score: number, checkId: string, reason?: string) {
  return {
    error: "payment_denied",
    reason,
    score,
    checkId,
  };
}

/** Attaches X-Larkin-* headers for warn/surcharge mode. */
export function decorateHeaders(
  headers: Headers | { set: (k: string, v: string) => void },
  outcome: Extract<PreflightOutcome, { kind: "allow" }>,
  opts: PreflightOptions,
): void {
  const mode = opts.mode ?? "block";
  if (mode === "warn") {
    headers.set("X-Larkin-Score", String(outcome.score));
    headers.set("X-Larkin-Decision", outcome.decision);
    headers.set("X-Larkin-CheckId", outcome.checkId);
    if (
      typeof opts.minScore === "number" &&
      outcome.score < opts.minScore
    ) {
      console.warn(
        `[larkin] score ${outcome.score} below threshold ${opts.minScore} (checkId=${outcome.checkId})`,
      );
    }
    return;
  }
  if (
    mode === "surcharge" &&
    opts.surcharge &&
    outcome.score < opts.surcharge.below
  ) {
    headers.set(
      "X-Larkin-Surcharge-Multiplier",
      String(opts.surcharge.multiplier),
    );
  }
}
