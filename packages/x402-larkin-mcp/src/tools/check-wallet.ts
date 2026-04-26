const DEFAULT_BASE_URL = "https://larkin.sh";

export interface CheckWalletInput {
  wallet: string;
  chain_id: number;
}

export interface CheckWalletOptions {
  apiKey: string;
  baseUrl?: string;
}

interface CheckResponse {
  ok: boolean;
  data?: unknown;
  error?: { message?: string };
}

export async function checkWallet(
  input: CheckWalletInput,
  opts: CheckWalletOptions,
): Promise<unknown> {
  const url = `${opts.baseUrl ?? DEFAULT_BASE_URL}/api/v1/check`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": opts.apiKey,
    },
    body: JSON.stringify({ wallet: input.wallet, chainId: input.chain_id }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Larkin /api/v1/check returned ${res.status}: ${text}`);
  }

  const json = (await res.json()) as CheckResponse;
  if (!json.ok) {
    throw new Error(
      `Larkin /api/v1/check error: ${json.error?.message ?? "unknown"}`,
    );
  }
  return json.data;
}
