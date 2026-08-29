# API Contract Guard

API Contract Guard is a local TypeScript CLI that compares a defined subset of two OpenAPI documents. It reports supported breaking changes as JSON and static HTML. It is a portfolio project, not a hosted service or a general OpenAPI compatibility verdict.

## Quick start

Use Node `24.15.0` and npm `11.18.0`.

```sh
npm ci
npm run demo
```

The demo builds the CLI and compares local synthetic fixtures. It prints one synthetic `OPERATION_REMOVED` finding for `GET /orders` and the paths of temporary JSON and HTML artifacts. It does not use a client system, production traffic, or external network access.

## CLI

```sh
api-contract-guard compare \
  --root ./fixtures \
  --baseline ./fixtures/baseline.yaml \
  --candidate ./fixtures/candidate.yaml \
  --out-dir ./artifacts \
  --consumers ./fixtures/consumers.yaml
```

`--consumers` is optional. Consumer identifiers in a report are local annotations, not observed users or usage data.

The CLI has three outcomes:

| Exit code | Meaning | Output |
| --- | --- | --- |
| `0` | No supported breaking changes were found. | JSON and HTML reports |
| `2` | Supported breaking changes were found. | JSON and HTML reports |
| `3` | The input or requested capability is invalid or unsupported. | Error on stderr; no report artifacts |

## Supported rules

The tool checks exactly these five categories:

- `OPERATION_REMOVED`: an operation is removed.
- `REQUIRED_PARAMETER_ADDED`: a required query, header, or cookie parameter is added.
- `REQUEST_REQUIRED_PROPERTY_ADDED`: a required request-body property is added.
- `RESPONSE_REQUIRED_PROPERTY_REMOVED`: a required response-body property is removed.
- `ENUM_VALUE_REMOVED`: a request enum value is removed.

Unsupported document shapes fail closed with exit code `3`. The supported subset and its boundaries are deliberate; see [Limitations](docs/LIMITATIONS.md).

## Local validation

```sh
npm run ci
```

The recorded local validation covers type checking, build, tests with coverage, the synthetic demo, a CLI smoke test, and a local secret scan. Read [VALIDATION.md](VALIDATION.md) for the exact recorded commands and results.

## Documentation

- [Technical brief](BRIEF.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Validation evidence](VALIDATION.md)
- [Security review](docs/SECURITY_REVIEW.md)
- [Limitations](docs/LIMITATIONS.md)
- [CV evidence pack](docs/CV_EVIDENCE_PACK.md)

## Scope

This repository is local only. It has no deployed endpoint, authentication flow, database, customer data, or claim of production use. The synthetic demo is included to make the local behavior reproducible.
