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
    [property: Description("create, update or remove. remove moves the item to LoreX's Trash, from where it can be restored; nothing is deleted for good.")]
    string? Action,
    [property: Description("lore_entry, relationship, story, chapter, scene, manuscript or timeline_event. relationship and timeline_event cannot be removed.")]
    string? Resource,
    [property: Description("For update and remove: the existing item's id, exactly as a read tool gave it. For a manuscript, the scene's id goes in manuscript.scene instead.")]
    Guid? TargetId = null,
    [property: Description("Optional for update and remove: the version you read. LoreX refuses the change if the item has been saved since.")]
    int? ExpectedVersion = null,
    AiLoreInput? Lore = null,
    AiRelationshipInput? Relationship = null,
    AiStoryInput? Story = null,
    AiChapterInput? Chapter = null,
    AiSceneInput? Scene = null,
    AiManuscriptInput? Manuscript = null,
    AiTimelineInput? Timeline = null);

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
    [property: Description("On update, \"\" clears them.")] string? Notes = null);

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
    [property: Description("The whole set of lore entries taking part. On update, leave it out to keep them.")] IReadOnlyList<AiRefInput>? Participants = null);

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
    List<AiRef> Participants);

/// <summary>What a removal needs besides its target: the story a chapter or scene lives in.</summary>
public sealed record RemoveValues(Guid? StoryId);

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
