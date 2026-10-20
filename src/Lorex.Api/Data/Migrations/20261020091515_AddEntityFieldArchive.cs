using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lorex.Api.Data.Migrations
{
    /// <summary>
    /// Archived fields (Issue #39). One additive, nullable column, <c>EntityFieldDefinitions.ArchivedAt</c>, null for every
    /// existing field, so every field stays active until its author archives it. No value, option, target or required flag is
    /// touched, and nothing is backfilled.
    ///
    /// Rolling back drops the column with SQLite's own <c>ALTER TABLE ... DROP COLUMN</c> rather than EF Core's table rebuild,
    /// which would recreate <c>EntityFieldDefinitions</c> under the values and options that point at it.
    /// </summary>
    public partial class AddEntityFieldArchive : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ArchivedAt",
                table: "EntityFieldDefinitions",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""ALTER TABLE "EntityFieldDefinitions" DROP COLUMN "ArchivedAt";""");
        }
    }
}
