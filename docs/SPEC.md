# API Contract Guard Specification

**Author:** solution_architect
**Date:** 2026-08-29
**Status:** Approved 2026-08-29 by internal_orchestrator
**Reviewers:** contract, product, and security checkpoints independently reviewed; see VALIDATION.md and docs/SECURITY_REVIEW.md

## Context

API Contract Guard is a local developer-tool proposal. It compares a baseline and candidate OpenAPI surface and reports only five supported breaking-change rules. The goal is reproducible synthetic evidence, not a production, usage, safety, compatibility, or global no-breakage claim. Market demand is inferred from APIs, tests, and TypeScript signals; no observed offer explicitly requests OpenAPI.

## Functional Requirements

- FR-1: The CLI MUST expose `api-contract-guard compare --root <dir> --baseline <file> --candidate <file> --out-dir <absent-dir> [--consumers <file>]`.
- FR-2: Every root-relative input and the preexisting root-relative parent of `out-dir` MUST be checked component-by-component with `lstat`; any symlink is rejected and each realpath MUST remain under root. Each opened input MUST use one `O_RDONLY|O_NOFOLLOW` descriptor, be `fstat`-verified regular before and after read, and retain identical `(dev, ino, size, mtime)` before/after. A detected race exits 3. The threat model excludes any adversarial concurrent filesystem mutation, including parent swaps; this finite protocol detects only races observed by its checks.
- FR-3: The loader MUST accept OpenAPI 3.0.x/3.1.x, standard HTTP methods, and `application/json`. It MUST use `parseAllDocuments`, require exactly one core-schema document, reject every parser error and warning, and call `toJS({ maxAliasCount: 50 })`. Before normalization, iterative traversal and copy MUST enforce 128 YAML depth and 100000 nodes globally in addition to 1 MiB/file and 50 aliases. The resulting value MUST be deep-copied into JSON-compatible arrays and null-prototype objects, reject cyclic graphs and non-JSON-compatible scalars, preserve `__proto__` as an own data key without prototype pollution, and reject duplicate/custom-tag/multidocument YAML.
- FR-4: Refs MUST split on the first `#` only and allow only local relative file refs plus an empty or `/`-prefixed RFC6901 JSON Pointer. They MUST reject percent encoding, query, URI scheme/authority, absolute paths, `..`, non-Pointer fragments, other `~` escapes, inherited properties, and noncanonical array indices. Decode pointer tokens once (`~1`, then `~0`); resolve own properties only; key cycles by `realpath + pointer`; and enforce global file, resolution, chain, pointer, token, size, and schema-depth counters. Any invalid ref, YAML ambiguity, or limit breach exits 3.
- FR-5: The engine MUST emit only `OPERATION_REMOVED`, `REQUIRED_PARAMETER_ADDED`, `REQUEST_REQUIRED_PROPERTY_ADDED`, `RESPONSE_REQUIRED_PROPERTY_REMOVED`, and request-side `ENUM_VALUE_REMOVED`. The enum rule applies only to query/header/cookie parameter schemas and reachable `application/json` request-body schemas. Any response-side enum domain difference exits 3 as `CAPABILITY_UNSUPPORTED`; direction is intentionally limited because the tool does not model response-domain compatibility.
- FR-6: Query/header/cookie parameters MUST use operation-over-path override and case-insensitive headers; request `readOnly` and response `writeOnly` MUST be excluded from effective required sets.
- FR-7: Descendants caused only by an ancestor finding MUST be suppressed. Consumers MUST annotate matching findings by declared method/path only from `{version:1, consumers:[{id, operations:[{method,path}]}]}`; every listed operation MUST exist in baseline. Consumer declarations are synthetic, never filter, constrain, or suppress comparison findings, and never claim real usage or that no consumer is affected.
- FR-8: The exact `out-dir` MUST be reserved first with exclusive `mkdir` mode 0700; an existing or concurrent target exits 3 and is never replaced. The tool MUST create only `report.json` and `report.html` in that reserved directory through exclusive `wx`, fsync, and close. On a controlled error it MAY unlink only a report whose `(dev, ino)` still equals the descriptor it created, then `rmdir` only if empty; otherwise it leaves the trace. Publication is not atomic for a concurrent reader, and a crash may leave the reserved directory or report files. Exit 0 is `no-supported-breaking-change-detected` with exact disclaimer `No supported breaking changes detected. This is not a general OpenAPI compatibility verdict. Review warnings and supportedRules.`; exit 2 is `supported-breaking-change-detected`; exit 3 has static stderr, empty stdout, and no JSON or HTML report.
- FR-9: Reports MUST be deterministic UTF-8/LF, Unicode-code-unit sorted, and omit timestamp, absolute path, locale, and random data. Findings sort by `(method, path, pointer, ruleId, message)`, warnings by `(location, code, message)`, consumer IDs and supported rules by Unicode code unit, and report map keys by Unicode code unit. Dynamic HTML is permitted only in escaped text nodes; no dynamic attribute, URL, CSS, script, event handler, form, or external resource is permitted. Escape `&< >"'` plus U+2028/U+2029. For exit 3, stdout MUST be empty and stderr exactly `ERROR <ASCII_ERROR_CODE>\n`, where `ASCII_ERROR_CODE` is one of `CLI_USAGE`, `PATH_INVALID`, `INPUT_RACE`, `INPUT_LIMIT`, `DOCUMENT_INVALID`, `REF_INVALID`, `CAPABILITY_UNSUPPORTED`, `CONSUMER_INVALID`, `OUTPUT_INVALID`, or `INTERNAL_ERROR`; it contains no dynamic data.

