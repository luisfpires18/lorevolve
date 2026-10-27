using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class RestrictEntityTypeIconKeys : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Data only: the column is unchanged. Until now `Icon` accepted any short string and
            // the client never sent one, so what is stored is the seven keys the starter types were
            // seeded with, nulls, and - only if someone wrote to the API by hand - anything at all.
            // From here on it holds a known key or nothing, so the last kind is cleared rather than
            // left to fail validation the next time its type is saved. A value that differs from a
            // known key only by case or surrounding space is kept, as that key.
            //
            // The list is the key set as it stood when this migration was written, deliberately
            // copied rather than read from EntityTypeIcons: a migration describes one moment.
            migrationBuilder.Sql(
                """
                UPDATE "EntityTypes"
                SET "Icon" = CASE
                    WHEN lower(trim("Icon")) IN (
                        'character', 'location', 'organization', 'event', 'item', 'species', 'concept',
                        'crown', 'castle', 'mountain', 'sword', 'shield', 'gem', 'leaf', 'sparkles', 'book', 'ship')
                    THEN lower(trim("Icon"))
                    ELSE NULL
                END
                WHERE "Icon" IS NOT NULL;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Nothing to undo that can be undone: a cleared value is not recorded anywhere, and
            // every key that survived is still a valid value for the looser column it was before.
        }
    }
}
