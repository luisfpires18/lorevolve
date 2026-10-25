using Lorex.Api.Data;
using Lorex.Api.Features.Admin;
using Lorex.Api.Features.AiChanges;
using Lorex.Api.Features.Assistant;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Comments;
using Lorex.Api.Features.Export;
using Lorex.Api.Features.FamilyTrees;
using Lorex.Api.Features.Health;
using Lorex.Api.Features.Ideas;
using Lorex.Api.Features.Knowledge;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Maps;
using Lorex.Api.Features.Mcp;
using Lorex.Api.Features.Media;
using Lorex.Api.Features.Profile;
using Lorex.Api.Features.Progression;
using Lorex.Api.Features.Publishing;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.Restore;
using Lorex.Api.Features.RuleValidation;
using Lorex.Api.Features.Search;
using Lorex.Api.Features.Seo;
using Lorex.Api.Features.Storage;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Suggestions;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Trash;
using Lorex.Api.Features.Universes;
using Lorex.Api.Features.WorldRules;
using Lorex.Api.Hosting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddHealthChecks();

builder.Services.AddLorexForwardedHeaders(builder.Configuration);
builder.Services.AddLorexDataProtection(builder.Configuration, builder.Environment);
builder.Services.AddLorexDatabase(builder.Configuration, builder.Environment);
builder.Services.AddLorexAuth(builder.Environment);
builder.Services.AddLorexAdmin();
builder.Services.AddCanonIntegrity();
builder.Services.AddLoreSearch();
builder.Services.AddHostedService<Lorex.Api.Features.Publishing.PublicAuthorBackfill>();
builder.Services.AddLorexMedia(builder.Configuration);
builder.Services.AddHostedService<Lorex.Api.Features.AiChanges.AiChangeMediaSweep>();
builder.Services.AddBackupRestore();
builder.Services.AddLorexSeo(builder.Configuration);
builder.Services.AddLorexAssistant(builder.Configuration);
builder.Services.AddLorexMcp(builder.Configuration, builder.Environment);

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
app.UseLorexForwardedHeaders();
app.UseLorexRobotsHeaders();

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
app.UseLorexFrontend();

app.UseAuthentication();
app.UseAuthorization();

// After authorization and before the endpoint reads its body: each assistant question counts against its account.
app.UseAssistantAllowance();

// After authorization: the MCP endpoint's own gate (bearer tokens only, checked against the live connection), and the
// rate limit on open client registration.
app.UseLorexMcp();

app.MapHealthEndpoints();
app.MapAuthEndpoints();
app.MapAdminEndpoints();
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
app.MapUniverseSearchEndpoints();
app.MapAssistantEndpoints();
app.MapOAuthEndpoints();
app.MapClientRegistrationEndpoints();
app.MapConnectedAppEndpoints();
app.MapLorexMcpEndpoints();
app.MapUniverseExportEndpoints();
app.MapBackupRestoreEndpoints();
app.MapSeoEndpoints();

// Last: the client-side routing fallback only answers what no route above claimed.
app.MapLorexFrontendFallback();

app.Run();

/// <summary>Exposed so integration tests can boot the real host through WebApplicationFactory.</summary>
public partial class Program;
