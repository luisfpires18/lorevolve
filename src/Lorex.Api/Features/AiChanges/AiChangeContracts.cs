using System.ComponentModel;
using Lorex.Api.Features.Chronology;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Stories;
using Lorex.Api.Features.Timeline;

namespace Lorex.Api.Features.AiChanges;

// ---------- What an AI sends ----------
//
// One contract for both entry points (ADR 0047): MCP's propose_changes binds it from the tool call, and the assistant's
// propose_changes parses the model's arguments into it. Everything here is untrusted: names and enums arrive as strings
// and are checked, ids are re-resolved inside the connected universe, and nothing the AI says about who is asking or
// which universe it is counts. Descriptions are written for the AI reading the tool's schema.

/// <summary>A bounded set of changes for a person to review in LoreX. Nothing is applied until someone approves it there.</summary>
public sealed record AiChangeSubmission(
    [property: Description("One short line saying what these changes do, written for the person who will review them.")]
    string? Summary,
    [property: Description("The changes, in order. At most 100. Give each an id so later changes can refer to what it creates.")]
    IReadOnlyList<AiChangeOperationInput>? Operations);

/// <summary>One change. Exactly one of the resource members is set, matching <see cref="Resource"/>.</summary>
public sealed record AiChangeOperationInput(
    [property: Description("Your own short id for this change, unique in this proposal, such as \"arin\" or \"rel-1\". Other changes refer to what it creates with {\"ref\": id}.")]
    string? Id,
    [property: Description("create, update, remove or reorder. remove moves the item to LoreX's Trash (an idea to the owner's deleted ideas), from where it can be restored; nothing is deleted for good. reorder sets the whole order of a story's chapters or plot arcs, a chapter's scenes or an arc's beats.")]
    string? Action,
    [property: Description("lore_entry, article, relationship, story, chapter, scene, manuscript, plot_arc, plot_beat, timeline_event, world_rule or idea.")]
    string? Resource,
    [property: Description("For update and remove: the existing item's id, exactly as a read tool gave it. For a manuscript or an article, the scene or entry goes in manuscript.scene or article.entry instead; for reorder, the container goes in order.")]
    Guid? TargetId = null,
    [property: Description("Optional for update and remove: the version you read. LoreX refuses the change if the item has been saved since.")]
    int? ExpectedVersion = null,
    AiLoreInput? Lore = null,
    AiRelationshipInput? Relationship = null,
    AiStoryInput? Story = null,
    AiChapterInput? Chapter = null,
    AiSceneInput? Scene = null,
    AiManuscriptInput? Manuscript = null,
    AiTimelineInput? Timeline = null,
    AiArticleInput? Article = null,
    AiPlotArcInput? PlotArc = null,
    AiPlotBeatInput? PlotBeat = null,
    AiWorldRuleInput? WorldRule = null,
    AiIdeaInput? Idea = null,
    AiOrderInput? Order = null);

/// <summary>Something that exists, by its id, or something this proposal creates, by the change's id.</summary>
public sealed record AiRefInput(
    [property: Description("An existing item's id.")] Guid? Id = null,
    [property: Description("The id of a create change in this proposal.")] string? Ref = null);

[Description("A lore entry. For create: typeId and name are required. For update: only what you set changes; leave the rest out.")]
public sealed record AiLoreInput(
    [property: Description("The lore type's id, from get_change_options. Create only: an update cannot change an entry's type.")] Guid? TypeId = null,
    string? Name = null,
    [property: Description("A short summary. On update, \"\" clears it.")] string? Summary = null,
    [property: Description("idea, draft or canon. A new entry is idea unless you say otherwise.")] string? CanonStatus = null,
    [property: Description("The whole list of aliases. On update, leave it out to keep them.")] IReadOnlyList<string>? Aliases = null,
    [property: Description("The whole list of tags. On update, leave it out to keep them.")] IReadOnlyList<string>? Tags = null,
    [property: Description("Custom field values, by field id from get_change_options. On update, only the fields listed change.")] IReadOnlyList<AiFieldInput>? Fields = null);

[Description("One custom field's value. Set the member matching the field's kind.")]
public sealed record AiFieldInput(
    Guid? FieldId = null,
    [property: Description("For short and long text fields.")] string? Text = null,
    [property: Description("For number fields.")] double? Number = null,
    [property: Description("For yes/no fields.")] bool? Boolean = null,
    [property: Description("For date fields: a calendar date, such as 2026-01-31.")] DateTime? Date = null,
    [property: Description("For choice fields: option ids from get_change_options.")] IReadOnlyList<Guid>? OptionIds = null,
    [property: Description("For link fields: the entry it links to.")] AiRefInput? Entry = null,
    [property: Description("For a number that is a year: the date period it is counted in, from get_change_options.")] Guid? EraId = null,
    [property: Description("On update, true empties this field.")] bool? Clear = null);

