namespace Lorex.Api.Features.Assistant;

/// <summary>
/// One question, with the conversation so far as the browser holds it. Nothing is stored: the history is whatever the
/// client sends, cut to the assistant's bounds, and the universe is read afresh for every question.
/// </summary>
public sealed record AssistantRequest(string? Question, IReadOnlyList<AssistantHistoryMessage>? History, string? Mode = null);

/// <summary>A proposal a propose-mode question staged (ADR 0047): reviewed and decided in Pending AI Changes, never applied here.</summary>
public sealed record AssistantProposal(Guid Id, int ChangeCount);

/// <summary>One earlier message: what the person asked, or the text of what the assistant answered.</summary>
public sealed record AssistantHistoryMessage(AssistantRole Role, string? Text);

/// <summary>Whether the assistant can answer here. Reading it calls no model.</summary>
public sealed record AssistantStatus(bool IsAvailable);

/// <summary>What a part of an answer is, so a person can tell what LoreX holds from what the assistant made of it.</summary>
public enum AssistantSegmentKind
{
    /// <summary>Stated in the universe's own content. Always backed by at least one source.</summary>
    Recorded = 0,

    /// <summary>A conclusion drawn from recorded content that LoreX does not state itself.</summary>
    Inference = 1,

    /// <summary>A creative idea of the assistant's, not part of the universe.</summary>
    Suggestion = 2,

    /// <summary>Anything else: that something is not recorded, that a question is outside the universe.</summary>
    Note = 3,
}

/// <summary>What a source is, so the client opens it in its own place.</summary>
public enum AssistantSourceKind
{
    Lore = 0,
    Story = 1,
    Chapter = 2,
    Scene = 3,
    PlotArc = 4,
    PlotBeat = 5,
    TimelineMoment = 6,
}

/// <summary>
/// One piece of the universe an answer rests on. Only ever something a read actually returned during this question:
/// the kind, id and title are Lorex's, never the model's. <paramref name="StoryId"/> is set for what lives in a story.
/// </summary>
public sealed record AssistantSource(AssistantSourceKind Kind, Guid Id, string Title, Guid? StoryId);

/// <summary>One part of an answer, with the ids of the sources it rests on.</summary>
public sealed record AssistantSegment(AssistantSegmentKind Kind, string Text, IReadOnlyList<Guid> SourceIds);

/// <summary>
/// An answer: its parts in order and the sources they cite, each once. <paramref name="IsIncomplete"/> says the assistant
/// reached its reading limit before it finished looking.
/// </summary>
public sealed record AssistantAnswer(
    IReadOnlyList<AssistantSegment> Segments,
    IReadOnlyList<AssistantSource> Sources,
    bool IsIncomplete,
    AssistantProposal? Proposal = null);
