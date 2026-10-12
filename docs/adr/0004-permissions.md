# ADR 0004: Default-deny command permission registry

Approved 2026-10-12. Every command declares a permission and scope (all|branch|own) in one registry shared by engine and API; undeclared commands are refused. Reps are restricted to their own customers on the server (R1).

Source: `docs/audit/refactor-roadmap.md`, "Decisions I need from you".
