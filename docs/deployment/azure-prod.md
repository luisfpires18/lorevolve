# Azure PROD

PROD is `https://lorevolve.com`: one Linux App Service `prod-lorevolve` on a Basic B1 plan, the same shape as DEV
([azure-dev.md](azure-dev.md): topology, the database, Data Protection, MCP, Admin, limitations). This file lists only
what differs. Domain layout and why: [../design/custom-domain-plan.md](../design/custom-domain-plan.md).

**Not before the pre-alpha gate** (#33 security, #11 recovery, #54 database backups) is merged, and not without
working backups: PROD holds the only copy of alpha users' work.

## What differs from DEV

| | DEV | PROD |
| --- | --- | --- |
| Address | `dev-lorevolve.azurewebsites.net` | `lorevolve.com` (`www` redirects at Cloudflare) |
| Plan | Free F1 | Basic B1 (Always On, custom domain, managed certificate) |
| Deploys | Every push to `dev` | By hand: Actions > Deploy PROD, from `master` only |
| Workflow | `deploy-dev.yml` | `deploy-prod.yml` |
| GitHub environment | `dev` | `prod`, with a required reviewer |
| App name variable | `AZURE_WEBAPP_NAME` | `AZURE_PROD_WEBAPP_NAME` (its own name, so a missing value fails instead of hitting DEV) |
| `ASPNETCORE_ENVIRONMENT` | `AzureDev` | `AzureProd` (`appsettings.AzureProd.json`, same `/home/data` layout) |
| Shown version | `0.1.N-dev` from the run number | `package.json`'s version, unchanged |
| Indexing | Off | Off until launch (`PublicSite__AllowIndexing` unset) |

Nothing is shared: PROD has its own database, key ring, R2 buckets, backup bucket, Admin account and AI connections.

## First setup (owner)

1. **Resources.** The DEV template, with PROD values. A new resource group is cleaner (insert a name); same region as
   DEV (West Europe). The subscription is Azure for Students: B1 draws on the credit.

   ```bash
   az group create -n <resource group> -l westeurope
   az deployment group create -g <resource group> --template-file infra/main.bicep --parameters appName=prod-lorevolve environmentName=AzureProd "allowedHosts=prod-lorevolve.azurewebsites.net;lorevolve.com" "tags={\"application\":\"lorevolve\",\"environment\":\"prod\"}"
   ```

2. **Sign-in for the workflow.** On the app registration DEV already uses: a second federated credential, entity type
   Environment, environment `prod`. Give that registration Contributor on the new resource group.

3. **GitHub.** Settings > Environments > New environment `prod`: required reviewer (the owner), deployment branches
   limited to `master`. Variable on `prod`: `AZURE_PROD_WEBAPP_NAME=prod-lorevolve`. `AZURE_CLIENT_ID`,
   `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` come from the repository variables if the registration is the same.

4. **App settings** (portal or `az webapp config appsettings set -g <resource group> -n prod-lorevolve --settings ...`;
   never in a file):

   | Setting | Value |
   | --- | --- |
   | `Hosting__UseForwardedHeaders` | `true` |
   | `Mcp__Origin` | `https://lorevolve.com` |
   | `PublicSite__Origin` | `https://lorevolve.com` |
   | `Media__Provider`, `Media__R2__*` | a new bucket (insert a name) and a token for it only ([cloudflare-r2.md](cloudflare-r2.md)) |
   | `DatabaseBackup__*` | `Environment=prod`, a new private bucket and its own token ([../recovery/database-backups.md](../recovery/database-backups.md)) |
   | `Assistant__*` | only if PROD offers the assistant |
   | `Registration__InviteOnly` | `true`, but only after step 6 |

5. **First deploy.** Merge `dev` into `master`, push `master`, Actions > Deploy PROD > Run workflow on `master`, approve.
   It ends by waiting for `https://prod-lorevolve.azurewebsites.net/health`.

6. **Admin.** Open `https://prod-lorevolve.azurewebsites.net`, register the owner's account (open registration: no
   Admin exists yet to make a sign-up link), then follow "Provision the owner's Admin account" in
   [azure-dev.md](azure-dev.md) with this host. Then set `Registration__InviteOnly=true`.

7. **Domain.** [custom-domain-plan.md](../design/custom-domain-plan.md) section 3.3 and 3.4: `A @` to the app's IP and
   `TXT asuid` (both DNS only), the managed certificate, the `www` rule.

8. **Backups.** Admin > Database backups > Run backup now, then the restore drill. PROD is not open to anyone until
   both pass.

## Release

1. `dev` is green on DEV and checked there.
2. Merge `dev` into `master` and push `master` (on request only; never automatic).
3. Actions > Deploy PROD > Run workflow, branch `master`. Approve the `prod` environment.
4. After: `https://lorevolve.com/health` is 200, sign in, open a universe.

A release with a migration cannot be undone by redeploying (migrations are forward-only, see azure-dev.md). Take
Admin > Run backup now before releasing one.

## Roll back

The workflow only deploys `master`, so a rollback is a forward fix: revert the bad commit on `dev`, merge into
`master`, run Deploy PROD. Faster, for an outage: the portal's Deployment Center can redeploy the previous package.
Database: restore from a backup ([../recovery/database-backups.md](../recovery/database-backups.md)).
