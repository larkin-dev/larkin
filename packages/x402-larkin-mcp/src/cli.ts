#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

const apiKey = process.env.LARKIN_API_KEY;
if (!apiKey) {
  process.stderr.write(
    "@larkinsh/mcp: LARKIN_API_KEY environment variable is required\n",
  );
  process.exit(1);
}

const server = createServer({
  apiKey,
  baseUrl: process.env.LARKIN_BASE_URL,
});

const transport = new StdioServerTransport();
server.connect(transport).catch((err: unknown) => {
  process.stderr.write(`@larkinsh/mcp: failed to start — ${err}\n`);
  process.exit(1);
});
