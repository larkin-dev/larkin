import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import { preflight } from "../src/hono.js";
import {
  PROOF_HEADER,
  makeCheckOk,
  fetchMockReturning,
  fetchMockThrowing,
  fetchMock402FreeTierExhausted,
  fetchMock402TierHardCapExceeded,
  makeUnknownShapeHeader,
} from "./helpers.js";

const OK_HANDLER = async (): Promise<Response> =>
  new Response(JSON.stringify({ hello: "world" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function buildApp(opts: Parameters<typeof preflight>[1]): Hono {
  const app = new Hono();
  app.all("/paid", preflight(OK_HANDLER, opts));
  return app;
}

function request(app: Hono, headers: Record<string, string> = {}): Promise<Response> {
  return app.request("/paid", {
    method: "POST",
    headers: { "PAYMENT-SIGNATURE": PROOF_HEADER, ...headers },
  });
}

describe("Hono adapter", () => {
  it("passes request through when score above threshold (block mode)", async () => {
    const app = buildApp({
      apiKey: "k",
      mode: "block",
      minScore: 40,
      fetchImpl: fetchMockReturning(makeCheckOk({ score: 72, decision: "allow" })),
    });
    const res = await request(app);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("returns 403 in block mode when decision is deny", async () => {
    const app = buildApp({
      apiKey: "k",
      mode: "block",
      minScore: 40,
      fetchImpl: fetchMockReturning(makeCheckOk({ score: 20, decision: "deny" })),
    });
    const res = await request(app);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("payment_denied");
  });

  it("returns 200 with warn headers in warn mode when below threshold", async () => {
    const app = buildApp({
      apiKey: "k",
      mode: "warn",
      minScore: 40,
      fetchImpl: fetchMockReturning(makeCheckOk({ score: 20, decision: "deny" })),
    });
    const res = await request(app);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Larkin-Score")).toBe("20");
    expect(res.headers.get("X-Larkin-Decision")).toBe("deny");
    expect(res.headers.get("X-Larkin-CheckId")).toBe("chk_TEST1234");
  });

  it("returns 200 with surcharge header in surcharge mode when below threshold", async () => {
    const app = buildApp({
      apiKey: "k",
      mode: "surcharge",
      minScore: 40,
      surcharge: { below: 40, multiplier: 10 },
      fetchImpl: fetchMockReturning(makeCheckOk({ score: 20, decision: "deny" })),
    });
    const res = await request(app);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Larkin-Surcharge-Multiplier")).toBe("10");
  });

  it("returns 400 when payment proof is missing", async () => {
    const app = new Hono();
    app.all(
      "/paid",
      preflight(OK_HANDLER, {
        apiKey: "k",
        mode: "block",
        fetchImpl: fetchMockReturning(makeCheckOk({ score: 72, decision: "allow" })),
      }),
    );
    const res = await app.request("/paid", { method: "POST" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "missing_or_invalid_payment_proof",
    );
  });

  it("fails closed (503) in block mode when Larkin API is down", async () => {
    const app = buildApp({
      apiKey: "k",
      mode: "block",
      fetchImpl: fetchMockThrowing(),
    });
    const res = await request(app);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe(
      "trust_service_unavailable",
    );
  });

  it("warns to stderr on unrecognized payload shape (400 response unchanged)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = buildApp({
      apiKey: "k",
      mode: "block",
      fetchImpl: fetchMockReturning(makeCheckOk({ score: 72, decision: "allow" })),
    });
    const res = await app.request("/paid", {
      method: "POST",
      headers: { "PAYMENT-SIGNATURE": makeUnknownShapeHeader() },
    });
    expect(res.status).toBe(400);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/unrecognized payload shape/);
    warnSpy.mockRestore();
  });

  it("fails open in warn mode when Larkin API is down", async () => {
    const app = buildApp({
      apiKey: "k",
      mode: "warn",
      fetchImpl: fetchMockThrowing(),
    });
    const res = await request(app);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Larkin-Error")).toBe("service_unavailable");
  });

  it("returns 503 in block mode when Larkin API responds 402 free_tier_exhausted", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = buildApp({
      apiKey: "k",
      mode: "block",
      minScore: 40,
      fetchImpl: fetchMock402FreeTierExhausted(),
    });
    const res = await request(app);
    expect(res.status).toBe(503);
    // The end-user-facing body stays the generic "service unavailable" — the
    // agent paying via x402 isn't the audience for the developer's billing
    // state. The developer-facing signal lives in the console.warn below.
    expect(((await res.json()) as { error: string }).error).toBe(
      "trust_service_unavailable",
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/Free tier limit reached/);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(
      /https:\/\/larkin\.sh\/dashboard\/billing/,
    );
    warnSpy.mockRestore();
  });

  it("fails open in warn mode on 402 with X-Larkin-Error: free_tier_exhausted header", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = buildApp({
      apiKey: "k",
      mode: "warn",
      minScore: 40,
      fetchImpl: fetchMock402FreeTierExhausted(),
    });
    const res = await request(app);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Larkin-Error")).toBe("free_tier_exhausted");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it("returns 503 in block mode when Larkin API responds 402 tier_hard_cap_exceeded (Pro)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = buildApp({
      apiKey: "k",
      mode: "block",
      minScore: 40,
      fetchImpl: fetchMock402TierHardCapExceeded("pro"),
    });
    const res = await request(app);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe(
      "trust_service_unavailable",
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/2x stated limit/);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/mailto:sales@larkin\.sh/);
    warnSpy.mockRestore();
  });

  it("fails open in warn mode on 402 with X-Larkin-Error: tier_hard_cap_exceeded header (Scale)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const app = buildApp({
      apiKey: "k",
      mode: "warn",
      minScore: 40,
      fetchImpl: fetchMock402TierHardCapExceeded("scale"),
    });
    const res = await request(app);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Larkin-Error")).toBe("tier_hard_cap_exceeded");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