[Description("A relationship between two lore entries, read as \"source <type name> target\".")]
public sealed record AiRelationshipInput(
    [property: Description("The relationship type's id, from get_change_options.")] Guid? TypeId = null,
    AiRefInput? Source = null,
    AiRefInput? Target = null,
    [property: Description("idea, draft or canon.")] string? CanonStatus = null,
    [property: Description("On update, \"\" clears them.")] string? Notes = null,
    [property: Description("When the relationship began: a calendar date such as 1200-01-31. On update, leave it out to keep it.")] DateTime? StartDate = null,
    [property: Description("When it ended, never before it began.")] DateTime? EndDate = null,
    [property: Description("On update, true clears the start date.")] bool? ClearStartDate = null,
    [property: Description("On update, true clears the end date.")] bool? ClearEndDate = null);

public sealed record AiStoryInput(
    string? Title = null,
    [property: Description("On update, \"\" clears it.")] string? Premise = null,
    [property: Description("planning, drafting or complete.")] string? Status = null);

public sealed record AiChapterInput(
    [property: Description("Create only: the story it belongs to.")] AiRefInput? Story = null,
    string? Title = null,
    string? Summary = null,
    string? Notes = null);

public sealed record AiSceneInput(
    [property: Description("Create only: the story it belongs to.")] AiRefInput? Story = null,
    [property: Description("The chapter it is told in, of the same story. Left out on create: unchaptered. On update: unchanged.")] AiRefInput? Chapter = null,
    string? Title = null,
    string? Summary = null,
    string? Notes = null,
    [property: Description("The lore entry the scene is told from.")] AiRefInput? PointOfView = null,
    [property: Description("The whole set of lore entries in the scene. On update, leave it out to keep them.")] IReadOnlyList<AiRefInput>? Lore = null,
    [property: Description("Where the scene happens in the world. On update, leave it out to keep it.")] AiPointInput? Date = null);

public sealed record AiPointInput(Guid? EraId = null, int? Year = null, int? Month = null, int? Day = null, Guid? MonthId = null);

[Description("A scene's prose. The scene goes in scene: an existing scene's id, or a scene this proposal creates.")]
public sealed record AiManuscriptInput(
    AiRefInput? Scene = null,
    [property: Description("append adds the text after the prose already there. replace swaps the whole prose and needs the expectedVersion of the manuscript you read.")]
    string? Mode = null,
    [property: Description("Plain text, up to 100,000 characters.")] string? Text = null);

[Description("A timeline moment. For update: only what you set changes.")]
public sealed record AiTimelineInput(
    string? Title = null,
    [property: Description("On update, \"\" clears it.")] string? Description = null,
    [property: Description("idea, draft or canon.")] string? CanonStatus = null,
    [property: Description("When it happened. On update, leave it out to keep it.")] AiTimelineDateInput? Date = null,
    [property: Description("The whole set of lore entries taking part. On update, leave it out to keep them.")] IReadOnlyList<AiRefInput>? Participants = null,
    [property: Description("The whole set of stories this moment matters to. On update, leave it out to keep them; [] unlinks every story.")] IReadOnlyList<AiRefInput>? Stories = null,
    [property: Description("The moment's details for world rule checks: an event kind and a method from get_change_options, and the entry they happened to. On update, leave it out to keep them.")] AiMomentDetailsInput? Details = null,
    [property: Description("On update, true removes the moment's details.")] bool? ClearDetails = null);

public sealed record AiMomentDetailsInput(
    [property: Description("An event kind's id, from get_change_options.")] Guid? EventKindId = null,
    [property: Description("A method's id, from get_change_options.")] Guid? MethodId = null,
    [property: Description("The entry it happened to.")] AiRefInput? Participant = null);

[Description("An entry's article: its rich-text prose, apart from its structured lore. Written as blocks, never as markup.")]
public sealed record AiArticleInput(
    [property: Description("The entry: an existing entry's id, or an entry this proposal creates.")] AiRefInput? Entry = null,
    [property: Description("append adds the blocks after the article there is. replace swaps the whole article and needs the articleVersion get_lore_entry gave as expectedVersion; [] blocks clears it.")]
    string? Mode = null,
    [property: Description("The blocks, in order.")] IReadOnlyList<AiArticleBlockInput>? Blocks = null);

