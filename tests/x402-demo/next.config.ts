import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const config: NextConfig = {
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  // Let Next.js transpile @larkinsh/x402 from the workspace source.
  transpilePackages: ["@larkinsh/x402"],
};

export default config;
