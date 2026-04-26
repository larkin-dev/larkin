# Security policy

If you believe you've found a security vulnerability in any Larkin package, please do **not** open a public issue. Instead, email <security@larkin.sh> with details.

## What we promise

- Acknowledgment within 48 hours.
- A fix or mitigation plan for critical issues within 14 days.
- Credit in the published advisory unless you ask to be anonymous.

We do not currently operate a paid bug bounty program.

## In scope

- Published versions of `@larkinsh/x402`, `@larkinsh/verify`, `@larkinsh/mcp`, and `larkin-x402` (PyPI).
- The example consumer at `tests/x402-demo`.

## Out of scope (different reporting paths)

- The hosted scoring service at <https://larkin.sh> — also report to <security@larkin.sh>; the team is the same but the codebase is separate.
- Third-party dependencies (npm, GitHub, Vercel, Supabase, etc.) — report to those vendors directly.

## Disclosure

We coordinate disclosure with reporters. After a fix ships, we publish an advisory via [GitHub Security Advisories](https://github.com/larkin-dev/larkin-public-tmp/security/advisories).