[Description("One block of an article.")]
public sealed record AiArticleBlockInput(
    [property: Description("paragraph, heading, bullet_list, numbered_list or quote.")] string? Kind = null,
    [property: Description("Plain text, for a paragraph, a heading or a quote.")] string? Text = null,
    [property: Description("For a heading: 2, 3 or 4.")] int? Level = null,
    [property: Description("For a list: each item's plain text.")] IReadOnlyList<string>? Items = null);

[Description("A plot arc: a narrative thread followed through one story.")]
public sealed record AiPlotArcInput(
    [property: Description("Create only: the story it belongs to.")] AiRefInput? Story = null,
    string? Title = null,
    [property: Description("On update, \"\" clears it.")] string? Description = null,
    [property: Description("On update, \"\" clears them.")] string? Notes = null);

[Description("A plot beat: one step inside an arc.")]
public sealed record AiPlotBeatInput(
    [property: Description("The arc it is in. On create, required; on update, another arc of the same story moves the beat there, last.")] AiRefInput? Arc = null,
    string? Title = null,
    [property: Description("On update, \"\" clears it.")] string? Description = null,
    [property: Description("On update, \"\" clears them.")] string? Notes = null,
    [property: Description("The whole set of scenes, of the same story, it plays out in. On update, leave it out to keep them.")] IReadOnlyList<AiRefInput>? Scenes = null,
    [property: Description("The whole set of lore entries it concerns. On update, leave it out to keep them.")] IReadOnlyList<AiRefInput>? Lore = null);

[Description("A world rule: a statement of how this universe works, optionally with a check.")]
public sealed record AiWorldRuleInput(
    string? Title = null,
    [property: Description("Plain text. On update, \"\" clears it.")] string? Description = null,
    [property: Description("The rule's check: at most maxOccurrences Canon moments of one event kind by one method for each participant. On update, leave it out to keep the stored check.")] AiRuleCheckInput? Check = null,
    [property: Description("On update, true removes the rule's check.")] bool? RemoveCheck = null);

public sealed record AiRuleCheckInput(
    [property: Description("An event kind's id, from get_change_options.")] Guid? EventKindId = null,
    [property: Description("A method's id, from get_change_options.")] Guid? MethodId = null,
    int? MaxOccurrences = null);

[Description("One of the universe owner's own ideas in this universe: a possibility, kept apart from the lore. Only the owner can propose ideas.")]
public sealed record AiIdeaInput(
    string? Title = null,
    [property: Description("Plain text. On update, \"\" clears it.")] string? Body = null,
    [property: Description("The whole set of what it refers to. On update, leave it out to keep them.")] IReadOnlyList<AiIdeaReferenceInput>? References = null);

public sealed record AiIdeaReferenceInput(
    [property: Description("lore_entry, story, scene, plot_arc or plot_beat.")] string? Kind = null,
    [property: Description("An existing item's id.")] Guid? Id = null,
    [property: Description("The id of a create change in this proposal.")] string? Ref = null);

[Description("A whole order: every item of the container, each once, first first. Items this proposal creates there are listed by ref.")]
public sealed record AiOrderInput(
    [property: Description("The story whose chapters, arcs or scenes these are.")] AiRefInput? Story = null,
    [property: Description("For scenes: the chapter they are told in. Leave it out, with unchaptered true, for the story's unchaptered scenes.")] AiRefInput? Chapter = null,
    [property: Description("For scenes: true for the story's unchaptered scenes.")] bool? Unchaptered = null,
    [property: Description("For beats: the arc they are in.")] AiRefInput? Arc = null,
    IReadOnlyList<AiRefInput>? Items = null);

public sealed record AiTimelineDateInput(
    [property: Description("exact, approximate, range or unknown.")] string? Kind = null,
    int? StartYear = null,
    int? StartMonth = null,
    int? StartDay = null,
    int? EndYear = null,
    int? EndMonth = null,
    int? EndDay = null,
    [property: Description("On a universe that names date periods: the period each year is counted in.")] Guid? StartEraId = null,
    Guid? EndEraId = null,
    Guid? StartMonthId = null,
    Guid? EndMonthId = null,
    [property: Description("Only on a universe that names no date periods: a free label such as \"Age of Ash\".")] string? EraLabel = null);

