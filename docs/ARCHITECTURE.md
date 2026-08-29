# Architecture

## Runtime modules

- `src/cli.ts` and `src/main.ts`: finite CLI contract and static error channel.
- `src/files.ts`: root confinement, no-follow reads, descriptor identity checks, output reservation/publication/cleanup.
- `src/documents.ts`, `src/context.ts`, `src/resolver.ts`: YAML decoding, cumulative budgets, local reference resolution and provenance.
- `src/engine.ts`: supported OpenAPI surface validation, fail-closed shape checks, five-rule comparison and synthetic consumer annotation.
- `src/report.ts`: deterministic JSON-adjacent report assembly helpers and semantic static HTML renderer.
- `src/demo.ts`: synthetic fixture flow and local temporary artifact paths.

## Data flow

The engine reserves the output directory before input processing, loads the baseline and candidate under a confined root, validates raw and resolved Path Item surfaces, resolves local references under cumulative limits, compares only the supported schema subset, then emits JSON and HTML. Exit 0 means no supported finding, exit 2 means at least one supported finding, and exit 3 returns a finite error code with no report artifacts.

The report renderer keeps dynamic values in escaped text content. It contains no scripts, forms, dynamic attributes, external resources, or network URLs. The HTML has semantic verdict, summary, rules, warning and finding states.

See [VALIDATION.md](../VALIDATION.md) for current local gates and [SECURITY.md](../SECURITY.md) for boundaries and limitations.
