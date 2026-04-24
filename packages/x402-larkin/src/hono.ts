// Hono adapter.
//
//   import { preflight } from "@larkinsh/x402/hono";
//   app.get("/paid", preflight(handler, { apiKey: ..., minScore: 40 }));

import type { Context } from "hono";
import {
  evaluate,
  decorateHeaders,
  denyBody,
  MISSING_PROOF_BODY,
  SERVICE_UNAVAILABLE_BODY,
  type PreflightOptions,
} from "./core.js";

type HonoHandler = (c: Context) => Response | Promise<Response>;

function wrapResponseWithHeader(res: Response, name: string, value: string): Response {
  const headers = new Headers(res.headers);
  headers.set(name, value);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export function preflight(
  handler: HonoHandler,
  opts: PreflightOptions,
): HonoHandler {
  const mode = opts.mode ?? "block";
  return async (c) => {
    const outcome = await evaluate((n) => c.req.header(n) ?? null, opts);

    if (outcome.kind === "missing_proof") {
      return new Response(JSON.stringify(MISSING_PROOF_BODY), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (outcome.kind === "service_unavailable") {
      if (mode === "block") {
        return new Response(JSON.stringify(SERVICE_UNAVAILABLE_BODY), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      return wrapResponseWithHeader(
        await handler(c),
        "X-Larkin-Error",
        "service_unavailable",
      );
    }

    if (outcome.kind === "deny") {
      return new Response(
        JSON.stringify(denyBody(outcome.score, outcome.checkId, outcome.reason)),
        { status: 403, headers: { "content-type": "application/json" } },
      );
    }

    const res = await handler(c);
    const headers = new Headers(res.headers);
    decorateHeaders(headers, outcome, opts);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };
}
