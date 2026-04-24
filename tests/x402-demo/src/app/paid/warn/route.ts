import { preflight } from "@larkinsh/x402/next";

const handler = async () =>
  Response.json({ paid: true, mode: "warn", hello: "world" });

export const POST = preflight(handler, {
  apiKey: process.env.LARKIN_KEY ?? "demo",
  mode: "warn",
  minScore: 90,
  endpoint: process.env.LARKIN_ENDPOINT ?? "https://larkin.sh",
});
