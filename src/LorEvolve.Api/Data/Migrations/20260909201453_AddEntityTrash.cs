using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddEntityTrash : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Entities_UniverseId_IsArchived_UpdatedAt",
                table: "Entities");

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                table: "Entities",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Entities_UniverseId_DeletedAt_IsArchived_UpdatedAt",
                table: "Entities",
                columns: new[] { "UniverseId", "DeletedAt", "IsArchived", "UpdatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Entities_UniverseId_DeletedAt_IsArchived_UpdatedAt",
                table: "Entities");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                table: "Entities");

            migrationBuilder.CreateIndex(
                name: "IX_Entities_UniverseId_IsArchived_UpdatedAt",
                table: "Entities",
                columns: new[] { "UniverseId", "IsArchived", "UpdatedAt" });
        }
    }
}
