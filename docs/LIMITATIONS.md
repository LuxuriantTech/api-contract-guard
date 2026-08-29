# Limitations

## Deliberate comparison scope

API Contract Guard checks only five defined breaking-change categories. It is not a complete OpenAPI validator and it does not provide a general compatibility or safety verdict. Documents, references, and shapes outside the supported subset are rejected with exit code `3` rather than interpreted optimistically.

The tool accepts local files beneath an explicit root. It does not fetch URLs, call external APIs, expose an HTTP service, or process uploaded files.

## Report meaning

Exit code `0` means that no supported breaking changes were found. Exit code `2` means that supported breaking changes were found. Neither outcome proves that an API is compatible for every consumer or every OpenAPI feature.

Consumer identifiers are optional local annotations supplied in an input file. They are not telemetry, customer records, observed users, or evidence of real usage.

## Local demonstration only

The included demo compares synthetic fixture documents. Its `GET /orders` finding and `synthetic-shop-web` consumer label are synthetic examples. They do not describe a deployed API, a client, a user, or production impact.

The project has local validation evidence, but no deployment, external user study, production workload, benchmark claim, or public release.

## Filesystem and output boundaries

Input checks reduce common local path, reference, size, and race risks, but they are not a substitute for a sandbox or an operating-system security boundary. Output generation is intended for a local command run; concurrent readers or a process interruption can observe incomplete or leftover artifacts.

For the exact local checks and their results, see [VALIDATION.md](../VALIDATION.md), [SECURITY.md](../SECURITY.md), and [the technical security review](SECURITY_REVIEW.md).
