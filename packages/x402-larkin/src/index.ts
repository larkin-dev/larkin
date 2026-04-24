// Root entry point — intentionally does NOT export preflight().
//
// Import from the framework-specific subpath:
//   import { preflight } from "@larkinsh/x402/next";
//   import { preflight } from "@larkinsh/x402/hono";
//   import { preflight } from "@larkinsh/x402/express";
//
// This keeps each adapter's framework types out of the others' bundles.

export const LARKIN_SDK_VERSION = "0.1.0";

export type {
  PreflightOptions,
  CheckResponse,
  PreflightOutcome,
} from "./core.js";
