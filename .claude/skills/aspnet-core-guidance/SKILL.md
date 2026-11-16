---
name: aspnet-core-guidance
description: Focused ASP.NET Core and EF Core conventions for the LorEvolve backend. Use when adding or changing anything under src/LorEvolve.Api - endpoints, DbContext work, migrations, configuration, dependency injection, auth wiring, or backend tests.
---

# ASP.NET Core guidance (LorEvolve)

Conventions for `src/LorEvolve.Api`. Follow these over generic tutorial patterns.

## Structure

- One feature per folder: `Features/<Feature>/`.
- A feature owns its endpoints, request/response records, handlers and
  `IEntityTypeConfiguration<T>` classes. `LorEvolveDbContext` picks configurations up
  automatically via `ApplyConfigurationsFromAssembly`.
- Register endpoints with an extension method named `Map<Feature>Endpoints`, called
  from `Program.cs`. Keep `Program.cs` a list of registrations, not logic.
- No `Repository<T>`, no `IXxxService` wrapper per entity. Inject `LorEvolveDbContext`.
  Extract a class only when there is real behaviour, and keep it inside the feature.

## New feature recipe

Copy `Features/Comments/` (small) or `Features/Chronology/` (full) before inventing a shape.
Files in `Features/<Feature>/`, only the ones the feature needs:

| File | Holds |
| --- | --- |
| `<X>Endpoints.cs` | `Map<X>Endpoints` and its handlers; registered in `Program.cs` |
| `<X>Contracts.cs` | request and response records |
| `<X>Model.cs` | entities |
| `<X>Configuration.cs` | the `IEntityTypeConfiguration<T>` classes |
| `<X>Validation.cs`, `<X>Limits.cs` | field checks, length and count constants |
| `<X>Setup.cs` | dependency injection (`Features/Auth/AuthSetup.cs`) |
| `<X>Access.cs` | access rules beyond universe roles (`Features/Projects/ProjectAccess.cs`) |

- EF configuration: new code puts it in `<X>Configuration.cs`. Existing configurations
  that sit beside their entity stay where they are; do not move them.
- Access: first line of a universe handler is
  `await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.<X>, ct)`
  (`Features/Universes/UniverseAccess.cs`); return its result when not null. Projects use
  `ProjectAccess`, World Logic uses `WorldLogicAccess`. Never re-decide a role in a handler.
- Shared helpers, reuse before writing:
  - `Common/`: `Problems.Field` (400 for one wrong field), `PrincipalExtensions.RequireUserId`,
    `Sql.EscapeLike`, `UtcDates.Utc` (statically imported project-wide).
  - `Features/Media/`: `ImagePreparation` (the one upload gate), `MediaObjectWrites`
    (write and sweep objects), `MediaProblem.Unavailable` (the one 503). No feature
    decodes or stores an image itself.
  - `Features/Mcp/McpResults.cs`: results and errors for every MCP tool class.
  - `Features/Lore/LoreEntries.IsLiveAsync` and `Features/ProjectEntities/CanonLink.CheckAsync`:
    the checks for a link to a live lore entry.
- Before adding a helper: search `Common/` and the owning feature first
  (`Grep` the verb). A second copy is how duplicates appeared; move the first one up
  instead.
- Add the new files to `SYSTEMS.md`.

## Endpoints

- Minimal APIs. Return `TypedResults`/`Results` with explicit status codes.
- Bind request bodies to `sealed record` types declared next to the endpoint.
- Validate at the edge and return `Results.ValidationProblem`; never let invalid
  input reach EF Core.
- Name endpoints with `.WithName(...)` so OpenAPI and tests can reference them.

## EF Core

- `LorEvolveDbContext` is the only context. Do not add a second one.
- Reads that do not feed an update use `AsNoTracking()`.
- Project to DTOs in the query (`Select`) rather than loading entities and mapping.
- Never call `EnsureCreated()`. Schema changes go through migrations:
  `dotnet dotnet-ef migrations add <Name> --project src/LorEvolve.Api --output-dir Data/Migrations`
- Migrations are applied automatically in `Development` only (`DatabaseSetup`).
- SQLite has no `decimal` support worth relying on and limited `ALTER TABLE`; check
  the generated migration before committing it.

## Configuration and secrets

- `appsettings.json` holds non-secret defaults only. The `LorEvolveDb` connection string
  there is intentionally empty.
- Development values go in `appsettings.Development.json` (committed, no secrets).
- Anything secret goes in user secrets (`dotnet user-secrets`, id `lorevolve-api-dev`)
  or environment variables. Never commit a secret, key, token or password.

## Async and cancellation

- Async all the way. Every EF Core call takes the endpoint's `CancellationToken`.
- No `.Result`, no `.Wait()`, no `async void`.

## Tests

- Integration tests use `LorEvolveApiFactory` (`tests/LorEvolve.Api.Tests`), which boots the
  real host against in-memory SQLite. Prefer them over mocking the pipeline.
- Test through HTTP where a feature is reachable over HTTP.
- Test method names use `Snake_case_sentences`; CA1707 is suppressed in that project.

## Auth

- ASP.NET Core Identity with the application cookie, wired in `Features/Auth/AuthSetup.cs`.
  See `docs/architecture/decisions/0005-cookie-authentication.md`.
- Endpoints are anonymous unless they call `.RequireAuthorization()`. There is no
  fallback policy, so every authenticated endpoint must opt in explicitly.
- Never expose an Identity entity. Map to a record in `Features/Auth/AuthContracts.cs`
  or the feature's own contracts.
- Sign-in failures return one uniform response. Do not add messages that distinguish an
  unknown account from a wrong password.
- Do not hand-roll password hashing, cookie signing or token issuing.
