# Contributing to Larkin

Thanks for your interest. The four packages in this repo (`packages/*`) are MIT-licensed and open to contributions; the hosted scoring service at <https://larkin.sh> lives in a separate proprietary codebase.

## Reporting issues

- **Bugs:** open an issue using the bug report template.
- **Features:** open an issue using the feature request template before starting work — we have a deliberate scope for each package.
- **Security:** see [SECURITY.md](SECURITY.md). Do not open a public issue.

## Submitting changes

1. Fork and create a topic branch off `main`.
2. `pnpm install` at the repo root.
3. Make your change in the relevant package. Update or add tests.
4. `pnpm typecheck` and `pnpm test` must pass.
5. Open a PR using the template.

## What's in scope

- Bug fixes, type corrections, doc improvements: always welcome.
- New features: open an issue first to discuss design.
- Refactors: discuss in an issue first. Stylistic preferences alone are not sufficient justification.

## Code style

- TypeScript: no implicit `any`; prefer narrow types.
- Python: PEP 8.
- No new dependencies without discussion in an issue.

## Licensing

By contributing, you agree your contribution is licensed under MIT.
