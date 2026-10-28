using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// Family Tree eligibility on entity types (Product refinement 016, ADR 0040). One additive column,
    /// <c>EntityTypes.FamilyTreeEligible</c>, false for every existing type - then one backfill that turns it on for the starter
    /// Character exactly as it was seeded: name, description, icon and colour all as <c>EntityTypeDefaults</c> writes them. That
    /// signature is what makes the row the starter rather than a type the author made and happened to call "Character"; a
    /// starter the author renamed, redescribed, re-iconed or recoloured is theirs now and stays off, as does every other
    /// type. The author turns any of them on under Types. Nothing else changes: no relationship, kind or entry is touched.
    ///
    /// Rolling back drops the column with SQLite's own <c>ALTER TABLE ... DROP COLUMN</c> rather than EF Core's table rebuild,
    /// which would recreate <c>EntityTypes</c> under the foreign keys that point at it.
    /// </summary>
    public partial class AddEntityTypeFamilyTreeEligibility : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "FamilyTreeEligible",
                table: "EntityTypes",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            // Kept in step with EntityTypeDefaults.IsUntouchedStarterCharacter, which reads older backups the same way.
            migrationBuilder.Sql("""
                UPDATE "EntityTypes"
                SET "FamilyTreeEligible" = 1
                WHERE "Name" = 'Character'
                  AND "Description" = 'People, and anything else with a will of its own.'
                  AND "Icon" = 'character'
                  AND "AccentColor" = '#4f6bd6';
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""ALTER TABLE "EntityTypes" DROP COLUMN "FamilyTreeEligible";""");
        }
    }
}
