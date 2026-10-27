using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// Custom calendars (039, ADR 0022 amendment): a calendar per universe, its months, and a month reference on each of a
    /// moment's ends and on a scene - nullable, so every existing date stays a simple date and nothing is rewritten.
    ///
    /// The three references are added with a plain <c>ALTER TABLE ... ADD COLUMN ... REFERENCES</c>, not the generator's
    /// <c>AddForeignKey</c>. On SQLite that would rebuild <c>Scenes</c> and <c>TimelineEntries</c> whole, and a rebuild drops
    /// the triggers that keep the scene search index in step (<c>AddUniverseSearchIndex</c>), which EF Core's model cannot
    /// see. The column form is native, keeps every trigger, and gives the same no-action key the model describes.
    ///
    /// Rolling back cannot avoid a rebuild - SQLite will not drop a column that holds a foreign key - so it writes each
    /// custom month back as the number of its position first, rebuilds <c>Scenes</c> by hand and puts its search triggers
    /// back exactly as <c>AddUniverseSearchIndex</c> wrote them, and leaves <c>TimelineEntries</c>, which has none, to the
    /// generator.
    /// </summary>
    public partial class AddChronologyCalendars : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ChronologyCalendars",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChronologyCalendars", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ChronologyCalendars_Universes_UniverseId",
                        column: x => x.UniverseId,
                        principalTable: "Universes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ChronologyCalendarMonths",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    CalendarId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 60, nullable: false),
                    Abbreviation = table.Column<string>(type: "TEXT", maxLength: 12, nullable: true),
                    SortOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    DayCount = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ChronologyCalendarMonths", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ChronologyCalendarMonths_ChronologyCalendars_CalendarId",
                        column: x => x.CalendarId,
                        principalTable: "ChronologyCalendars",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.Sql("""
                ALTER TABLE "TimelineEntries" ADD COLUMN "StartMonthId" TEXT NULL
                    CONSTRAINT "FK_TimelineEntries_ChronologyCalendarMonths_StartMonthId" REFERENCES "ChronologyCalendarMonths" ("Id");
                """);

            migrationBuilder.Sql("""
                ALTER TABLE "TimelineEntries" ADD COLUMN "EndMonthId" TEXT NULL
                    CONSTRAINT "FK_TimelineEntries_ChronologyCalendarMonths_EndMonthId" REFERENCES "ChronologyCalendarMonths" ("Id");
                """);

            migrationBuilder.Sql("""
                ALTER TABLE "Scenes" ADD COLUMN "MonthId" TEXT NULL
                    CONSTRAINT "FK_Scenes_ChronologyCalendarMonths_MonthId" REFERENCES "ChronologyCalendarMonths" ("Id");
                """);

            migrationBuilder.CreateIndex(
                name: "IX_TimelineEntries_EndMonthId",
                table: "TimelineEntries",
                column: "EndMonthId");

            migrationBuilder.CreateIndex(
                name: "IX_TimelineEntries_StartMonthId",
                table: "TimelineEntries",
                column: "StartMonthId");

            migrationBuilder.CreateIndex(
                name: "IX_Scenes_MonthId",
                table: "Scenes",
                column: "MonthId");

            migrationBuilder.CreateIndex(
                name: "IX_ChronologyCalendarMonths_CalendarId_SortOrder",
                table: "ChronologyCalendarMonths",
                columns: new[] { "CalendarId", "SortOrder" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ChronologyCalendars_UniverseId",
                table: "ChronologyCalendars",
                column: "UniverseId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // A custom month becomes the number of its place, the only meaning the earlier schema has for it.
            migrationBuilder.Sql("""
                UPDATE "TimelineEntries"
                SET "StartMonth" = (SELECT "SortOrder" + 1 FROM "ChronologyCalendarMonths" WHERE "Id" = "StartMonthId"),
                    "StartMonthId" = NULL
                WHERE "StartMonthId" IS NOT NULL;
                """);

            migrationBuilder.Sql("""
                UPDATE "TimelineEntries"
                SET "EndMonth" = (SELECT "SortOrder" + 1 FROM "ChronologyCalendarMonths" WHERE "Id" = "EndMonthId"),
                    "EndMonthId" = NULL
                WHERE "EndMonthId" IS NOT NULL;
                """);

            migrationBuilder.Sql("""
                UPDATE "Scenes"
                SET "Month" = (SELECT "SortOrder" + 1 FROM "ChronologyCalendarMonths" WHERE "Id" = "MonthId"),
                    "MonthId" = NULL
                WHERE "MonthId" IS NOT NULL;
                """);

            // Scenes is rebuilt here by hand, statement for statement what the generator would write, because the generator
            // runs its rebuilds after every other step of a migration and would drop the search triggers recreated below.
            migrationBuilder.Sql("""
                CREATE TABLE "ef_temp_Scenes" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_Scenes" PRIMARY KEY,
                    "ChapterId" TEXT NULL,
                    "CreatedAt" TEXT NOT NULL,
                    "Day" INTEGER NULL,
                    "DeletedAt" TEXT NULL,
                    "EraId" TEXT NULL,
                    "ManuscriptVisibility" INTEGER NOT NULL,
                    "Month" INTEGER NULL,
                    "Notes" TEXT NULL,
                    "PovEntityId" TEXT NULL,
                    "SortOrder" INTEGER NOT NULL,
                    "StoryId" TEXT NOT NULL,
                    "Summary" TEXT NULL,
                    "Title" TEXT NOT NULL,
                    "UpdatedAt" TEXT NOT NULL,
                    "Visibility" INTEGER NOT NULL,
                    "Year" INTEGER NULL,
                    CONSTRAINT "FK_Scenes_Chapters_ChapterId" FOREIGN KEY ("ChapterId") REFERENCES "Chapters" ("Id"),
                    CONSTRAINT "FK_Scenes_ChronologyEras_EraId" FOREIGN KEY ("EraId") REFERENCES "ChronologyEras" ("Id"),
                    CONSTRAINT "FK_Scenes_Entities_PovEntityId" FOREIGN KEY ("PovEntityId") REFERENCES "Entities" ("Id") ON DELETE SET NULL,
                    CONSTRAINT "FK_Scenes_Stories_StoryId" FOREIGN KEY ("StoryId") REFERENCES "Stories" ("Id") ON DELETE CASCADE
                );
                """);

            migrationBuilder.Sql("""
                INSERT INTO "ef_temp_Scenes" ("Id", "ChapterId", "CreatedAt", "Day", "DeletedAt", "EraId", "ManuscriptVisibility", "Month", "Notes", "PovEntityId", "SortOrder", "StoryId", "Summary", "Title", "UpdatedAt", "Visibility", "Year")
                SELECT "Id", "ChapterId", "CreatedAt", "Day", "DeletedAt", "EraId", "ManuscriptVisibility", "Month", "Notes", "PovEntityId", "SortOrder", "StoryId", "Summary", "Title", "UpdatedAt", "Visibility", "Year"
                FROM "Scenes";
                """);

            // Off for the swap, as the generator does, so dropping the old table cascades into nothing that points at it.
            migrationBuilder.Sql("PRAGMA foreign_keys = 0;", suppressTransaction: true);
            migrationBuilder.Sql("""DROP TABLE "Scenes";""");
            migrationBuilder.Sql("""ALTER TABLE "ef_temp_Scenes" RENAME TO "Scenes";""");
            migrationBuilder.Sql("PRAGMA foreign_keys = 1;", suppressTransaction: true);

            migrationBuilder.Sql("""CREATE INDEX "IX_Scenes_ChapterId" ON "Scenes" ("ChapterId");""");
            migrationBuilder.Sql("""CREATE UNIQUE INDEX "IX_Scenes_ChapterId_SortOrder" ON "Scenes" ("ChapterId", "SortOrder") WHERE "ChapterId" IS NOT NULL AND "DeletedAt" IS NULL;""");
            migrationBuilder.Sql("""CREATE INDEX "IX_Scenes_EraId" ON "Scenes" ("EraId");""");
            migrationBuilder.Sql("""CREATE INDEX "IX_Scenes_PovEntityId" ON "Scenes" ("PovEntityId");""");
            migrationBuilder.Sql("""CREATE INDEX "IX_Scenes_StoryId" ON "Scenes" ("StoryId");""");
            migrationBuilder.Sql("""CREATE UNIQUE INDEX "IX_Scenes_StoryId_SortOrder" ON "Scenes" ("StoryId", "SortOrder") WHERE "ChapterId" IS NULL AND "DeletedAt" IS NULL;""");

            // The old table took the scene search triggers with it. Back, exactly as AddUniverseSearchIndex wrote them.
            const string insert = """
                INSERT INTO StorySearchIndex (Kind, ItemId, Title, Summary, Notes)
                VALUES ('scene', new.Id, replace(replace(new.Title, char(57344), ' '), char(57345), ' '), replace(replace(coalesce(new.Summary, ''), char(57344), ' '), char(57345), ' '), replace(replace(coalesce(new.Notes, ''), char(57344), ' '), char(57345), ' '));
                """;

            migrationBuilder.Sql($"""
                CREATE TRIGGER StorySearchIndex_SceneInserted AFTER INSERT ON Scenes BEGIN
                    {insert}
                END;
                """);

            migrationBuilder.Sql($"""
                CREATE TRIGGER StorySearchIndex_SceneUpdated AFTER UPDATE OF Title, Summary, Notes ON Scenes
                WHEN old.Title IS NOT new.Title OR old.Summary IS NOT new.Summary OR old.Notes IS NOT new.Notes
                BEGIN
                    DELETE FROM StorySearchIndex WHERE Kind = 'scene' AND ItemId = old.Id;
                    {insert}
                END;
                """);

            migrationBuilder.Sql("""
                CREATE TRIGGER StorySearchIndex_SceneDeleted AFTER DELETE ON Scenes BEGIN
                    DELETE FROM StorySearchIndex WHERE Kind = 'scene' AND ItemId = old.Id;
                END;
                """);

            // TimelineEntries has no trigger, so the generator's own rebuild is fine there.
            migrationBuilder.DropForeignKey(
                name: "FK_TimelineEntries_ChronologyCalendarMonths_EndMonthId",
                table: "TimelineEntries");

            migrationBuilder.DropForeignKey(
                name: "FK_TimelineEntries_ChronologyCalendarMonths_StartMonthId",
                table: "TimelineEntries");

            migrationBuilder.DropTable(
                name: "ChronologyCalendarMonths");

            migrationBuilder.DropTable(
                name: "ChronologyCalendars");

            migrationBuilder.DropIndex(
                name: "IX_TimelineEntries_EndMonthId",
                table: "TimelineEntries");

            migrationBuilder.DropIndex(
                name: "IX_TimelineEntries_StartMonthId",
                table: "TimelineEntries");

            migrationBuilder.DropColumn(
                name: "EndMonthId",
                table: "TimelineEntries");

            migrationBuilder.DropColumn(
                name: "StartMonthId",
                table: "TimelineEntries");
        }
    }
}