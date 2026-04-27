// Next.js App Router adapter.
//
//   import { preflight } from "@larkinsh/x402/next";
//   export const POST = preflight(handler, { apiKey: ..., minScore: 40 });
//
// Works with any (req: Request, ctx?) => Response|Promise<Response> handler —
// Next.js's route handler signature. No dependency on next/server types is
// needed because the App Router's Request/Response are Web standards.

import {
  evaluate,
  decorateHeaders,
  denyBody,
  MISSING_PROOF_BODY,
  SERVICE_UNAVAILABLE_BODY,
  type PreflightOptions,
} from "./core.js";

type NextRouteHandler<Ctx = unknown> = (
  req: Request,
  ctx?: Ctx,
) => Response | Promise<Response>;

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function withErrorHeader(res: Response, code: string): Response {
  const headers = new Headers(res.headers);
  headers.set("X-Larkin-Error", code);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export function preflight<Ctx = unknown>(
  handler: NextRouteHandler<Ctx>,
  opts: PreflightOptions,
): NextRouteHandler<Ctx> {
  const mode = opts.mode ?? "block";
  return async (req, ctx) => {
    const outcome = await evaluate((n) => req.headers.get(n), opts);

    if (outcome.kind === "missing_proof") {
      return json(MISSING_PROOF_BODY, { status: 400 });
    }

    if (outcome.kind === "service_unavailable" || outcome.kind === "free_tier_exhausted") {
      if (mode === "block") {
        return json(SERVICE_UNAVAILABLE_BODY, { status: 503 });
      }
      return withErrorHeader(await handler(req, ctx), outcome.kind);
    }

    if (outcome.kind === "deny") {
      return json(denyBody(outcome.score, outcome.checkId, outcome.reason), {
        status: 403,
      });
    }

    // allow — decorate per mode and pass through
    const res = await handler(req, ctx);
    const headers = new Headers(res.headers);
    decorateHeaders(headers, outcome, opts);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };
}