// ---------- What is stored ----------
//
// The normalised values of one operation, as this feature's own records (never an API response type, never the AI's
// text as it arrived). A create holds what it creates; an update holds the whole form as it would be stored, so applying
// it is the resource's ordinary save over the version it was staged against; a removal holds only where the item lives.
//
// A moment's <c>Stories</c> and <c>Details</c> arrived with issue 45 (ADR 0048): a moment change stored before then has
// neither, and is applied - and compared - without them, so it keeps what is stored.

/// <summary>A stored reference: an existing id, or the key of a create in the same proposal.</summary>
public sealed record AiRef(Guid? Id, string? Key)
{
    public static AiRef To(Guid id) => new(id, null);
}

public sealed record LoreValues(
    Guid TypeId,
    string Name,
    string? Summary,
    CanonStatus CanonStatus,
    List<string> Aliases,
    List<string> Tags,
    List<LoreFieldValue> Fields);

public sealed record LoreFieldValue(
    Guid FieldId,
    string? Text,
    double? Number,
    bool? Boolean,
    DateTime? Date,
    List<Guid> OptionIds,
    AiRef? Entry,
    Guid? EraId);

public sealed record RelationshipValues(
    Guid TypeId,
    AiRef Source,
    AiRef Target,
    CanonStatus CanonStatus,
    DateTime? StartDate,
    DateTime? EndDate,
    string? Notes);

public sealed record StoryValues(string Title, string? Premise, StoryStatus Status);

public sealed record ChapterValues(AiRef Story, string Title, string? Summary, string? Notes);

public sealed record SceneValues(
    AiRef Story,
    AiRef? Chapter,
    string Title,
    string? Summary,
    string? Notes,
    AiRef? PointOfView,
    ChronologyValue? Date,
    List<AiRef> Lore);

public sealed record ManuscriptValues(AiRef Scene, Guid? StoryId, bool Append, string Text);

public sealed record TimelineValues(
    string Title,
    string? Description,
    CanonStatus CanonStatus,
    TimelineDateKind DateKind,
    int? StartYear,
    int? StartMonth,
    int? StartDay,
    int? EndYear,
    int? EndMonth,
    int? EndDay,
    string? EraLabel,
    Guid? StartEraId,
    Guid? EndEraId,
    Guid? StartMonthId,
    Guid? EndMonthId,
    List<AiRef> Participants,
    List<AiRef>? Stories = null,
    MomentDetailsValues? Details = null);

/// <summary>What a removal needs besides its target: the story a chapter, scene, arc or beat lives in.</summary>
public sealed record RemoveValues(Guid? StoryId);

/// <summary>A moment's details for world rule checks, as the moment would hold them.</summary>
public sealed record MomentDetailsValues(Guid? EventKindId, Guid? MethodId, AiRef? Participant);

/// <summary>
/// An article change: the entry, whether its blocks are added after the article or replace it, and the blocks. The Tiptap
/// document is built from them by <c>AiChangeArticles</c> - an AI never sends markup, ids or links.
/// </summary>
public sealed record ArticleValues(AiRef Entry, bool Append, List<ArticleBlock> Blocks);

public sealed record ArticleBlock(string Kind, string? Text, int? Level, List<string>? Items);

public sealed record PlotArcValues(AiRef Story, string Title, string? Description, string? Notes);

/// <summary>
/// A beat. <paramref name="Story"/> is the story of its arc when the arc exists, so its scenes are checked against it; null
/// when the arc is one this proposal creates, whose own story stands for it.
/// </summary>
public sealed record PlotBeatValues(
    AiRef Arc,
    AiRef? Story,
    string Title,
    string? Description,
    string? Notes,
    List<AiRef> Scenes,
    List<AiRef> Lore);

public sealed record RuleCheckValues(Guid EventKindId, Guid MethodId, int MaxOccurrences);

public sealed record WorldRuleValues(string Title, string Description, RuleCheckValues? Check);

public sealed record IdeaReferenceValue(Ideas.IdeaReferenceKind Kind, AiRef Target);

/// <summary>An idea of the universe owner's, always in this universe: its universe is never an AI's to change.</summary>
public sealed record IdeaValues(string Title, string Body, List<IdeaReferenceValue> References);

/// <summary>
/// A container's whole order. <paramref name="Story"/> for chapters, arcs and scenes; <paramref name="Chapter"/> for scenes
/// told in a chapter (null with <paramref name="Story"/> for the unchaptered ones); <paramref name="Arc"/> for beats, with
/// <paramref name="Story"/> its story. Stored over the order as it was (its <c>Before</c>, the same record with existing ids).
/// </summary>
public sealed record OrderValues(AiRef Story, AiRef? Chapter, AiRef? Arc, List<AiRef> Items);

