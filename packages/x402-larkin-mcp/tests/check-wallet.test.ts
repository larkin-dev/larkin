import { describe, it, expect, beforeEach, vi } from "vitest";
import { checkWallet } from "../src/tools/check-wallet.js";

beforeEach(() => {
  vi.unstubAllGlobals();
});

const SAMPLE_DATA = {
  checkId: "chk_TEST1234",
  wallet: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  score: 72,
  scoreVersion: "v1-hybrid",
  breakdown: {
    walletAge: 20,
    txHistory: 16,
    counterparties: 14,
    fundingSource: 10,
    erc8004: 12,
  },
  decision: "allow",
  reasons: [],
  surchargeMultiplier: 1,
  receipt: {
    payload: { checkId: "chk_TEST1234", score: 72 },
    sig: "abc",
    kid: "larkin-v1",
  },
};

describe("checkWallet", () => {
  it("posts to /api/v1/check with X-API-Key and returns data envelope", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, data: SAMPLE_DATA }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkWallet(
      { wallet: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", chain_id: 1 },
      { apiKey: "pf_live_test", baseUrl: "https://test.example" },
    );

    expect(result).toEqual(SAMPLE_DATA);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(calledUrl).toBe("https://test.example/api/v1/check");
    expect(calledInit.method).toBe("POST");
    expect(calledInit.headers).toEqual({
      "Content-Type": "application/json",
      "X-API-Key": "pf_live_test",
    });
    expect(JSON.parse(calledInit.body as string)).toEqual({
      wallet: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      chainId: 1,
    });
  });

  it("uses default base URL when none is provided", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, data: SAMPLE_DATA }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await checkWallet(
      { wallet: "0xabc", chain_id: 8453 },
      { apiKey: "pf_live_test" },
    );

    const [calledUrl] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://larkin.sh/api/v1/check");
  });

  it("forwards chain_id as camelCase chainId in the body", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true, data: SAMPLE_DATA }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await checkWallet(
      { wallet: "0xabc", chain_id: 8453 },
      { apiKey: "pf_live_test" },
    );

    const [, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(calledInit.body as string)).toEqual({
      wallet: "0xabc",
      chainId: 8453,
    });
  });

  it("throws on non-2xx HTTP status with status code in message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      checkWallet(
        { wallet: "0xabc", chain_id: 1 },
        { apiKey: "pf_live_test" },
      ),
    ).rejects.toThrow(/429/);
  });

  it("throws on ok:false in response body with error message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, error: { message: "invalid wallet" } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      checkWallet(
        { wallet: "0xnope", chain_id: 1 },
        { apiKey: "pf_live_test" },
      ),
    ).rejects.toThrow(/invalid wallet/);
  });
});
