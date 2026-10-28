using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddAiChangeMedia : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations");

            migrationBuilder.CreateTable(
                name: "AiChangeMedia",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UniverseId = table.Column<Guid>(type: "TEXT", nullable: false),
                    OperationId = table.Column<Guid>(type: "TEXT", nullable: false),
                    EntityId = table.Column<Guid>(type: "TEXT", nullable: false),
                    AppearanceId = table.Column<Guid>(type: "TEXT", nullable: true),
                    AssetId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ThumbnailId = table.Column<Guid>(type: "TEXT", nullable: false),
                    OriginalKey = table.Column<string>(type: "TEXT", maxLength: 400, nullable: false),
                    ThumbnailKey = table.Column<string>(type: "TEXT", maxLength: 400, nullable: false),
                    ContentType = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    FileName = table.Column<string>(type: "TEXT", maxLength: 255, nullable: true),
                    Width = table.Column<int>(type: "INTEGER", nullable: false),
                    Height = table.Column<int>(type: "INTEGER", nullable: false),
                    ByteSize = table.Column<long>(type: "INTEGER", nullable: false),
                    CropX = table.Column<double>(type: "REAL", nullable: false),
                    CropY = table.Column<double>(type: "REAL", nullable: false),
                    CropWidth = table.Column<double>(type: "REAL", nullable: false),
                    CropHeight = table.Column<double>(type: "REAL", nullable: false),
                    UploadedByUserId = table.Column<string>(type: "TEXT", maxLength: 450, nullable: false),
                    UploadedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiChangeMedia", x => x.Id);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations",
                sql: "\"Resource\" IN (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19)");

            migrationBuilder.CreateIndex(
                name: "IX_AiChangeMedia_OperationId",
                table: "AiChangeMedia",
                column: "OperationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AiChangeMedia_UploadedByUserId",
                table: "AiChangeMedia",
                column: "UploadedByUserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // A proposal holding a picture change goes with its changes (review state, as AddSchemaProposals). The quarantine
            // table goes too: what it holds is what the hourly sweep would delete once nothing waits for it, and after a
            // rollback nothing does. Its objects are not deleted here - a migration has no store - and are left in the bucket.
            migrationBuilder.Sql("DELETE FROM \"AiChangeOperations\" WHERE \"ProposalId\" IN (SELECT \"ProposalId\" FROM \"AiChangeOperations\" WHERE \"Resource\" = 19);");
            migrationBuilder.Sql("DELETE FROM \"AiChangeProposals\" WHERE \"Id\" NOT IN (SELECT \"ProposalId\" FROM \"AiChangeOperations\");");

            migrationBuilder.DropTable(
                name: "AiChangeMedia");

            migrationBuilder.DropCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiChangeOperations_Resource",
                table: "AiChangeOperations",
                sql: "\"Resource\" IN (0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18)");
        }
    }
}
