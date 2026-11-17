using LorEvolve.Api.Features.TypeTemplates;
using LorEvolve.Api.Features.CinemaSagas;
using LorEvolve.Api.Features.AiChanges;
using LorEvolve.Api.Features.Auth;
using LorEvolve.Api.Features.CanonIntegrity;
using LorEvolve.Api.Features.Comments;
using LorEvolve.Api.Features.Chronology;
using LorEvolve.Api.Features.Ideas;
using LorEvolve.Api.Features.Knowledge;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Maps;
using LorEvolve.Api.Features.Mcp;
using LorEvolve.Api.Features.ProjectEntities;
using LorEvolve.Api.Features.Projects;
using LorEvolve.Api.Features.Profile;
using LorEvolve.Api.Features.Progression;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Relationships;
using LorEvolve.Api.Features.RuleValidation;
using LorEvolve.Api.Features.Storage;
using LorEvolve.Api.Features.Stories;
using LorEvolve.Api.Features.Suggestions;
using LorEvolve.Api.Features.Systems;
using LorEvolve.Api.Features.Timeline;
using LorEvolve.Api.Features.Universes;
using LorEvolve.Api.Features.WorldRules;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace LorEvolve.Api.Data;

/// <summary>
/// Single application DbContext for the LorEvolve modular monolith. Also hosts the
/// ASP.NET Core Identity schema. Feature modules add their own entity configurations via
/// <see cref="ModelBuilder.ApplyConfigurationsFromAssembly(System.Reflection.Assembly, System.Func{System.Type, bool})"/>.
/// </summary>
public class LorEvolveDbContext(DbContextOptions<LorEvolveDbContext> options)
    : IdentityDbContext<LorEvolveUser>(options)
{
    public DbSet<Universe> Universes => Set<Universe>();

    public DbSet<UniverseMembership> UniverseMemberships => Set<UniverseMembership>();

    public DbSet<UniverseInvitation> UniverseInvitations => Set<UniverseInvitation>();

    public DbSet<UniverseArtwork> UniverseArtworks => Set<UniverseArtwork>();

    public DbSet<EntityType> EntityTypes => Set<EntityType>();

    public DbSet<EntityTypeGroup> EntityTypeGroups => Set<EntityTypeGroup>();

    public DbSet<EntityTypeGroupMember> EntityTypeGroupMembers => Set<EntityTypeGroupMember>();

    public DbSet<EntityFieldDefinition> EntityFieldDefinitions => Set<EntityFieldDefinition>();

    public DbSet<EntityFieldSection> EntityFieldSections => Set<EntityFieldSection>();

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

    public DbSet<EntityAppearance> EntityAppearances => Set<EntityAppearance>();

    public DbSet<EntityAppearanceEra> EntityAppearanceEras => Set<EntityAppearanceEra>();

    public DbSet<EntityAppearanceForm> EntityAppearanceForms => Set<EntityAppearanceForm>();

    public DbSet<EntityAppearanceScene> EntityAppearanceScenes => Set<EntityAppearanceScene>();

    public DbSet<EntityAppearanceImage> EntityAppearanceImages => Set<EntityAppearanceImage>();

    public DbSet<EntityFieldImage> EntityFieldImages => Set<EntityFieldImage>();

    /// <summary>
    /// Object keys of field pictures this request's saves stopped naming (Issue #238), for the route to sweep once its commit is
    /// done (<see cref="EntityFieldImageEndpoints.SweepDroppedAsync"/>). Not mapped: a list in memory, scoped like the context.
    /// </summary>
    internal List<string> DroppedFieldImageKeys { get; } = [];

    public DbSet<UniverseMap> UniverseMaps => Set<UniverseMap>();

    public DbSet<MapPin> MapPins => Set<MapPin>();

    public DbSet<MapCalibration> MapCalibrations => Set<MapCalibration>();

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

    public DbSet<CreativeProject> CreativeProjects => Set<CreativeProject>();

    /// <summary>The seasons of a Series project, and the episodes in them (#145).</summary>
    public DbSet<ProjectSeason> ProjectSeasons => Set<ProjectSeason>();

    public DbSet<CinemaSaga> CinemaSagas => Set<CinemaSaga>();

    public DbSet<CinemaPhase> CinemaPhases => Set<CinemaPhase>();

    public DbSet<CinemaPhaseMembership> CinemaPhaseMemberships => Set<CinemaPhaseMembership>();

    public DbSet<ProjectEpisode> ProjectEpisodes => Set<ProjectEpisode>();

    /// <summary>The pages of a comic's chapter, and the panels on them (#147).</summary>
    public DbSet<ProjectPage> ProjectPages => Set<ProjectPage>();

    public DbSet<ProjectPanel> ProjectPanels => Set<ProjectPanel>();

    /// <summary>A universe's reusable type templates, their fields and those fields' choices (#281).</summary>
    public DbSet<TypeTemplate> TypeTemplates => Set<TypeTemplate>();

    public DbSet<TypeTemplateField> TypeTemplateFields => Set<TypeTemplateField>();

    public DbSet<TypeTemplateFieldOption> TypeTemplateFieldOptions => Set<TypeTemplateFieldOption>();

    /// <summary>The rule-shaped structure of a project with a format (#290): acts, sequences, scenes, beats.</summary>
    public DbSet<ProjectNode> ProjectNodes => Set<ProjectNode>();

    public DbSet<Story> Stories => Set<Story>();

    public DbSet<Chapter> Chapters => Set<Chapter>();

    public DbSet<Scene> Scenes => Set<Scene>();

    public DbSet<SceneEntityLink> SceneEntityLinks => Set<SceneEntityLink>();

    public DbSet<SceneManuscript> SceneManuscripts => Set<SceneManuscript>();

    public DbSet<SceneManuscriptRevision> SceneManuscriptRevisions => Set<SceneManuscriptRevision>();

    public DbSet<PlotArc> PlotArcs => Set<PlotArc>();

    public DbSet<ChapterArc> ChapterArcs => Set<ChapterArc>();

    public DbSet<SceneBeat> SceneBeats => Set<SceneBeat>();

    public DbSet<Idea> Ideas => Set<Idea>();

    public DbSet<IdeaEntityReference> IdeaEntityReferences => Set<IdeaEntityReference>();

    public DbSet<IdeaStoryReference> IdeaStoryReferences => Set<IdeaStoryReference>();

    public DbSet<IdeaSceneReference> IdeaSceneReferences => Set<IdeaSceneReference>();

    public DbSet<IdeaPlotArcReference> IdeaPlotArcReferences => Set<IdeaPlotArcReference>();

    public DbSet<IdeaBoard> IdeaBoards => Set<IdeaBoard>();

    public DbSet<IdeaBoardCard> IdeaBoardCards => Set<IdeaBoardCard>();

    public DbSet<IdeaBoardConnection> IdeaBoardConnections => Set<IdeaBoardConnection>();

    public DbSet<WorldRule> WorldRules => Set<WorldRule>();

    /// <summary>World Logic: named sets of reusable rule definitions, and their saved states (ADR 0072).</summary>
    public DbSet<LoreSystem> LoreSystems => Set<LoreSystem>();

    public DbSet<LoreSystemRevision> LoreSystemRevisions => Set<LoreSystemRevision>();

    /// <summary>Reusable rule definitions: words, and optionally one typed condition tree (ADR 0072).</summary>
    public DbSet<SystemRule> SystemRules => Set<SystemRule>();

    public DbSet<SystemRuleRevision> SystemRuleRevisions => Set<SystemRuleRevision>();

    /// <summary>Which rule definitions a System references, and in what order inside it.</summary>
    public DbSet<LoreSystemRule> LoreSystemRules => Set<LoreSystemRule>();

    /// <summary>Which rule definitions one rule's condition may reference.</summary>
    public DbSet<SystemRuleDependency> SystemRuleDependencies => Set<SystemRuleDependency>();

    /// <summary>
    /// What evaluating the rule definitions found, with the evidence each outcome depended on and the history of
    /// what the author did about it (ADR 0072, LOREX-020). Derived from the lore, apart from the dismissals.
    /// </summary>
    public DbSet<WorldLogicFinding> WorldLogicFindings => Set<WorldLogicFinding>();

    public DbSet<WorldLogicFindingEvidence> WorldLogicFindingEvidence => Set<WorldLogicFindingEvidence>();

    public DbSet<WorldLogicFindingEvent> WorldLogicFindingEvents => Set<WorldLogicFindingEvent>();

    /// <summary>
    /// What connected AI clients claimed about this universe's meaning, waiting for the author to accept or dismiss
    /// (ADR 0072, ADR 0046, LOREX-021). Deliberately a different table from <see cref="WorldLogicFindings"/>: nothing
    /// a model asserts is ever recorded as a proven violation.
    /// </summary>
    public DbSet<SemanticFinding> SemanticFindings => Set<SemanticFinding>();

    public DbSet<SemanticFindingCitation> SemanticFindingCitations => Set<SemanticFindingCitation>();

    public DbSet<EntityPrivateNote> EntityPrivateNotes => Set<EntityPrivateNote>();

    public DbSet<KnowledgeRecord> KnowledgeRecords => Set<KnowledgeRecord>();

    public DbSet<CommentThread> CommentThreads => Set<CommentThread>();

    public DbSet<Comment> Comments => Set<Comment>();

    public DbSet<SuggestedChange> SuggestedChanges => Set<SuggestedChange>();

    public DbSet<ValidationTerm> ValidationTerms => Set<ValidationTerm>();

    public DbSet<WorldRuleValidation> WorldRuleValidations => Set<WorldRuleValidation>();

    public DbSet<TimelineEntryValidation> TimelineEntryValidations => Set<TimelineEntryValidation>();

    public DbSet<McpConnection> McpConnections => Set<McpConnection>();

    public DbSet<AiChangeProposal> AiChangeProposals => Set<AiChangeProposal>();

    public DbSet<AiChangeOperation> AiChangeOperations => Set<AiChangeOperation>();

    /// <summary>Pictures handed over for pending AI media changes, quarantined until approved (ADR 0062).</summary>
    public DbSet<AiChangeMedia> AiChangeMedia => Set<AiChangeMedia>();

    /// <summary>Each universe's friendly MCP address, once made (ADR 0062).</summary>
    public DbSet<LorEvolve.Api.Features.Mcp.McpUniverseAlias> McpUniverseAliases => Set<LorEvolve.Api.Features.Mcp.McpUniverseAlias>();

    /// <summary>Universes whose owner turned AI help off; no row means on.</summary>
    public DbSet<UniverseAiHelpOff> UniverseAiHelpOff => Set<UniverseAiHelpOff>();

    /// <summary>Bug reports and feature requests, read by an Admin.</summary>
    public DbSet<Features.Feedback.FeedbackReport> FeedbackReports => Set<Features.Feedback.FeedbackReport>();

    public DbSet<Features.Admin.AdminAuditRecord> AdminAuditRecords => Set<Features.Admin.AdminAuditRecord>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        builder.ApplyConfigurationsFromAssembly(typeof(LorEvolveDbContext).Assembly);

        // OpenIddict's applications, authorizations, scopes and tokens (ADR 0046), on the one context.
        builder.UseOpenIddict();
    }
}
