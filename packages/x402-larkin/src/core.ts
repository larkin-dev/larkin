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
  error?: { code: string; message: string };
  meta?: { cached?: boolean; partial?: boolean };
}

/**
 * Result of a preflight pass, before the adapter emits an HTTP response.
 * `kind` is the adapter's action (pass through / reject). `decision` is the
 * server's raw verdict — they can diverge in warn mode, where a `decision: "deny"`
 * still lands in `kind: "allow"` because warn mode always runs the handler.
 */
export type PreflightOutcome =
  | { kind: "missing_proof" }
  | { kind: "service_unavailable" }
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
  return candidate && EVM_ADDR.test(candidate) ? candidate : null;
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
