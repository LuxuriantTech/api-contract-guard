# Validation Record

## Final runtime checkpoint - 2026-08-29

| Gate | Command | Exit | Observed result |
| --- | --- | ---: | --- |
| Typecheck/build/test/demo/smoke/scan | `npm run ci` | 0 | 16 test files, 102 tests; synthetic demo, local smoke, and secret scan passed after W72 remediation. |
| Coverage | `npm run test:coverage` | 0 | Statements 94.06% (555/590), branches 88.46% (483/546), functions 100% (79/79), lines 98.65% (366/371). |
| W71 parameter regression | `npx vitest run tests/rules.test.ts` | 1 then 0 | RED reproduced Path Item `$ref` optional-to-required and enum-loss omissions plus a path-level pointer error; GREEN passed 8 tests after one resolved effective-parameter pass. |
| Dependency and secret gate | `npm run ci:security && npm audit` | 0 | Audit reports 0 vulnerabilities; local scanner passed. |
| Secret inventory | gitleaks directory scan | 0 | 618.71 KB scanned. |
| Git history secret scan | `gitleaks git --redact .` | 0 | Initial commit `b18a6cd305d7576b1a7b70767b23d01c76d6590c` (`feat: build local API contract guard`); 1 commit, about 227159 bytes, no leaks; worktree clean immediately after the scan. |
| Package inventory | `npm pack --dry-run --json` | 0 | 19 files; binary present; excludes `src`, `tests`, and `dist/internal`. |
| Specification | strict spec validator on `docs/SPEC.md` | 1 | 98/100 A, 0 errors, one expected CLI-only HTTP warning. |
| Project validator | `validate_project` | 1 | Its scan traverses README files in `node_modules`; this remains a validator limitation and is not marked resolved. |
| Diff hygiene | `git diff --check` | 0 | No whitespace error observed. |

## Review evidence

- Product runtime review W59: CONFIRMED.
- Focused security review W61 after W60: CONFIRMED.
- The 4096-reference inclusive boundary remains covered by the local test suite.

Historical RED and intermediary checkpoints are intentionally condensed here. The initial local commit above is recorded Git evidence; no remote, push, deployment, publication, or external validation is claimed.
