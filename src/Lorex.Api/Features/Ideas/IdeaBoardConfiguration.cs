using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Ideas;

/// <summary>The bounds a board is held to (ADR 0066). Mirrored by the web client.</summary>
public static class IdeaBoardLimits
{
    public const int TitleMaxLength = IdeaLimits.TitleMaxLength;

    /// <summary>A note is a sticky note, not an idea: an idea's body is ten times this.</summary>
    public const int NoteMaxLength = 2_000;

    public const int LabelMaxLength = 80;

    /// <summary>Enough to think with, small enough that a whole save stays a small request.</summary>
    public const int MaxCards = 300;

    public const int MaxConnections = 600;

    /// <summary>How far from the origin a card may sit, in board units.</summary>
    public const double MaxCoordinate = 1_000_000;

    public const double MinCardSize = 40;

    public const double MaxCardSize = 4_000;
}

public sealed class IdeaBoardConfiguration : IEntityTypeConfiguration<IdeaBoard>
{
    public void Configure(EntityTypeBuilder<IdeaBoard> builder)
    {
        builder.ToTable("IdeaBoards");
        builder.HasKey(board => board.Id);

        builder.Property(board => board.OwnerId).IsRequired();
        builder.Property(board => board.Title).IsRequired().HasMaxLength(IdeaBoardLimits.TitleMaxLength);

        builder.HasOne(board => board.Owner)
            .WithMany()
            .HasForeignKey(board => board.OwnerId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // An association, as an idea's is: the universe route releases its boards first, and SET NULL holds the line.
        builder.HasOne(board => board.Universe)
            .WithMany()
            .HasForeignKey(board => board.UniverseId)
            .OnDelete(DeleteBehavior.SetNull);

        builder.HasIndex(board => new { board.OwnerId, board.DeletedAt, board.UpdatedAt });
        builder.HasIndex(board => new { board.UniverseId, board.DeletedAt, board.UpdatedAt });
    }
}

public sealed class IdeaBoardCardConfiguration : IEntityTypeConfiguration<IdeaBoardCard>
{
    public void Configure(EntityTypeBuilder<IdeaBoardCard> builder)
    {
        // Exactly the payload the kind names, whatever path wrote the row.
        builder.ToTable("IdeaBoardCards", table => table.HasCheckConstraint(
            "CK_IdeaBoardCards_Payload",
            "(\"Kind\" = 0 AND \"Text\" IS NOT NULL AND \"IdeaId\" IS NULL AND \"EntityId\" IS NULL)"
            + " OR (\"Kind\" = 1 AND \"Text\" IS NULL AND \"IdeaId\" IS NOT NULL AND \"EntityId\" IS NULL)"
            + " OR (\"Kind\" = 2 AND \"Text\" IS NULL AND \"IdeaId\" IS NULL AND \"EntityId\" IS NOT NULL)"));

        builder.HasKey(card => new { card.BoardId, card.Id });

        builder.Property(card => card.Text).HasMaxLength(IdeaBoardLimits.NoteMaxLength);

        builder.HasOne(card => card.Board)
            .WithMany(board => board.Cards)
            .HasForeignKey(card => card.BoardId)
            .OnDelete(DeleteBehavior.Cascade);

        // Ideas are deleted for good only with their account, which takes the board too. An entry gone for good takes only
        // its card, never the board - as an idea's reference.
        builder.HasOne(card => card.Idea)
            .WithMany()
            .HasForeignKey(card => card.IdeaId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(card => card.Entity)
            .WithMany()
            .HasForeignKey(card => card.EntityId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasIndex(card => card.IdeaId);
        builder.HasIndex(card => card.EntityId);
    }
}

public sealed class IdeaBoardConnectionConfiguration : IEntityTypeConfiguration<IdeaBoardConnection>
{
    public void Configure(EntityTypeBuilder<IdeaBoardConnection> builder)
    {
        builder.ToTable("IdeaBoardConnections");
        builder.HasKey(connection => new { connection.BoardId, connection.Id });

        builder.Property(connection => connection.Label).HasMaxLength(IdeaBoardLimits.LabelMaxLength);

        // Both ends keyed with the board: no line can join two boards, and the board's cascade reaches lines through cards.
        builder.HasOne(connection => connection.FromCard)
            .WithMany()
            .HasForeignKey(connection => new { connection.BoardId, connection.FromCardId })
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(connection => connection.ToCard)
            .WithMany()
            .HasForeignKey(connection => new { connection.BoardId, connection.ToCardId })
            .OnDelete(DeleteBehavior.Cascade);
    }
}
