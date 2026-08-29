# CV Evidence Pack

## Simple project description

API Contract Guard is a local TypeScript command-line tool that compares a defined subset of OpenAPI documents. It reports supported breaking changes in JSON and static HTML, and includes a synthetic demo that can be run locally.

## Skills evidenced by this repository

- TypeScript CLI engineering
- OpenAPI contract analysis
- Bounded local file and reference handling

These are repository-level skills, not claims about production experience.

## CV bullets

- Built a local TypeScript CLI that compares a defined OpenAPI subset and emits JSON and static HTML reports for supported breaking changes.
- Implemented fail-closed handling for unsupported document shapes, local references, and bounded input processing.
- Added 102 local tests, coverage checks, and a reproducible synthetic demo for the supported rule set.

## Short LinkedIn version

Built API Contract Guard, a local TypeScript CLI that fails closed for unsupported OpenAPI shapes and reports a defined set of breaking changes. Its synthetic consumer annotations are local demo inputs, not evidence of real usage.

## Suggested two-minute walkthrough

With dependencies already installed, run:

```sh
npm run demo
```

This is an agenda, not a benchmark or duration claim.

| Time | Show | What it demonstrates |
| --- | --- | --- |
| `0:00` | Run `npm run demo`. | A local synthetic comparison starts. |
| `0:30` | Read the printed tuple: `OPERATION_REMOVED`, `GET`, `/orders`, and `synthetic-shop-web`. | The finding and consumer label are synthetic fixture data. |
| `1:00` | Open the printed HTML artifact and read its verdict and scope disclaimer. | JSON and static HTML describe only the supported rule set. |
| `1:45` | Read the first limitation below. | The tool is not a general OpenAPI compatibility verdict. |

The expected demo scenario prints one synthetic `OPERATION_REMOVED` finding for `GET /orders`, names `synthetic-shop-web`, and prints temporary JSON and HTML artifact paths. It exits `0` because the synthetic finding is expected by the demo.

## Technical decisions

| Decision | Reason | Evidence |
| --- | --- | --- |
| Five explicit rule IDs | Keep the comparison scope inspectable and testable. | [Model](../src/model.ts) and [README rule list](../README.md#supported-rules) |
| Exit codes `0`, `2`, and `3` | Separate no supported findings, supported findings, and invalid or unsupported inputs. | [CLI](../src/cli.ts) and [validation record](../VALIDATION.md) |
| Fail closed for unsupported shapes | Avoid treating unsupported OpenAPI forms as compatible. | [Engine tests](../tests) and [security review](SECURITY_REVIEW.md) |
| Static HTML plus JSON | Provide both machine-readable and locally readable reports. | [Report renderer](../src/report.ts) and [demo](../src/demo.ts) |

## Honest limits

- The tool is local only and is not deployed.
- The comparison covers five rule categories, not every OpenAPI feature or compatibility question.
- The demo data, finding, and consumer label are synthetic.
- There are no claims about clients, users, production traffic, performance, or business impact.

See [Limitations](LIMITATIONS.md) for the full boundary description.

## Likely interview questions

- Which OpenAPI changes are deliberately outside the supported rule set, and why do they fail closed?
- How are local `$ref` values resolved without allowing references outside the configured root?
- Why do findings use exit code `2` while invalid or unsupported input uses exit code `3`?
- What does the synthetic consumer identifier represent, and what does it not prove?
- How would you extend the rule set while preserving the report contract and test coverage?

## Claim-to-proof map

| Claim | Category | Proof |
| --- | --- | --- |
| The documented runtime is Node `24.15.0` with npm `11.18.0`. | Verified source | [Package metadata](../package.json) and [README quick start](../README.md#quick-start) |
| The tool checks five named rule categories. | Verified source | [Rule IDs](../src/model.ts) and [README](../README.md#supported-rules) |
| The CLI has outcomes `0`, `2`, and `3`. | Verified source | [CLI implementation](../src/cli.ts) |
| Local files and references are handled within configured, bounded local processing. | Verified source | [Engine](../src/engine.ts), [architecture](ARCHITECTURE.md), and [limitations](LIMITATIONS.md) |
| Unsupported shapes fail closed rather than receiving a compatibility finding. | Verified source | [Engine](../src/engine.ts) and [security review](SECURITY_REVIEW.md) |
| The synthetic demo reports one `OPERATION_REMOVED` finding for `GET /orders`. | Observed local result | [Demo](../src/demo.ts) and [validation record](../VALIDATION.md) |
| The demo consumer annotation is synthetic and is not usage evidence. | Verified source | [Demo fixture](../tests/fixtures/demo/synthetic-consumers.yaml) and [limitations](LIMITATIONS.md) |
| The recorded local checkpoint contains 102 tests and coverage results. | Observed local result | [Validation record](../VALIDATION.md) |
| The HTML report is static and local. | Verified source | [Report renderer](../src/report.ts) and [architecture](ARCHITECTURE.md) |
| The project is local only and has no deployment or production-use claim. | Verified source | [Limitations](LIMITATIONS.md) and [brief](../BRIEF.md) |
| The three skill labels are TypeScript CLI engineering, OpenAPI contract analysis, and bounded local file and reference handling. | Verified source | [CLI](../src/cli.ts), [rule model](../src/model.ts), and [engine](../src/engine.ts) |

This pack is local draft copy. It is not a publication, application, or claim of external validation.
