# ADR 0002 - SQLite with EF Core migrations

Status: accepted (2026-09-06)

## Context

Development must work from a clean clone with no database server to install.

## Decision

EF Core with the SQLite provider. The development database lives at
`src/LorEvolve.Api/App_Data/lorevolve.dev.db` (gitignored) and is created by applying
migrations at startup, in the `Development` environment only.

Relative `Data Source` values are resolved against the content root by
`Data/DatabaseSetup.cs`, so the file location does not depend on the working directory.

Integration tests replace the provider with in-memory SQLite so they never touch
the developer database.

## Consequences

- Zero-setup local development; delete the file to reset.
- Provider-specific SQL must be avoided if a move to PostgreSQL becomes likely.
- Production deployments must run migrations explicitly; startup migration is dev-only.
