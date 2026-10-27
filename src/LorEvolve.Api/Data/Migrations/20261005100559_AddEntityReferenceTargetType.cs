using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace LorEvolve.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AddEntityReferenceTargetType : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "TargetEntityTypeId",
                table: "EntityFieldDefinitions",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_EntityFieldDefinitions_TargetEntityTypeId",
                table: "EntityFieldDefinitions",
                column: "TargetEntityTypeId");

            migrationBuilder.AddForeignKey(
                name: "FK_EntityFieldDefinitions_EntityTypes_TargetEntityTypeId",
                table: "EntityFieldDefinitions",
                column: "TargetEntityTypeId",
                principalTable: "EntityTypes",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_EntityFieldDefinitions_EntityTypes_TargetEntityTypeId",
                table: "EntityFieldDefinitions");

            migrationBuilder.DropIndex(
                name: "IX_EntityFieldDefinitions_TargetEntityTypeId",
                table: "EntityFieldDefinitions");

            migrationBuilder.DropColumn(
                name: "TargetEntityTypeId",
                table: "EntityFieldDefinitions");
        }
    }
}
