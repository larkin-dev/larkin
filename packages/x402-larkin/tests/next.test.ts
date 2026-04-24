import { describe, it, expect, vi } from "vitest";
import { preflight } from "../src/next.js";
import {
  PROOF_HEADER,
  makeCheckOk,
  fetchMockReturning,
  fetchMockThrowing,
  makeUnknownShapeHeader,
} from "./helpers.js";

const OK_HANDLER = async (): Promise<Response> =>
  new Response(JSON.stringify({ hello: "world" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

function makeReq(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/paid", {
    method: "POST",
    headers: { "PAYMENT-SIGNATURE": PROOF_HEADER, ...headers },
    body: "",
  });
}

describe("Next.js adapter", () => {
  it("passes request through when score above threshold (block mode)", async () => {
    const wrapped = preflight(OK_HANDLER, {
      apiKey: "k",
      mode: "block",
      minScore: 40,
      fetchImpl: fetchMockReturning(makeCheckOk({ score: 72, decision: "allow" })),
    });
    const res = await wrapped(makeReq());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("returns 403 in block mode when decision is deny", async () => {
    const wrapped = preflight(OK_HANDLER, {
      apiKey: "k",
      mode: "block",
      minScore: 40,
      fetchImpl: fetchMockReturning(makeCheckOk({ score: 20, decision: "deny" })),
    });
    const res = await wrapped(makeReq());
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string; score: number; checkId: string };
    expect(body.error).toBe("payment_denied");
    expect(body.score).toBe(20);
  });

  it("returns 200 with warn headers in warn mode when below threshold", async () => {
    const wrapped = preflight(OK_HANDLER, {
      apiKey: "k",
      mode: "warn",
      minScore: 40,
      fetchImpl: fetchMockReturning(makeCheckOk({ score: 20, decision: "deny" })),
    });
    const res = await wrapped(makeReq());
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Larkin-Score")).toBe("20");
    expect(res.headers.get("X-Larkin-Decision")).toBe("deny");
    expect(res.headers.get("X-Larkin-CheckId")).toBe("chk_TEST1234");
  });

  it("returns 200 with surcharge header in surcharge mode when below threshold", async () => {
    const wrapped = preflight(OK_HANDLER, {
      apiKey: "k",
      mode: "surcharge",
      minScore: 40,
      surcharge: { below: 40, multiplier: 10 },
      fetchImpl: fetchMockReturning(makeCheckOk({ score: 20, decision: "deny" })),
    });
    const res = await wrapped(makeReq());
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Larkin-Surcharge-Multiplier")).toBe("10");
  });

  it("returns 400 when payment proof is missing", async () => {
    const wrapped = preflight(OK_HANDLER, {
      apiKey: "k",
      mode: "block",
      fetchImpl: fetchMockReturning(makeCheckOk({ score: 72, decision: "allow" })),
    });
    const req = new Request("http://localhost/paid", { method: "POST" });
    const res = await wrapped(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("missing_or_invalid_payment_proof");
  });

  it("fails closed (503) in block mode when Larkin API is down", async () => {
    const wrapped = preflight(OK_HANDLER, {
      apiKey: "k",
      mode: "block",
      fetchImpl: fetchMockThrowing(),
    });
    const res = await wrapped(makeReq());
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("trust_service_unavailable");
  });

  it("warns to stderr on unrecognized payload shape (400 response unchanged)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const wrapped = preflight(OK_HANDLER, {
      apiKey: "k",
      mode: "block",
      fetchImpl: fetchMockReturning(makeCheckOk({ score: 72, decision: "allow" })),
    });
    const req = new Request("http://localhost/paid", {
      method: "POST",
      headers: { "PAYMENT-SIGNATURE": makeUnknownShapeHeader() },
    });
    const res = await wrapped(req);
    expect(res.status).toBe(400);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/unrecognized payload shape/);
    expect(warnSpy.mock.calls[0]?.[0]).toMatch(/futureSchemeField/);
    warnSpy.mockRestore();
  });

  it("fails open in warn mode when Larkin API is down", async () => {
    const wrapped = preflight(OK_HANDLER, {
      apiKey: "k",
      mode: "warn",
      fetchImpl: fetchMockThrowing(),
    });
    const res = await wrapped(makeReq());
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Larkin-Error")).toBe("service_unavailable");
    expect(await res.json()).toEqual({ hello: "world" });
  });
});