## Non-Functional Requirements

- NFR-1: Use Node 24.15.0/npm 11, ESM NodeNext, exact TypeScript 7.0.2, yaml 2.9.0, Vitest 4.1.11, @vitest/coverage-v8 4.1.11, @types/node 24.13.3, and lockfile v3. `yaml` is the sole runtime dependency.
- NFR-2: Limits MUST be inclusive: 1 MiB/file, 8 MiB total, 128 consumed file identities, 4096 global ref-resolution occurrences (cache included), ref chain 32, schema depth 32, pointer 2048 characters/128 tokens, 50 YAML aliases, YAML depth 128 with root container depth 0, and 100000 YAML nodes. Total bytes sum once per consumed file identity (distinct baseline/candidate identities count separately; cache hits of one realpath add no bytes). Resolution count increments for each effectively resolved `$ref` occurrence, including cache hits, across one compare. `maxAliasCount` MUST NOT replace size, node, or schema limits.
- NFR-3: The reachable compared surface is baseline paths -> operations -> effective parameters -> `application/json` request bodies -> every numeric or `default` baseline response with its matching candidate response -> schemas recursively through properties, items, and refs. Missing candidate response/media/schema makes reachable baseline required response properties removed. Supported schema is object, array/items, string, number, integer, boolean, properties, required, readOnly, writeOnly, and unique string enum. Composition, dynamic refs, union types, or non-string enum on this reachable surface exit 3. Response-side enum domain differences exit 3 as `CAPABILITY_UNSUPPORTED`. `WarningCode` is closed: `IGNORED_MEDIA_TYPE` only for media other than `application/json`; `IGNORED_PARAMETER_LOCATION` only for `path`; `IGNORED_SCHEMA_KEYWORD` only for `title`, `description`, `example`, `examples`, `deprecated`, or `format`; `IGNORED_OPENAPI_SURFACE` only for root `info`, `servers`, `tags`, `externalDocs`, `security`, `webhooks`, or components never reached; request-side `ENUM_DOMAIN_UNBOUNDED` only for an enum wholly added or removed; `REQUEST_BODY_REQUIRED_CHANGED` only for its flag; and `NEW_REQUEST_BODY` only when candidate alone has it. Any other reachable key/construction or ambiguity that could influence a supported rule exits 3.
- NFR-4: The tool MUST NOT use network, subprocess, shell, or user modules. It SHOULD complete the documented demo below 5 seconds and 256 MiB; this is not a claimed maximum.
- NFR-5: Coverage MUST reach 90% lines/functions and 85% branches.

