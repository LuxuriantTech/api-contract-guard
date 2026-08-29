# Security Boundary

API Contract Guard is local-only. It accepts bounded local YAML files under an explicit root and has no service endpoint, authentication, credentials, network reference support, telemetry, deployment, or external reporting.

Implemented controls include no-follow input handles, root and symlink confinement, before/after descriptor identity checks, bounded YAML decoding and references, fail-closed unsupported surfaces, exclusive private report files, identity-matched cleanup, deterministic static HTML, and fixed CLI error lines. Runtime evidence and the 25-control status matrix are in [docs/SECURITY_REVIEW.md](docs/SECURITY_REVIEW.md).

Limits: the threat model excludes adversarial concurrent filesystem mutation; report publication is non-atomic to a concurrent reader; and a process crash can leave owned artifacts. The project makes no production-security or production-use claim.