// ---------- What the review reads ----------

/// <summary>One problem with a change, in a creator's words. <paramref name="Code"/> is stable; the message is LoreX's.</summary>
public sealed record AiChangeIssue(string Code, string Message, string? Field = null);

/// <summary>One line of a change as the review shows it: a label, what is stored now, what the change would store.</summary>
public sealed record AiChangeLine(string Label, string? Before, string? After);

/// <summary>What else a removal touches, counted live: it all stays stored and comes back with a restore.</summary>
public sealed record AiChangeImpact(IReadOnlyList<string> Notes);

/// <summary>
/// One operation as the review reads it. <paramref name="Title"/> and <paramref name="Lines"/> are written by LoreX from
/// the stored values, names resolved live; every string that came from the AI is plain text. <paramref name="Issues"/>
/// are checked again on every read; a pending change with any cannot be approved until they are gone.
/// <paramref name="Editable"/> holds the values a reviewer may change before approving, or null.
/// </summary>
public sealed record AiChangeOperationResponse(
    Guid Id,
    string Key,
    int Sequence,
    AiChangeResource Resource,
    AiChangeAction Action,
    AiChangeOperationStatus Status,
    string Title,
    Guid? TargetId,
    Guid? StoryId,
    IReadOnlyList<AiChangeLine> Lines,
    IReadOnlyList<string> DependsOn,
    IReadOnlyList<string> NeededBy,
    IReadOnlyList<AiChangeIssue> Issues,
    bool IsConflict,
    AiChangeImpact? Impact,
    AiChangeEditable? Editable,
    AiChangeProse? Prose,
    Guid? ResultId,
    string? ResolvedByName,
    DateTime? ResolvedAt,
    string? ResolutionNote);

/// <summary>A manuscript change's prose: what is stored now (only while the change applies to it) and what it would store.</summary>
public sealed record AiChangeProse(bool Append, string? Current, string Proposed);

/// <summary>The values a reviewer may edit before approving, as they stand. Null members do not apply to the change.</summary>
public sealed record AiChangeEditable(
    string? Name = null,
    string? Title = null,
    string? Summary = null,
    string? Premise = null,
    string? Notes = null,
    string? Description = null,
    string? Text = null,
    CanonStatus? CanonStatus = null);

/// <summary>A reviewer's edit of one pending change, over the proposal revision they were shown. Only these values change.</summary>
public sealed record AiChangeEditRequest(int? Revision, AiChangeEditable? Values);

public sealed record AiChangeProposalSummary(
    Guid Id,
    Guid UniverseId,
    string UniverseName,
    AiChangeSource Source,
    string? ClientName,
    string? ProposedByName,
    bool ProposedByMe,
    string? Summary,
    AiChangeProposalStatus Status,
    DateTime CreatedAt,
    DateTime ExpiresAt,
    int OperationCount,
    int PendingCount,
    int CommittedCount,
    int CreateCount,
    int UpdateCount,
    int RemoveCount);

/// <summary>
/// One proposal, whole. <paramref name="CanReview"/>: the reader may approve, reject and edit its changes - their own role,
/// now, decides it. <paramref name="Blocked"/> is why nothing in it can be approved at all, or null.
/// </summary>
public sealed record AiChangeProposalResponse(
    AiChangeProposalSummary Proposal,
    int Revision,
    bool CanReview,
    string? Blocked,
    IReadOnlyList<AiChangeOperationResponse> Operations);

public sealed record AiChangePage(IReadOnlyList<AiChangeProposalSummary> Items, bool HasMore);

public sealed record AiChangeCount(int Open);

/// <summary>
/// Approve these pending changes, over the revision they were reviewed at. <paramref name="ApprovalId"/> is the client's
/// own id for this approval: sending the same one again after a lost answer finds what it applied, and applies nothing twice.
/// </summary>
public sealed record AiChangeApproveRequest(int? Revision, IReadOnlyList<Guid>? OperationIds, Guid? ApprovalId);

/// <summary>Reject these pending changes, or every pending change when <paramref name="All"/>.</summary>
public sealed record AiChangeRejectRequest(IReadOnlyList<Guid>? OperationIds, bool All = false);

/// <summary>What one approval applied, in the order it applied it.</summary>
public sealed record AiChangeReceipt(Guid ApprovalId, IReadOnlyList<AiChangeReceiptLine> Applied, AiChangeProposalResponse Proposal);

public sealed record AiChangeReceiptLine(Guid OperationId, string Key, AiChangeResource Resource, AiChangeAction Action, Guid? ResultId);
