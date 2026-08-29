# Validation Record

## Current root CI checkpoint - 2026-08-29

| Gate | Command | Exit | Observed result |
| --- | --- | ---: | --- |
| Typecheck/build/test/demo/smoke/scan | `npm run ci` | 0 | 16/16 test files and 102/102 tests; synthetic demo, local smoke, and local secret scan passed. |
| Coverage | Included in `npm run ci` | 0 | Statements 94.12% (561/596), branches 88.72% (480/541), functions 100% (80/80), lines 98.67% (371/376). |

## Current targeted remediation evidence

| Checkpoint | Command | Observed result |
| --- | --- | --- |
| W76 consumer reference repair | `./node_modules/.bin/vitest run tests/report-and-consumers.test.ts` | RED returned `CONSUMER_INVALID`; GREEN passed 1 file and 10 tests without a new `it`. |
| W80 consumer idempotence repair | `./node_modules/.bin/vitest run tests/report-and-consumers.test.ts` | RED received duplicate `consumerIds`; GREEN passed 1 file and 10 tests without a new `it`. |
| W81 independent idempotence review | Local targeted review | The first sub-pass was incomplete, then static review completed; 2 files and 19 targeted tests exited 0. |

## Historical checks not rerun in the current root CI

| Gate | Historical observation | Limit |
| --- | --- | --- |
| Dependency and secret gate | `npm run ci:security && npm audit` exit 0; audit reported 0 vulnerabilities. | Not rerun in the current root CI. |
| Secret inventory | Gitleaks directory scan exit 0; 618.71 KB scanned. | Historical local scan. |
| Git history secret scan | `gitleaks git --redact .` exit 0 on the initial commit `b18a6cd305d7576b1a7b70767b23d01c76d6590c` (`feat: build local API contract guard`); 1 commit, about 227159 bytes, no leaks. | Historical local scan; no current worktree or new-commit claim. |
| Package inventory | `npm pack --dry-run --json` exit 0; 19 files; binary present; excludes `src`, `tests`, and `dist/internal`. | Not rerun in the current root CI. |
| Specification | Strict spec validator on `docs/SPEC.md`: 98/100 A, 0 errors, one expected CLI-only HTTP warning. | Historical validation. |
| Project validator | `validate_project` source-only was `VALID`. The installed invocation traverses README files in `node_modules` and produces the documented false positive. | Validator limitation remains unresolved. |
| Diff hygiene | `git diff --check` exit 0. | Historical checkpoint result. |

## Review evidence

- Product runtime review W59: CONFIRMED.
- Focused security review W61 after W60: CONFIRMED.
- The 4096-reference inclusive boundary remains covered by the local test suite.

Historical RED and intermediary checkpoints are preserved as evidence. No remote, push, deployment,
publication, or external validation is claimed.
