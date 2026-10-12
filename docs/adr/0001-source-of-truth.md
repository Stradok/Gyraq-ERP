# ADR 0001: Postgres state tables are the source of truth

Approved 2026-10-12. Replaces boot-time replay of the command log (audit A-1). Commands remain as an immutable audit/outbox log. Implemented in milestone R2 behind a repository interface; the demo keeps the in-memory repository.

Source: `docs/audit/refactor-roadmap.md`, "Decisions I need from you".
