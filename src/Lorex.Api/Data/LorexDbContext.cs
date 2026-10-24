using Lorex.Api.Features.AiChanges;
using Lorex.Api.Features.Auth;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Comments;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Ideas;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Mcp;
using Lorex.Api.Features.Profile;
using Lorex.Api.Features.Progression;
using Lorex.Api.Features.Publishing;
using Lorex.Api.Features.Relationships;
using Lorex.Api.Features.RuleValidation;
using Lorex.Api.Features.Storage;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Suggestions;
using Lorex.Api.Features.Timeline;
using Lorex.Api.Features.Universes;
using Lorex.Api.Features.WorldRules;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Data;

/// <summary>
/// Single application DbContext for the Lorex modular monolith. Also hosts the
/// ASP.NET Core Identity schema. Feature modules add their own entity configurations via
/// <see cref="ModelBuilder.ApplyConfigurationsFromAssembly(System.Reflection.Assembly, System.Func{System.Type, bool})"/>.
/// </summary>
public class LorexDbContext(DbContextOptions<LorexDbContext> options)
    : IdentityDbContext<LorexUser>(options)
{
    public DbSet<Universe> Universes => Set<Universe>();

    public DbSet<UniverseMembership> UniverseMemberships => Set<UniverseMembership>();

    public DbSet<UniverseInvitation> UniverseInvitations => Set<UniverseInvitation>();

    public DbSet<UniverseArtwork> UniverseArtworks => Set<UniverseArtwork>();

    public DbSet<EntityType> EntityTypes => Set<EntityType>();

    public DbSet<EntityTypeGroup> EntityTypeGroups => Set<EntityTypeGroup>();

    public DbSet<EntityTypeGroupMember> EntityTypeGroupMembers => Set<EntityTypeGroupMember>();

    public DbSet<EntityFieldDefinition> EntityFieldDefinitions => Set<EntityFieldDefinition>();

    public DbSet<EntityFieldOption> EntityFieldOptions => Set<EntityFieldOption>();

    public DbSet<LoreEntity> Entities => Set<LoreEntity>();

    public DbSet<EntityAlias> EntityAliases => Set<EntityAlias>();

    public DbSet<EntityFieldValue> EntityFieldValues => Set<EntityFieldValue>();

    public DbSet<Tag> Tags => Set<Tag>();

    public DbSet<EntityTag> EntityTags => Set<EntityTag>();

    public DbSet<EntityImage> EntityImages => Set<EntityImage>();

    public DbSet<EntityArticle> EntityArticles => Set<EntityArticle>();

    public DbSet<EntityArticleRevision> EntityArticleRevisions => Set<EntityArticleRevision>();

    public DbSet<EntityRevision> EntityRevisions => Set<EntityRevision>();

    public DbSet<EntityRevisionAlias> EntityRevisionAliases => Set<EntityRevisionAlias>();

    public DbSet<EntityRevisionTag> EntityRevisionTags => Set<EntityRevisionTag>();

    public DbSet<EntityRevisionFieldValue> EntityRevisionFieldValues =>
        Set<EntityRevisionFieldValue>();

    public DbSet<EntityProgression> EntityProgressions => Set<EntityProgression>();

    public DbSet<EntityEra> EntityEras => Set<EntityEra>();

    public DbSet<EntityEraStory> EntityEraStories => Set<EntityEraStory>();

    public DbSet<EntityEraScene> EntityEraScenes => Set<EntityEraScene>();

    public DbSet<EntityEraFieldValue> EntityEraFieldValues => Set<EntityEraFieldValue>();

    public DbSet<EntityProgressionRevision> EntityProgressionRevisions => Set<EntityProgressionRevision>();

    public DbSet<EntityForm> EntityForms => Set<EntityForm>();

    public DbSet<EntityFormEra> EntityFormEras => Set<EntityFormEra>();

    public DbSet<EntityFormScene> EntityFormScenes => Set<EntityFormScene>();

    public DbSet<EntityAbility> EntityAbilities => Set<EntityAbility>();

    public DbSet<EntityAbilityEra> EntityAbilityEras => Set<EntityAbilityEra>();

    public DbSet<EntityAbilityScene> EntityAbilityScenes => Set<EntityAbilityScene>();

    public DbSet<EntityAbilityForm> EntityAbilityForms => Set<EntityAbilityForm>();

    public DbSet<RelationshipType> RelationshipTypes => Set<RelationshipType>();

    public DbSet<LoreRelationship> Relationships => Set<LoreRelationship>();

    public DbSet<RelationshipPeriod> RelationshipPeriods => Set<RelationshipPeriod>();

    public DbSet<TimelineEntry> TimelineEntries => Set<TimelineEntry>();

    public DbSet<TimelineEntryLink> TimelineEntryLinks => Set<TimelineEntryLink>();

    public DbSet<TimelineEntryStory> TimelineEntryStories => Set<TimelineEntryStory>();

    public DbSet<CanonConflict> CanonConflicts => Set<CanonConflict>();

    public DbSet<CanonConflictSubject> CanonConflictSubjects => Set<CanonConflictSubject>();

    public DbSet<ProfileImage> ProfileImages => Set<ProfileImage>();

    public DbSet<StorageReservation> StorageReservations => Set<StorageReservation>();

    public DbSet<ChronologyEra> ChronologyEras => Set<ChronologyEra>();

    public DbSet<ChronologyCalendar> ChronologyCalendars => Set<ChronologyCalendar>();

    public DbSet<ChronologyCalendarMonth> ChronologyCalendarMonths => Set<ChronologyCalendarMonth>();

    public DbSet<Story> Stories => Set<Story>();

    public DbSet<Chapter> Chapters => Set<Chapter>();

    public DbSet<Scene> Scenes => Set<Scene>();

    public DbSet<SceneEntityLink> SceneEntityLinks => Set<SceneEntityLink>();

    public DbSet<SceneManuscript> SceneManuscripts => Set<SceneManuscript>();

    public DbSet<SceneManuscriptRevision> SceneManuscriptRevisions => Set<SceneManuscriptRevision>();

    public DbSet<PlotArc> PlotArcs => Set<PlotArc>();

    public DbSet<PlotBeat> PlotBeats => Set<PlotBeat>();

    public DbSet<PlotBeatScene> PlotBeatScenes => Set<PlotBeatScene>();

    public DbSet<PlotBeatEntity> PlotBeatEntities => Set<PlotBeatEntity>();

    public DbSet<Idea> Ideas => Set<Idea>();

    public DbSet<IdeaEntityReference> IdeaEntityReferences => Set<IdeaEntityReference>();

    public DbSet<IdeaStoryReference> IdeaStoryReferences => Set<IdeaStoryReference>();

    public DbSet<IdeaSceneReference> IdeaSceneReferences => Set<IdeaSceneReference>();

    public DbSet<IdeaPlotArcReference> IdeaPlotArcReferences => Set<IdeaPlotArcReference>();

    public DbSet<IdeaPlotBeatReference> IdeaPlotBeatReferences => Set<IdeaPlotBeatReference>();

    public DbSet<WorldRule> WorldRules => Set<WorldRule>();

    public DbSet<CommentThread> CommentThreads => Set<CommentThread>();

    public DbSet<Comment> Comments => Set<Comment>();

    public DbSet<SuggestedChange> SuggestedChanges => Set<SuggestedChange>();

    public DbSet<ValidationTerm> ValidationTerms => Set<ValidationTerm>();

    public DbSet<WorldRuleValidation> WorldRuleValidations => Set<WorldRuleValidation>();

    public DbSet<TimelineEntryValidation> TimelineEntryValidations => Set<TimelineEntryValidation>();

    public DbSet<McpConnection> McpConnections => Set<McpConnection>();

    public DbSet<AiChangeProposal> AiChangeProposals => Set<AiChangeProposal>();

    public DbSet<AiChangeOperation> AiChangeOperations => Set<AiChangeOperation>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(LorexDbContext).Assembly);

        // OpenIddict's applications, authorizations, scopes and tokens (ADR 0046), on the one context.
        builder.UseOpenIddict();
    }
}
