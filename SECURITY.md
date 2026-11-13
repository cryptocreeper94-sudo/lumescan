# Security Policy — Lume Scan — Native Mobile App

## Ecosystem Security Posture

- **Verified, Not Exposed**: Private user and operational records remain inside their domain boundary. Only deterministic SHA-256 digests and provenance metadata are anchored to the public Root Chain (`https://chain.tlid.io`).
- **Containerized Execution**: Production services run as isolated Coolify Docker containers with native health checks across DarkWave Studios' Hetzner infrastructure.
- **Zero Plaintext Credentials**: Secrets and signing keys are injected strictly at container runtime and never committed to source control.

## Reporting a Vulnerability

Please report suspected security vulnerabilities privately to **team@dwsc.io** with reproduction details and affected URLs or commit SHAs. Do not open public GitHub issues for undisclosed vulnerabilities. Reports are acknowledged within 48 hours.
