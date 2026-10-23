using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Lorex.Api.Data.Migrations
{
    /// <summary>
    /// Gives every MCP client registered before ADR 0047 the permission to ask for <c>lorex.propose</c>, the same scope list
    /// a registration gets today (<c>ClientRules.Describe</c>), so per-client scope enforcement can stay on. A permission
    /// only lets a client ask: nothing is granted without the person's tick on the consent screen, and no existing
    /// authorization, token or connection changes. Data only, no schema; the rollback takes the permission back out.
    /// </summary>
    public partial class UpgradeMcpClientScopes : Migration
    {
        private const string Read = "\"scp:lorex.read\"";

        private const string Both = "\"scp:lorex.read\",\"scp:lorex.propose\"";

        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                $"UPDATE \"OpenIddictApplications\" SET \"Permissions\" = REPLACE(\"Permissions\", '{Read}', '{Both}') "
                + $"WHERE \"Permissions\" LIKE '%{Read}%' AND \"Permissions\" NOT LIKE '%scp:lorex.propose%';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                "UPDATE \"OpenIddictApplications\" SET \"Permissions\" = REPLACE(REPLACE(\"Permissions\", ',\"scp:lorex.propose\"', ''), '\"scp:lorex.propose\",', '') "
                + "WHERE \"Permissions\" LIKE '%scp:lorex.propose%';");
        }
    }
}
