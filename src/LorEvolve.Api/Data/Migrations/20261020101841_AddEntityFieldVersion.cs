using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// Issue #39 review. <c>EntityFieldDefinitions.Version</c>, the edit version a field edit names (ADR 0043 amendment): a plain
    /// column added in place, every existing field starting at 1, the value a new field gets, so legacy fields are editable at
    /// once. And two indexes on <c>EntityRevisionFieldValues</c>, by field and by choice, that the field-delete and
    /// option-removal checks read to keep a definition or choice an older version records. No key is added there: snapshots
    /// stay plain data (ADR 0013).
    ///
    /// Rolling back drops the indexes and then the column with SQLite's own <c>ALTER TABLE ... DROP COLUMN</c> rather than EF
    /// Core's table rebuild, which would recreate <c>EntityFieldDefinitions</c> under the values and options that point at it.
    /// </summary>
    public partial class AddEntityFieldVersion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Version",
                table: "EntityFieldDefinitions",
                type: "INTEGER",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.CreateIndex(
                name: "IX_EntityRevisionFieldValues_FieldDefinitionId",
                table: "EntityRevisionFieldValues",
                column: "FieldDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_EntityRevisionFieldValues_OptionId",
                table: "EntityRevisionFieldValues",
                column: "OptionId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_EntityRevisionFieldValues_FieldDefinitionId",
                table: "EntityRevisionFieldValues");

            migrationBuilder.DropIndex(
                name: "IX_EntityRevisionFieldValues_OptionId",
                table: "EntityRevisionFieldValues");

            migrationBuilder.Sql("""ALTER TABLE "EntityFieldDefinitions" DROP COLUMN "Version";""");
        }
    }
}
