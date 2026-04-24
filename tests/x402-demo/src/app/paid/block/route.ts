import { preflight } from "@larkinsh/x402/next";

const handler = async () =>
  Response.json({ paid: true, mode: "block", hello: "world" });

export const POST = preflight(handler, {
  apiKey: process.env.LARKIN_KEY ?? "demo",
  mode: "block",
  minScore: 90, // set high so vitalik (~62) denies — flip to 40 to see allow path
  endpoint: process.env.LARKIN_ENDPOINT ?? "https://larkin.sh",
});
