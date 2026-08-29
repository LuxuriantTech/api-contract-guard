# API Contract Guard - Technical Brief

Status: local runtime implemented and validated on 2026-08-29. This is a finite local developer-tooling slice, not a general OpenAPI compatibility product.

## Scope

The CLI compares two local OpenAPI 3.0.x or 3.1.x YAML documents beneath one root directory. It emits deterministic JSON and static HTML reports for five supported breaking-change rules: operation removal, required query/header/cookie parameter addition, required request-property addition, required response-property removal, and request enum-value removal.

Consumer manifests are synthetic declarations. They annotate matching method/path findings only; they do not prove use, filter findings, or represent real clients.

## Verified local result

The final local checkpoint observed Node 24.15.0 and npm 11.18.0. `npm run ci` completed with 16 test files and 102 tests. The synthetic demo reports one `OPERATION_REMOVED | GET | /orders` finding and names synthetic consumer `synthetic-shop-web`; its JSON and HTML artifacts are temporary local files.

## Boundaries

There is no server, account, remote reference, deployment, telemetry, database, production claim, or real-user/client claim. Unsupported OpenAPI shapes fail closed. Filesystem and publication limitations remain in [SECURITY.md](SECURITY.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
