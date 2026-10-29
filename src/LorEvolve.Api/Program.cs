using LorEvolve.Api.Data;
using LorEvolve.Api.Features.Admin;
using LorEvolve.Api.Features.Feedback;
using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.Assistant;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.DatabaseBackups;
using LorEvolve.Api.Features.Comments;
using LorEvolve.Api.Features.Export;
using LorEvolve.Api.Features.FamilyTrees;
using LorEvolve.Api.Features.Health;
using LorEvolve.Api.Features.Ideas;
using LorEvolve.Api.Features.Knowledge;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Maps;
using LorEvolve.Api.Features.Mcp;
using LorEvolve.Api.Features.Media;
using LorEvolve.Api.Features.Profile;
using LorEvolve.Api.Features.Progression;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Relationships;
using LorEvolve.Api.Features.Restore;
using LorEvolve.Api.Features.RuleValidation;
using LorEvolve.Api.Features.Search;
using LorEvolve.Api.Features.Seo;
using LorEvolve.Api.Features.Storage;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Suggestions;
using LorEvolve.Api.Features.Timeline;
using LorEvolve.Api.Features.Trash;
using LorEvolve.Api.Features.Universes;
using LorEvolve.Api.Features.WorldRules;
using LorEvolve.Api.Hosting;

// Operator commands (ADR 0064): `database-backup run | list | restore-drill`, with the app's own configuration, then exit.
if (args is [DatabaseBackupCli.Verb, ..])
{
    Environment.ExitCode = await DatabaseBackupCli.RunAsync(args);
    return;
}

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();
builder.Services.AddLorEvolveResponseCompression();

builder.Services.AddLorEvolveForwardedHeaders(builder.Configuration);
builder.Services.AddLorEvolveDataProtection(builder.Configuration, builder.Environment);
builder.Services.AddLorEvolveDatabase(builder.Configuration, builder.Environment);
builder.Services.AddLorEvolveAuth(builder.Environment);
builder.Services.AddLorEvolveAdmin();
LorEvolve.Api.Features.Email.AppEmail.AddAppEmail(builder.Services);
builder.Services.AddCanonIntegrity();
builder.Services.AddLoreSearch();
builder.Services.AddHostedService<LorEvolve.Api.Features.Publishing.PublicAuthorBackfill>();
builder.Services.AddLorEvolveMedia(builder.Configuration);
builder.Services.AddHostedService<LorEvolve.Api.Features.AiChanges.AiChangeMediaSweep>();
builder.Services.AddSingleton<LorEvolve.Api.Features.AiChanges.AiChangeProgress>();
builder.Services.AddBackupRestore();
builder.Services.AddLorEvolveDatabaseBackups(builder.Configuration);
builder.Services.AddLorEvolveSeo(builder.Configuration);
builder.Services.AddLorEvolveAssistant(builder.Configuration);
builder.Services.AddLorEvolveMcp(builder.Configuration, builder.Environment);

var corsOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
if (corsOrigins.Length > 0)
{
    builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy
        .WithOrigins(corsOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()));
}

var app = builder.Build();

// First: everything after this point may read the request scheme, and behind a TLS-terminating
// proxy the scheme is only correct once the forwarded header has been applied.
app.UseLorEvolveForwardedHeaders();
app.UseLorEvolveSecurityHeaders();
app.UseLorEvolveRobotsHeaders();

// Early, so whatever follows that throws answers RFC 7807 with a trace id rather than an empty 500.
app.UseLorEvolveUnhandledFailures();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

if (corsOrigins.Length > 0)
{
    app.UseCors();
}

// Dev runs the client on the Vite dev server over plain HTTP, so the local launcher does not
// depend on a trusted dev certificate. A deployment serves the built client from wwwroot and
// terminates TLS in front of the app.
app.UseLorEvolveResponseCompression();
app.UseLorEvolveFrontend();

app.UseAuthentication();
app.UseAuthorization();

// After authorization: the MCP endpoint's own gate (bearer tokens only, checked against the live connection), and the
// rate limit on open client registration.
app.UseLorEvolveMcp();

app.MapHealthEndpoints();
app.MapAuthEndpoints();
app.MapAdminEndpoints();
app.MapFeedbackEndpoints();
app.MapDatabaseBackupEndpoints();
app.MapProfileImageEndpoints();
app.MapAccountStorageEndpoints();
app.MapUniverseEndpoints();
app.MapCollaboratorEndpoints();
app.MapInvitationEndpoints();
app.MapPublicationEndpoints();
app.MapContentPublicationEndpoints();
app.MapUniverseArtworkEndpoints();
app.MapPublicNameEndpoints();
app.MapPublicUniverseEndpoints();
app.MapPublicAuthorEndpoints();
app.MapPublicStatsEndpoints();
app.MapChronologyEndpoints();
app.MapEntityTypeEndpoints();
app.MapEntityTypeGroupEndpoints();
app.MapEntityEndpoints();
app.MapEntityImageEndpoints();
app.MapEntityRevisionEndpoints();
app.MapEntityArticleEndpoints();
app.MapEntityPrivateNoteEndpoints();
app.MapMapEndpoints();
app.MapKnowledgeEndpoints();
app.MapProgressionEndpoints();
app.MapAppearanceImageEndpoints();
app.MapRelationshipTypeEndpoints();
app.MapRelationshipEndpoints();
app.MapFamilyTreeEndpoints();
app.MapTimelineEndpoints();
app.MapWorldRuleEndpoints();
app.MapValidationTermEndpoints();
app.MapStoryEndpoints();
app.MapChapterEndpoints();
app.MapSceneEndpoints();
app.MapSceneManuscriptEndpoints();
app.MapLoreReferenceEndpoints();
app.MapPlotArcEndpoints();
app.MapPlotBeatEndpoints();
app.MapCanonIntegrityEndpoints();
app.MapTrashEndpoints();
app.MapCommentEndpoints();
app.MapSuggestionEndpoints();
app.MapAiChangeEndpoints();
app.MapAiChangeMediaEndpoints();
app.MapIdeaEndpoints();
app.MapIdeaBoardEndpoints();
app.MapUniverseSearchEndpoints();
app.MapAssistantEndpoints();
app.MapOAuthEndpoints();
app.MapClientRegistrationEndpoints();
app.MapConnectedAppEndpoints();
app.MapLorEvolveMcpEndpoints();
app.MapUniverseExportEndpoints();
app.MapBackupRestoreEndpoints();
app.MapSeoEndpoints();

// Last: the client-side routing fallback only answers what no route above claimed.
app.MapLorEvolveFrontendFallback();

await app.RunAsync();

/// <summary>Exposed so integration tests can boot the real host through WebApplicationFactory.</summary>
public partial class Program;
