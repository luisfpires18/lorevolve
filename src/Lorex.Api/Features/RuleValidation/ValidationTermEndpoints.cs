using System.Security.Claims;
using Lorex.Api.Data;
using Lorex.Api.Features.CanonIntegrity;
using Lorex.Api.Features.Lore;
using Lorex.Api.Features.Universes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Lorex.Api.Features.RuleValidation;

/// <summary>
/// A universe's event kinds and methods: the small vocabulary world rule checks and moments point at by id (ADR 0034). Listed,
/// created, renamed and deleted while nothing names them - nothing more. No hierarchy, no description, no workspace of its own.
///
/// Universe-scoped and gated first, through <see cref="UniverseAccess"/> (ADR 0041); a term is only ever found by its id and that universe
/// together, so another account's term, another universe's and a guessed id all answer the same 404.
/// </summary>
public static class ValidationTermEndpoints
{
    /// <summary>The marker on the 409 for deleting a term a rule or a moment still names.</summary>
    public const string InUseCode = "validation_term_in_use";

    public static IEndpointRouteBuilder MapValidationTermEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/universes/{universeId:guid}/validation-terms")
            .WithTags("Rule validation")
            .RequireAuthorization();

        group.MapGet("/", ListAsync).WithName("ListValidationTerms");
        group.MapPost("/", CreateAsync).WithName("CreateValidationTerm");
        group.MapPut("/{termId:guid}", RenameAsync).WithName("RenameValidationTerm");
        group.MapDelete("/{termId:guid}", DeleteAsync).WithName("DeleteValidationTerm");