## Acceptance Criteria

### AC-1: Identical input (FR-1, FR-8)
Given identical supported fixtures, When compare runs, Then exit is 0 with exact verdict, disclaimer, and no findings.

### AC-2: Operation (FR-5)
Given a baseline operation missing from candidate, When compare runs, Then it reports `OPERATION_REMOVED` and exits 2.

### AC-3: Parameter (FR-6)
Given an added required query/header/cookie parameter, When compare runs, Then it reports `REQUIRED_PARAMETER_ADDED` using override and header folding.

### AC-4: Request (FR-6)
Given a candidate adds an effective required request property, When compare runs, Then it reports `REQUEST_REQUIRED_PROPERTY_ADDED` and ignores `readOnly`.

### AC-5: Response (FR-6)
Given a baseline required response property disappears, When compare runs, Then it reports `RESPONSE_REQUIRED_PROPERTY_REMOVED` and ignores `writeOnly`.

### AC-6: Request enum/dedup (FR-5, FR-7)
Given only a request-side reachable string enum loses a value, When compare runs, Then it emits `ENUM_VALUE_REMOVED`; given its ancestor is already removed, it emits no descendant caused only by that ancestor. Given a response-side enum domain difference, When compare runs, Then it exits 3 as `CAPABILITY_UNSUPPORTED`.

### AC-7: Refs (FR-3)
Given equivalent inline and valid local-ref fixtures, When compare runs, Then findings and verdict match; reports need not be byte-identical if input hashes differ.

### AC-8: Invalid refs/limits/races (FR-2, FR-4, FR-8, NFR-2, NFR-3)
Given a forbidden ref, invalid/duplicate/custom-tag/multidoc YAML, alias 51, YAML cycle, YAML depth 129, 100001 YAML nodes, unsupported reachable surface, symlink or file-to-symlink race, output-parent symlink, or preexisting/concurrent `out-dir`, When compare runs, Then it exits 3. Refs cover `%2e%2e`, `~2`, cycle, and noncanonical array-index rejection; reachable composition and a non-allowlisted warning also exit 3. A `__proto__` fixture succeeds and proves an own null-prototype data key without prototype pollution. Parent input swaps are excluded by the stated threat limitation.

### AC-9: Consumer manifest (FR-7)
Given a listed consumer operation absent from baseline, When compare runs, Then it exits 3. Given a synthetic declaration matching a finding, Then it only annotates that finding; given no link, Then it does not filter findings or claim no consumer is affected.

### AC-10: Determinism/HTML/budgets/errors (FR-9, NFR-4, NFR-5)
Given identical inputs twice and hostile text including `</style><svg onload=...>`, When compare runs, Then bytes match, HTML renders it only as escaped text, and fixture duration/memory/coverage observations are recorded. Given nonempty warnings, Then JSON retains its bounded verdict and HTML prominently displays neutral `Warnings require manual review`, never green or safe. Given each allowlisted warning and a near miss, When compare runs, Then only the documented warning is emitted and the near miss exits 3. Given an exit-3 sentinel containing CRLF, ESC, bidi, and an absolute path, Then stdout is empty, stderr is exactly one permitted static ASCII error line, and no JSON or HTML report exists.

### AC-11: Synthetic two-minute demo (FR-1, FR-5, FR-7, NFR-4)
Given installed dependencies, When `npm run demo` runs, Then it builds and compares versioned synthetic Shop API baseline/candidate fixtures and an explicitly synthetic consumer manifest, expects exit 2 internally, writes deterministic artifacts and demo report files, and prints the exact supported finding summary without claiming a real client, user, or usage.

## Edge Cases

