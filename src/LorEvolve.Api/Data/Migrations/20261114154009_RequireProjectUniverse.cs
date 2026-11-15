using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <summary>
    /// Every creative project belongs to exactly one universe (#171, superseding the optional-universe design of #138).
    ///
    /// <para><b>Two things in this migration were written by hand, because what EF generated was unsafe.</b> It emitted
    /// <c>defaultValue: 00000000-0000-0000-0000-000000000000</c> for the column becoming required, which would give any
    /// project with no universe an id no universe has, quietly, and leave the row pointing at nothing. #171 says not to
    /// invent a universe and not to delete the row, but to stop and let the owner decide. So:</para>
    ///
    /// <para>1. The guard below fails the migration when any project has no universe. Its check constraint is named
    /// <c>EveryProjectMustBelongToAUniverse_GiveTheseRowsOneFirst</c>, because SQLite puts a failed constraint's name in
    /// the error, so the migration says what is wrong rather than only that something is. <c>CHECK (0)</c> means the
    /// insert can only succeed when it inserts nothing. Nothing is written and nothing is dropped.</para>
    ///
    /// <para>2. The default value is gone. If the guard were ever removed, the rebuild's own <c>NOT NULL</c> would still
    /// refuse the row rather than invent an id for it.</para>
    ///
    /// <para><b>If this migration aborts</b>, the affected rows are found with
    /// <c>SELECT "Id", "Name", "OwnerId" FROM "CreativeProjects" WHERE "UniverseId" IS NULL;</c> and each one needs a
    /// universe chosen by its owner, or deleting on purpose. Neither is a decision a migration should take.</para>
    ///
    /// <para>The foreign key becomes <c>CASCADE</c>: a project is a subdivision of its universe and goes with it, as a
    /// story does. <c>Down</c> puts the column and <c>SET NULL</c> back, so a rollback is exact.</para>
    /// </summary>
    /// <inheritdoc />
    public partial class RequireProjectUniverse : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Fails loudly, before anything is altered, if any project has no universe. Inserts nothing when none do.
            migrationBuilder.Sql(
                """
                CREATE TEMP TABLE "ProjectsWithoutAUniverse" (
                    "Id" TEXT NOT NULL,
                    CONSTRAINT "EveryProjectMustBelongToAUniverse_GiveTheseRowsOneFirst" CHECK (0)
                );
                """);
            migrationBuilder.Sql(
                """
                INSERT INTO "ProjectsWithoutAUniverse" ("Id")
                SELECT "Id" FROM "CreativeProjects" WHERE "UniverseId" IS NULL;
                """);
            migrationBuilder.Sql(
                """
                DROP TABLE "ProjectsWithoutAUniverse";
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_CreativeProjects_Universes_UniverseId",
                table: "CreativeProjects");

            migrationBuilder.AlterColumn<Guid>(
                name: "UniverseId",
                table: "CreativeProjects",
                type: "TEXT",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "TEXT",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_CreativeProjects_Universes_UniverseId",
                table: "CreativeProjects",
                column: "UniverseId",
                principalTable: "Universes",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_CreativeProjects_Universes_UniverseId",
                table: "CreativeProjects");

            migrationBuilder.AlterColumn<Guid>(
                name: "UniverseId",
                table: "CreativeProjects",
                type: "TEXT",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "TEXT");

            migrationBuilder.AddForeignKey(
                name: "FK_CreativeProjects_Universes_UniverseId",
                table: "CreativeProjects",
                column: "UniverseId",
                principalTable: "Universes",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