        return endpoints;
    }

    /// <summary>Every term, event kinds first, then by name case folded, as written, and id. A vocabulary is short, so it is not paged.</summary>
    private static async Task<IResult> ListAsync(
        Guid universeId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.Read, cancellationToken) is { } denied)
        {
            return denied;
        }

        return Results.Ok(await LoadAsync(db, universeId, null, cancellationToken));
    }

    private static async Task<IResult> CreateAsync(
        Guid universeId,
        [FromBody] ValidationTermRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        return await CreateCoreAsync(db, universeId, request, cancellationToken);
    }

    /// <summary>A term's create after the caller's access check: the route's, and an approved AI change's (ADR 0062). Answers 201.</summary>
    internal static async Task<IResult> CreateCoreAsync(
        LorexDbContext db,
        Guid universeId,
        ValidationTermRequest request,
        CancellationToken cancellationToken)
    {
        if (!Enum.IsDefined(request.Kind))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["kind"] = ["Say whether this is an event kind or a method."] });
        }

        if (ValidateName(request.Name, request.Kind) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var name = request.Name!.Trim();
        var normalized = ValidationTerm.Normalize(name);

        if (await db.ValidationTerms.AnyAsync(
            term => term.UniverseId == universeId && term.Kind == request.Kind && term.NormalizedName == normalized,
            cancellationToken))
        {
            return NameTaken(request.Kind, name);
        }

        var now = DateTime.UtcNow;
        var created = new ValidationTerm
        {
            Id = Guid.NewGuid(),
            UniverseId = universeId,
            Kind = request.Kind,
            Name = name,
            NormalizedName = normalized,
            CreatedAt = now,
            UpdatedAt = now,
        };

        db.ValidationTerms.Add(created);

        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
        {
            // The unique index settles two creates racing for one name.
            return NameTaken(request.Kind, name);
        }

        return Results.Created(
            $"/api/universes/{universeId}/validation-terms/{created.Id}",
            (await LoadAsync(db, universeId, created.Id, cancellationToken)).Single());
    }

    /// <summary>
    /// Renames a term. Reconciled but not gated: no match changes - ids decide matches - but a Canon finding quotes the term's
    /// name in the sentence it stores, and the name is not in its fingerprint, so the finding is reworded in place when the
    /// write lands (ADR 0012). Nothing can be refused: the check is Medium.
    /// </summary>
    private static async Task<IResult> RenameAsync(
        Guid universeId,
        Guid termId,
        [FromBody] ValidationTermRenameRequest request,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CanonPromotionGate canon,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var term = await db.ValidationTerms.FirstOrDefaultAsync(
            candidate => candidate.Id == termId && candidate.UniverseId == universeId,
            cancellationToken);
        if (term is null)
        {
            return Results.NotFound();
        }

        return await canon.RecordAsync(
            universeId,
            token => RenameCoreAsync(universeId, term, request, db, token),
            cancellationToken);
    }

    /// <summary>A rename inside the caller's reconciling transaction: an approved AI change's (ADR 0062), under the gate.</summary>
    internal static async Task<IResult> RenameCoreAsync(
        LorexDbContext db,
        Guid universeId,
        Guid termId,
        ValidationTermRenameRequest request,
        CancellationToken cancellationToken) =>
        await db.ValidationTerms.FirstOrDefaultAsync(candidate => candidate.Id == termId && candidate.UniverseId == universeId, cancellationToken) is { } term
            ? await RenameCoreAsync(universeId, term, request, db, cancellationToken)
            : Results.NotFound();

    private static async Task<IResult> RenameCoreAsync(
        Guid universeId,
        ValidationTerm term,
        ValidationTermRenameRequest request,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (ValidateName(request.Name, term.Kind) is { } errors)
        {
            return Results.ValidationProblem(errors);
        }

        var name = request.Name!.Trim();

        if (!string.Equals(term.Name, name, StringComparison.Ordinal))
        {
            var normalized = ValidationTerm.Normalize(name);

            if (await db.ValidationTerms.AnyAsync(
                other => other.UniverseId == universeId && other.Kind == term.Kind && other.NormalizedName == normalized && other.Id != term.Id,
                cancellationToken))
            {
                return NameTaken(term.Kind, name);
            }

            term.Name = name;
            term.NormalizedName = normalized;
            term.UpdatedAt = DateTime.UtcNow;

            try
            {
                await db.SaveChangesAsync(cancellationToken);
            }
            catch (DbUpdateException failure) when (DatabaseFailures.IsUniqueViolation(failure))
            {
                return NameTaken(term.Kind, name);
            }
        }

        return Results.Ok((await LoadAsync(db, universeId, term.Id, cancellationToken)).Single());
    }

    /// <summary>
    /// Deletes a term nothing names. Refused while any rule - one in the Trash included, which keeps its check - or any moment
    /// names it: removing it would leave a check or a moment's details half there. Nothing is reconciled, because a term nothing
    /// names contributes to no finding.
    /// </summary>
    private static async Task<IResult> DeleteAsync(
        Guid universeId,
        Guid termId,
        ClaimsPrincipal principal,
        LorexDbContext db,
        CancellationToken cancellationToken)
    {
        if (await UniverseAccess.DenyAsync(db, universeId, principal, UniverseCapability.EditContent, cancellationToken) is { } denied)
        {
            return denied;
        }

        var term = await db.ValidationTerms.FirstOrDefaultAsync(
            candidate => candidate.Id == termId && candidate.UniverseId == universeId,
            cancellationToken);
        if (term is null)
        {
            return Results.NotFound();
        }

        var rules = await db.WorldRuleValidations.CountAsync(
            validation => validation.EventKindTermId == termId || validation.MethodTermId == termId,
            cancellationToken);
        var moments = await db.TimelineEntryValidations.CountAsync(
            details => details.EventKindTermId == termId || details.MethodTermId == termId,
            cancellationToken);

        if (rules + moments > 0)
        {
            return Results.Problem(
                title: "Still in use",
                detail: $"{Count(rules, "world rule")} and {Count(moments, "moment")} still name “{term.Name}”. Change them first.",
                statusCode: StatusCodes.Status409Conflict,
                extensions: new Dictionary<string, object?>
                {
                    ["code"] = InUseCode,
                    ["ruleCount"] = rules,
                    ["momentCount"] = moments,
                });
        }

        db.ValidationTerms.Remove(term);
        await db.SaveChangesAsync(cancellationToken);

        return Results.NoContent();
    }

    // ---------- Reading and checks ----------

    private static async Task<List<ValidationTermResponse>> LoadAsync(
        LorexDbContext db,
        Guid universeId,
        Guid? termId,
        CancellationToken cancellationToken)
    {
        var query = db.ValidationTerms.AsNoTracking().Where(term => term.UniverseId == universeId);

        if (termId is { } only)
        {
            query = query.Where(term => term.Id == only);
        }

        var rows = await query
            .OrderBy(term => term.Kind)
            .ThenBy(term => term.Name.ToLower())
            .ThenBy(term => term.Name)
            .ThenBy(term => term.Id)
            .Select(term => new
            {
                term.Id,
                term.Kind,
                term.Name,
                RuleCount = db.WorldRuleValidations.Count(validation => validation.EventKindTermId == term.Id || validation.MethodTermId == term.Id),
                MomentCount = db.TimelineEntryValidations.Count(details => details.EventKindTermId == term.Id || details.MethodTermId == term.Id),
                term.CreatedAt,
                term.UpdatedAt,
            })
            .ToListAsync(cancellationToken);

        return
        [
            .. rows.Select(row => new ValidationTermResponse(
                row.Id, row.Kind, row.Name, row.RuleCount, row.MomentCount, Utc(row.CreatedAt), Utc(row.UpdatedAt))),
        ];
    }

    internal static Dictionary<string, string[]>? ValidateName(string? name, ValidationTermKind kind)
    {
        var trimmed = name?.Trim();

        if (string.IsNullOrEmpty(trimmed))
        {
            return new() { ["name"] = [$"Give the {Word(kind)} a name."] };
        }

        if (trimmed.Length > RuleValidationLimits.TermNameMaxLength)
        {
            return new() { ["name"] = [$"Keep the name to {RuleValidationLimits.TermNameMaxLength} characters or fewer."] };
        }

        return null;
    }

    private static IResult NameTaken(ValidationTermKind kind, string name) =>
        Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["name"] = [$"This universe already has {(kind == ValidationTermKind.EventKind ? "an" : "a")} {Word(kind)} called “{name}”."],
        });

    internal static string Word(ValidationTermKind kind) => kind == ValidationTermKind.EventKind ? "event kind" : "method";

    private static string Count(int count, string noun) => count == 1 ? $"1 {noun}" : $"{count} {noun}s";

    private static DateTime Utc(DateTime value) =>
        value.Kind == DateTimeKind.Utc ? value : DateTime.SpecifyKind(value, DateTimeKind.Utc);
}