- EC-1: Empty paths, whole-path removal, parameter overrides/duplicates, parent-required dedupe, and request-side enum add/remove obey the five-rule boundary; response-side enum differences are unsupported.
- EC-2: Missing matching response or media type treats reachable baseline required properties as removed.
- EC-3: Bad, duplicate, custom-tag, multidoc, alias-51, cyclic, depth-129, and node-100001 YAML; bad pointers including `%2e%2e`, `~2`, cycles, and noncanonical indices; and all resolver/size/depth limits exit 3. `__proto__` remains an own null-prototype key and does not pollute prototypes.
- EC-4: File-to-symlink, output-parent symlink, and preexisting/concurrent output-target cases fail closed with exit 3; controlled cleanup touches only identity-matched files and an empty owned directory, while crashes may leave a trace.
- EC-5: Consumer declarations annotate only matching findings by method/path and are explicitly synthetic, not evidence of usage.

## API Contracts

The CLI has no network API. Its TypeScript contract is:

```ts
type ExitCode = 0 | 2 | 3;
type HttpMethod = "get" | "put" | "post" | "delete" | "patch" | "head" | "options" | "trace";
type RuleId = "OPERATION_REMOVED" | "REQUIRED_PARAMETER_ADDED" | "REQUEST_REQUIRED_PROPERTY_ADDED" | "RESPONSE_REQUIRED_PROPERTY_REMOVED" | "ENUM_VALUE_REMOVED";
// RuleId and summary taxonomy keys are closed ASCII identifiers; Unicode ordering applies to data collections, not invented taxonomy.
interface CompareOptions { root: string; baseline: string; candidate: string; outDir: string; consumers?: string }
interface Finding { ruleId: RuleId; method: HttpMethod; path: string; pointer: string; message: string; consumerIds: string[] }
interface ConsumerManifest { version: 1; consumers: Array<{ id: string; operations: Array<{ method: HttpMethod; path: string }> }> }
type WarningCode = "IGNORED_MEDIA_TYPE" | "IGNORED_PARAMETER_LOCATION" | "IGNORED_SCHEMA_KEYWORD" | "IGNORED_OPENAPI_SURFACE" | "ENUM_DOMAIN_UNBOUNDED" | "REQUEST_BODY_REQUIRED_CHANGED" | "NEW_REQUEST_BODY";
type ErrorCode = "CLI_USAGE" | "PATH_INVALID" | "INPUT_RACE" | "INPUT_LIMIT" | "DOCUMENT_INVALID" | "REF_INVALID" | "CAPABILITY_UNSUPPORTED" | "CONSUMER_INVALID" | "OUTPUT_INVALID" | "INTERNAL_ERROR";
interface Report { verdict: "no-supported-breaking-change-detected" | "supported-breaking-change-detected"; disclaimer: string; inputSha256: Record<string,string>; supportedRules: RuleId[]; findings: Finding[]; warnings: Array<{ code: WarningCode; location: string; message: string }>; summary: Record<RuleId,number> }
type CompareSuccess = { exitCode: 0 | 2; report: Report; errorCode?: undefined };
type CompareFailure = { exitCode: 3; errorCode: ErrorCode; report: undefined };
type CompareResult = CompareSuccess | CompareFailure;
declare function compare(options: CompareOptions): Promise<CompareResult>;
// Exit 3 returns errorCode and report: undefined; this JavaScript property creates neither JSON nor
// HTML artifact and CLI serialization alone owns stdout/stderr.
```

## Data Models

| Field | Type | Constraints |
|---|---|---|
| root | string | existing root; realpath boundary |
| baseline/candidate | string | root-relative supported document |
| outDir | string | absent root-relative directory |
| ConsumerManifest.version | literal `1` | exact, synthetic declaration only |
| consumers[].id | string | non-empty, unique |
| operations[] | method/path | must exist in baseline |
| Report.inputSha256 | map | consumed inputs only; no absolute path |

## Out of Scope

- OS-1: Complete OpenAPI validation, Swagger 2/3.2, callbacks, webhooks, links, and complete JSON Schema are excluded to bound semantics.
- OS-2: HTTP refs, plugins, SDK/code consumer analysis, and real usage claims are excluded because consumers are declarative/synthetic.
- OS-3: Server, database, auth, UI application, Docker, cloud, telemetry, deployment, and production/client/global-guarantee claims are excluded.

## Open Questions

None. Any extension requires a new specification.
