import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { checkWallet, type CheckWalletOptions } from "./tools/check-wallet.js";

export type ServerOptions = CheckWalletOptions;

export function createServer(opts: ServerOptions): McpServer {
  const server = new McpServer({ name: "@larkinsh/mcp", version: "1.0.0" });

  server.registerTool(
    "check_wallet",
    {
      description:
        "Authorize an EVM wallet before processing its x402 payment. " +
        "Returns a 0-100 trust score, an allow/deny/surcharge decision, " +
        "a 5-dimension scoring breakdown (wallet age, transaction history, " +
        "counterparties, funding source, ERC-8004 reputation), and an " +
        "Ed25519-signed receipt independently verifiable with @larkinsh/verify. " +
        "Call this whenever you need to gate access to an API endpoint based " +
        "on the trust of a paying wallet.",
      inputSchema: {
        wallet: z
          .string()
          .describe("EVM wallet address (0x-prefixed, 42 chars)."),
        chain_id: z
          .number()
          .int()
          .default(1)
          .describe("EVM chain ID. 1=Ethereum, 8453=Base. Defaults to 1."),
      },
    },
    async (args) => {
      const result = await checkWallet(args, opts);
      return {
        content: [
          { type: "text", text: JSON.stringify(result, null, 2) },
        ],
      };
    },
  );

  return server;
}
