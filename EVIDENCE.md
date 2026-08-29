# Local Evidence Index

| Claim | Local evidence | Observed result | Limit |
| --- | --- | --- | --- |
| Runtime gate | `npm run ci` | Exit 0; 16 files, 102 tests | Local execution only. |
| Coverage | `npm run test:coverage` | Statements 94.40%, branches 87.62%, functions 100%, lines 98.73% | V8 local coverage. |
| Demo | `npm run demo` | One synthetic `OPERATION_REMOVED | GET | /orders`; local temporary JSON/HTML paths | Not production traffic or client evidence. |
| Security dependencies | `npm run ci:security`, `npm audit` | Exit 0; 0 vulnerabilities reported | Point-in-time local dependency state. |
| Secret scan | local gitleaks directory scan | Exit 0 on 618.71 KB | Scan result is not a publication or external assessment. |
| Package boundary | `npm pack --dry-run --json` | Exit 0; 19 files; binary present; no `src`, `tests`, or `dist/internal` | Package was not published. |
| Independent review | W59 product CONFIRMED; W61 focused security CONFIRMED | Runtime UX and W60 diff reviewed independently | Reviews are local mission evidence. |

The project validator command remains exit 1 because its repository-wide scan reads README files in `node_modules`. This is recorded as a validator limitation, not as a resolved product result or a product runtime failure.
