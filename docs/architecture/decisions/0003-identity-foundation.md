# ADR 0003 - Identity foundation deferred to the auth phase

Status: accepted (2026-09-06)

## Context

The stack calls for ASP.NET Core Identity, but the bootstrap phase must not add
product features, and the user entity shape is not decided yet.

## Decision

Reference `Microsoft.AspNetCore.Identity.EntityFrameworkCore` now. Do not derive
`LorEvolveDbContext` from `IdentityDbContext`, register Identity services, or create
Identity tables yet.

The authentication phase changes the base class, adds the Identity migration and
decides whether a custom user type is needed.

## Consequences

- The initial migration contains no Identity schema, so no rework if the user type
  gains fields.
- Enabling Identity is a single base-class change plus one migration.
