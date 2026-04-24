import { describe, it, expect } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { preflight } from "../src/express.js";
import {
  PROOF_HEADER,
  makeCheckOk,
  fetchMockReturning,
  fetchMockThrowing,
} from "./helpers.js";

const OK_HANDLER: express.RequestHandler = (_req, res) => {
  res.status(200).json({ hello: "world" });
};

interface Harness {
  url: string;
  close: () => Promise<void>;
}

async function harness(opts: Parameters<typeof preflight>[1]): Promise<Harness> {
  const app = express();
  app.all("/paid", preflight(OK_HANDLER, opts));
  return new Promise((resolveP) => {
    const server: Server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      resolveP({
        url: `http://127.0.0.1:${addr.port}/paid`,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

async function post(
  url: string,
  headers: Record<string, string> = { "PAYMENT-SIGNATURE": PROOF_HEADER },
): Promise<Response> {
  return fetch(url, { method: "POST", headers });
}

describe("Express adapter", () => {
  it("passes request through when score above threshold (block mode)", async () => {
    const h = await harness({
      apiKey: "k",
      mode: "block",
      minScore: 40,
      fetchImpl: fetchMockReturning(makeCheckOk({ score: 72, decision: "allow" })),
    });
    const res = await post(h.url);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: "world" });
    await h.close();
  });

  it("returns 403 in block mode when decision is deny", async () => {
    const h = await harness({
      apiKey: "k",
      mode: "block",
      minScore: 40,
      fetchImpl: fetchMockReturning(makeCheckOk({ score: 20, decision: "deny" })),
    });
    const res = await post(h.url);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toBe("payment_denied");
    await h.close();
  });

  it("returns 200 with warn headers in warn mode when below threshold", async () => {
    const h = await harness({
      apiKey: "k",
      mode: "warn",
      minScore: 40,
      fetchImpl: fetchMockReturning(makeCheckOk({ score: 20, decision: "deny" })),
    });
    const res = await post(h.url);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Larkin-Score")).toBe("20");
    expect(res.headers.get("X-Larkin-Decision")).toBe("deny");
    expect(res.headers.get("X-Larkin-CheckId")).toBe("chk_TEST1234");
    await h.close();
  });

  it("returns 200 with surcharge header in surcharge mode when below threshold", async () => {
    const h = await harness({
      apiKey: "k",
      mode: "surcharge",
      minScore: 40,
      surcharge: { below: 40, multiplier: 10 },
      fetchImpl: fetchMockReturning(makeCheckOk({ score: 20, decision: "deny" })),
    });
    const res = await post(h.url);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Larkin-Surcharge-Multiplier")).toBe("10");
    await h.close();
  });

  it("returns 400 when payment proof is missing", async () => {
    const h = await harness({
      apiKey: "k",
      mode: "block",
      fetchImpl: fetchMockReturning(makeCheckOk({ score: 72, decision: "allow" })),
    });
    const res = await post(h.url, {}); // no PAYMENT-SIGNATURE
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe(
      "missing_or_invalid_payment_proof",
    );
    await h.close();
  });

  it("fails closed (503) in block mode when Larkin API is down", async () => {
    const h = await harness({
      apiKey: "k",
      mode: "block",
      fetchImpl: fetchMockThrowing(),
    });
    const res = await post(h.url);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe(
      "trust_service_unavailable",
    );
    await h.close();
  });

  it("fails open in warn mode when Larkin API is down", async () => {
    const h = await harness({
      apiKey: "k",
      mode: "warn",
      fetchImpl: fetchMockThrowing(),
    });
    const res = await post(h.url);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Larkin-Error")).toBe("service_unavailable");
    await h.close();
  });
});
