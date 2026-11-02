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


namespace LorEvolve.Api.Hosting;

/// <summary>
/// The whole host - services, pipeline, routes - built once, for the two programs that run it: the API's own
/// <c>Program</c> (the web edition, and the desktop edition under test) and the desktop shell, which runs it in its own
/// process on a loopback port (ADR 0070).
/// </summary>
public static class LorEvolveHost
{
    public static WebApplication Build(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        // The desktop edition (ADR 0070) maps none of the web-only surfaces: portal, publishing, SEO, admin, sign-up
        // and sign-in, collaborators, feedback.
        var desktop = builder.Environment.IsDesktop();

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
        if (!desktop)
        {
            builder.Services.AddHostedService<LorEvolve.Api.Features.Publishing.PublicAuthorBackfill>();
        }

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
        app.UseLorEvolveSameOriginWrites(corsOrigins);

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
        app.MapDatabaseBackupEndpoints();
        app.MapProfileImageEndpoints();
        app.MapAccountStorageEndpoints();
        app.MapUniverseEndpoints();
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
        if (desktop)
        {
            app.MapDesktopLaunch();
        }
        else
        {
            app.MapAdminEndpoints();
            app.MapFeedbackEndpoints();
            app.MapCollaboratorEndpoints();
            app.MapInvitationEndpoints();
            app.MapPublicationEndpoints();
            app.MapContentPublicationEndpoints();
            app.MapPublishEverythingEndpoints();
            app.MapUniverseArtworkEndpoints();
            app.MapPublicNameEndpoints();
            app.MapPublicUniverseEndpoints();
            app.MapPublicAuthorEndpoints();
            app.MapPublicStatsEndpoints();
            app.MapSeoEndpoints();
        }

        // Last: the client-side routing fallback only answers what no route above claimed.
        app.MapLorEvolveFrontendFallback();

        return app;
    }
}
