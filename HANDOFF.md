# Handoff

Status: local implementation validated; no local commit is claimed in this file.

## Reproduce

1. Use Node 24.15.0 and npm 11.18.0.
2. Run `npm ci`.
3. Run `npm run ci`.
4. Run `npm run ci:security`, `npm audit`, and `npm pack --dry-run --json` when repeating the final checkpoint.

The demo is synthetic and expected to report one supported breaking change. It creates temporary local artifacts only.

## Known limits

- Filesystem adversarial concurrent mutation is outside the stated model.
- Output publication is non-atomic to concurrent readers; a crash can leave artifacts.
- The project validator currently exits 1 because its scan enters `node_modules` README files. Do not present that validator result as a product defect or as resolved.
- No push, deployment, publication, remote, or production validation has occurred.
