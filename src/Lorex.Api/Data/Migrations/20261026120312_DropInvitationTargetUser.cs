using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lorex.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DropInvitationTargetUser : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_UniverseInvitations_AspNetUsers_TargetUserId",
                table: "UniverseInvitations");

            migrationBuilder.DropIndex(
                name: "IX_UniverseInvitations_TargetUserId",
                table: "UniverseInvitations");

            migrationBuilder.DropColumn(
                name: "TargetUserId",
                table: "UniverseInvitations");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TargetUserId",
                table: "UniverseInvitations",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_UniverseInvitations_TargetUserId",
                table: "UniverseInvitations",
                column: "TargetUserId");

            migrationBuilder.AddForeignKey(
                name: "FK_UniverseInvitations_AspNetUsers_TargetUserId",
                table: "UniverseInvitations",
                column: "TargetUserId",
                principalTable: "AspNetUsers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }
    }
}
