using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// Group-based Family Tree eligibility (Issue #37, ADR 0040 amendment). One additive column,
    /// <c>EntityTypeGroups.FamilyTreeEnabled</c>, false for every existing group, starter groups included: no group is enabled
    /// because of what it is called, so every universe offers the tree exactly where it did before until its author enables a
    /// group. No type's own <c>FamilyTreeEligible</c>, membership or relationship is touched.
    ///
    /// Rolling back drops the column with SQLite's own <c>ALTER TABLE ... DROP COLUMN</c> rather than EF Core's table rebuild,
    /// which would recreate <c>EntityTypeGroups</c> under the memberships and field targets that point at it.
    /// </summary>
    public partial class AddEntityTypeGroupFamilyTree : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "FamilyTreeEnabled",
                table: "EntityTypeGroups",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""ALTER TABLE "EntityTypeGroups" DROP COLUMN "FamilyTreeEnabled";""");
        }
    }
}
