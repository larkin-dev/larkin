# @larkinsh/mcp

> MCP server exposing Larkin's wallet authorization check as a tool for AI agents (Claude Code, Cursor, and any MCP-aware host).

Provides one tool: `check_wallet` — authorizes an EVM wallet before processing its x402 payment. Returns a 0-100 trust score, an allow/deny/surcharge decision, a 5-dimension scoring breakdown, and an Ed25519-signed receipt verifiable with [`@larkinsh/verify`](https://www.npmjs.com/package/@larkinsh/verify).

## Install

The server is designed to run via `npx`:

```bash
npx @larkinsh/mcp
```

It speaks MCP over stdio. Set `LARKIN_API_KEY` in the environment of the spawning process; the value of `chain_id` defaults to `1` (Ethereum mainnet) when the caller omits it.

## Configure in Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "larkin": {
      "command": "npx",
      "args": ["-y", "@larkinsh/mcp"],
      "env": {
        "LARKIN_API_KEY": "pf_live_..."
      }
    }
  }
}
```

Other MCP hosts (Cursor, custom clients) follow the same shape — spawn `npx -y @larkinsh/mcp` and pipe an `LARKIN_API_KEY` env var.

## Tool reference

### `check_wallet`

| Field | Type | Required | Description |
|---|---|---|---|
| `wallet` | string | yes | EVM wallet address (`0x`-prefixed, 42 chars). |
| `chain_id` | integer | no (default `1`) | EVM chain ID. `1`=Ethereum, `8453`=Base. |

Returns the `data` payload of `POST https://larkin.sh/api/v1/check` — score, breakdown, decision, surcharge multiplier, and signed receipt.

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `LARKIN_API_KEY` | yes | — | Your `pf_live_*` key from <https://larkin.sh/dashboard>. |
| `LARKIN_BASE_URL` | no | `https://larkin.sh` | Override for self-hosted or staging deployments. |

## Programmatic use

```ts
import { createServer } from "@larkinsh/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = createServer({ apiKey: process.env.LARKIN_API_KEY! });
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Documentation

Full docs: <https://larkin.sh/docs>
Source & issues: <https://github.com/larkin-dev/larkin-public-tmp>

## License

MIT
