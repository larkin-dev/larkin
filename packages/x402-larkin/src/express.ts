// Express adapter.
//
//   import { preflight } from "@larkinsh/x402/express";
//   app.get("/paid", preflight(handler, { apiKey: ..., minScore: 40 }));
//
// Unlike Next/Hono (return a Response), Express handlers mutate `res` and
// return void. We set our X-Larkin-* headers BEFORE calling the handler so
// they're present when the handler writes the body. The handler is free to
// overwrite them if it wants.

import type { Request, Response, NextFunction, RequestHandler } from "express";
import {
  evaluate,
  decorateHeaders,
  denyBody,
  MISSING_PROOF_BODY,
  SERVICE_UNAVAILABLE_BODY,
  type PreflightOptions,
} from "./core.js";

export function preflight(
  handler: RequestHandler,
  opts: PreflightOptions,
): RequestHandler {
  const mode = opts.mode ?? "block";
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const outcome = await evaluate((n) => {
        const v = req.header(n);
        return typeof v === "string" ? v : null;
      }, opts);

      if (outcome.kind === "missing_proof") {
        res.status(400).json(MISSING_PROOF_BODY);
        return;
      }

      // Collapse service_unavailable, free_tier_exhausted, and tier_hard_cap_exceeded
      // into the same wire response. End agents (the entities making paid API calls)
      // get the same opaque 503 — billing state is the developer's concern, not the
      // agent's. Developers see distinct outcomes via console.warn (with upgradeUrl)
      // and X-Larkin-Error response header in warn mode.
      if (
        outcome.kind === "service_unavailable" ||
        outcome.kind === "free_tier_exhausted" ||
        outcome.kind === "tier_hard_cap_exceeded"
      ) {
        if (mode === "block") {
          res.status(503).json(SERVICE_UNAVAILABLE_BODY);
          return;
        }
        res.setHeader("X-Larkin-Error", outcome.kind);
        return handler(req, res, next);
      }

      if (outcome.kind === "deny") {
        res
          .status(403)
          .json(denyBody(outcome.score, outcome.checkId, outcome.reason));
        return;
      }

      // Set X-Larkin-* before the handler writes anything.
      decorateHeaders(
        { set: (k: string, v: string) => res.setHeader(k, v) },
        outcome,
        opts,
      );
      return handler(req, res, next);
    } catch (err) {
      next(err);
    }
  };
}
