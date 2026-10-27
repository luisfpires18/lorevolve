# LorEvolve.Api

ASP.NET Core minimal-API host for LorEvolve.

- `Program.cs` - composition root.
- `Data/` - `LorEvolveDbContext` + SQLite wiring and migrations.
- `Features/<Feature>/` - one folder per feature: endpoints, handlers, entity configuration.

No generic repository or service layers: features talk to `LorEvolveDbContext` directly.

Local dev database: `App_Data/lorevolve.dev.db` (gitignored, recreated by migrations on startup).
