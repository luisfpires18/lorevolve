using Lorex.Api.Features.Auth;
using Lorex.Api.Features.Universes;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Lorex.Api.Features.Mcp;

/// <summary>
/// One approved connection between an AI client and one universe, made by one account (ADR 0046): what Profile ->
/// Connected Apps lists and revokes, and what every MCP request and every token refresh is checked against.
///
/// <b>The OAuth state is OpenIddict's.</b> The authorization, its tokens and the client live in OpenIddict's own tables;
/// this row only binds that authorization (<see cref="AuthorizationId"/>) to the account and the universe it was approved
/// for, with foreign keys, so deleting the universe or the account deletes the connection - and with it every way to use
/// the authorization, because nothing is served or refreshed without this row.
///
/// No secret is held here: tokens are OpenIddict's, stored as hashed reference ids with a Data Protection payload.
/// </summary>
public sealed class McpConnection
{
    public Guid Id { get; set; }

    /// <summary>The OpenIddict authorization this connection is. Unique: one authorization is one connection.</summary>
    public required string AuthorizationId { get; set; }

    /// <summary>The OAuth <c>client_id</c> the connection was approved for.</summary>
    public required string ClientId { get; set; }

    public required string UserId { get; set; }

    public LorexUser? User { get; set; }

    public Guid UniverseId { get; set; }

    public Universe? Universe { get; set; }

    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// When the connection last read anything, to <see cref="McpLimits.LastUsedPrecision"/>: refreshed at most once in that
    /// window, so a busy client does not write on every call. Null until the first read.
    /// </summary>
    public DateTime? LastUsedAt { get; set; }
}

public sealed class McpConnectionConfiguration : IEntityTypeConfiguration<McpConnection>
{
    public void Configure(EntityTypeBuilder<McpConnection> builder)
    {
        builder.ToTable("McpConnections");
        builder.HasKey(connection => connection.Id);

        // OpenIddict's ids are strings it mints; its client ids are ours (DCR) or a client's URL (CIMD).
        builder.Property(connection => connection.AuthorizationId).HasMaxLength(100);
        builder.Property(connection => connection.ClientId).HasMaxLength(McpLimits.ClientIdLength);
        builder.HasIndex(connection => connection.AuthorizationId).IsUnique();

        // Gone with the universe, and gone with the account.
        builder.HasOne(connection => connection.Universe)
            .WithMany()
            .HasForeignKey(connection => connection.UniverseId)
            .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(connection => connection.User)
            .WithMany()
            .HasForeignKey(connection => connection.UserId)
            .IsRequired()
            .OnDelete(DeleteBehavior.Cascade);

        // "This account's connected apps", and the one connection per account, client and universe a new approval replaces.
        builder.HasIndex(connection => new { connection.UserId, connection.UniverseId, connection.ClientId });
        builder.HasIndex(connection => connection.UniverseId);
    }
}
