using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// A relation kind may carry a family meaning (ADR 0035). One integer column on <c>RelationshipTypes</c>, defaulting to
    /// <c>None</c>: every existing kind keeps no family meaning whatever it is called - nothing is read from a name - and no
    /// relationship row is touched. Nothing is rebuilt on the way up.
    ///
    /// Rolling back drops the column with SQLite's own <c>ALTER TABLE ... DROP COLUMN</c> rather than EF Core's table rebuild,
    /// which would drop and recreate <c>RelationshipTypes</c> under the relationships that point at it. No index, constraint or
    /// trigger names the column, so the native drop applies. Every family meaning is lost with it.
    /// </summary>
    public partial class AddRelationshipFamilySemantics : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "FamilySemantic",
                table: "RelationshipTypes",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""ALTER TABLE "RelationshipTypes" DROP COLUMN "FamilySemantic";""");
        }
    }
}
