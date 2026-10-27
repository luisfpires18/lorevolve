# TODO - finish the LorEvolve rename outside the code

The code, docs and images are renamed (ADR 0067). What is left lives outside the repository and can be done
whenever you like, one section at a time. **Order matters**: GitHub first (Azure trusts the repository's name), the
local folder last. Until a section is done, the app keeps working against the old name. Delete this file when
everything is ticked.

Placeholders: `<suffix>` = any short unique tail for the new app name (the old one was `lfp18`).

---

## 0. Before you start

- [ ] `chore/rename-lorevolve` is merged into `dev` and DEV has deployed it. Expect: everyone signed out once, invite
      links sent before the deploy need sending again, connected AI apps keep working.
- [ ] Local dev database: the merge renames `src/Lorex.Api` but leaves the untracked `App_Data` behind. With the app
      stopped (`Stop-Lorex.cmd` before pulling the merge):

```powershell
New-Item -ItemType Directory -Force D:\Workspace\LOREX\src\LorEvolve.Api\App_Data
```

```powershell
Move-Item D:\Workspace\LOREX\src\Lorex.Api\App_Data\lorex.dev.db D:\Workspace\LOREX\src\LorEvolve.Api\App_Data\lorevolve.dev.db
```

      Then delete what is left of `src\Lorex.Api` (only `bin`, `obj` and old test databases).

## 1. GitHub repository

```bash
gh repo rename lorevolve --repo luisfpires18/lorex
```

```bash
git remote set-url origin https://github.com/luisfpires18/lorevolve.git
```

- [ ] Renamed. GitHub redirects the old URL, so old links and clones keep working.
- [ ] Replace the remaining `luisfpires18/lorex` links in the repository (`git grep -n luisfpires18/lorex`).
- [ ] Verify: `git fetch` works and the Actions tab shows the repository's history.

## 2. Azure sign-in for the deploy workflow (do right after step 1)

The federated credential trusts `repo:luisfpires18/lorex:environment:dev`. After the rename GitHub presents
`repo:luisfpires18/lorevolve:environment:dev`, and **Deploy DEV fails to sign in until this is changed**.

```bash
az ad app federated-credential list --id <AZURE_CLIENT_ID> -o table
```

```bash
az ad app federated-credential update --id <AZURE_CLIENT_ID> --federated-credential-id <name-from-list> --parameters "{\"subject\": \"repo:luisfpires18/lorevolve:environment:dev\"}"
```

- [ ] Verify: run **Deploy DEV** from the Actions tab; the *Azure login* step passes.

## 3. R2 buckets (Cloudflare dashboard + rclone)

Bucket names cannot change: make new ones and copy. Keep the old buckets until DEV is verified.

- [ ] Create bucket `lorevolve-media` (private, same settings as `lorex-media`).
- [ ] Optional: create `lorevolve-db-backups-dev` to replace `lorex-db-backups-dev`.
- [ ] Copy the pictures (rclone remote `r2` set up with an R2 token that can read the old bucket and write the new):

```bash
rclone copy r2:lorex-media r2:lorevolve-media --progress --checksum
```

```bash
rclone check r2:lorex-media r2:lorevolve-media
```

- [ ] Point the app at it (still the old app here; step 4 copies this setting over):

```bash
az webapp config appsettings set -g rg-lorex-dev -n lorex-dev-lfp18 --settings Media__R2__Bucket=lorevolve-media
```

- [ ] If you made the new backup bucket, set `DatabaseBackup__R2__Bucket=lorevolve-db-backups-dev` the same way.
      Snapshots in the old bucket stay restorable by their manifest; nothing needs copying.
- [ ] Local development: `dotnet user-secrets --project src/LorEvolve.Api set "Media:R2:Bucket" "lorevolve-media"`
      (if you use R2 locally).
- [ ] Update `docs/deployment/cloudflare-r2.md` and `docs/recovery/database-backups.md` (they name `lorex-media` and
      `lorex-db-backups-dev`).
- [ ] Verify: an entry's picture loads on DEV; uploading a new one works.

## 4. Azure DEV app

App Service names are permanent, so this is a new app beside the old one, then a move of the database.

1. - [ ] New resource group and app from the same template:

   ```bash
   az group create -n rg-lorevolve-dev -l <same location as rg-lorex-dev>
   ```

   ```bash
   az deployment group create -g rg-lorevolve-dev -f infra/main.bicep -p appName=lorevolve-dev-<suffix>
   ```

2. - [ ] Give the deploy's app registration **Contributor** on `rg-lorevolve-dev` (as you did for the old group).
3. - [ ] Copy the app settings. List the old ones, then set each on the new app, changing:
   - `Mcp__Origin` (and `PublicSite__Origin` if set) -> `https://lorevolve-dev-<suffix>.azurewebsites.net`
   - `ConnectionStrings__LorexDb`, if present -> rename to `ConnectionStrings__LorEvolveDb`

   ```bash
   az webapp config appsettings list -g rg-lorex-dev -n lorex-dev-lfp18 -o table
   ```

4. - [ ] Freeze and copy the database. Stop the old app first so SQLite's WAL is folded into the file, then download it
       through Kudu and upload it to the new app under its new name:

   ```bash
   az webapp stop -g rg-lorex-dev -n lorex-dev-lfp18
   ```

   ```bash
   TOKEN=$(az account get-access-token --query accessToken -o tsv)
   ```

   ```bash
   curl -fH "Authorization: Bearer $TOKEN" -o lorex.db https://lorex-dev-lfp18.scm.azurewebsites.net/api/vfs/data/lorex.db
   ```

   ```bash
   curl -fX PUT -H "Authorization: Bearer $TOKEN" -H "If-Match: *" --data-binary @lorex.db https://lorevolve-dev-<suffix>.scm.azurewebsites.net/api/vfs/data/lorevolve.db
   ```

   (A database snapshot in R2 is the fallback: `docs/recovery/database-backups.md`, restore drill.) Keep the
   downloaded `lorex.db` until step 6 is done; never commit it.
5. - [ ] In the repository, on a branch: `src/LorEvolve.Api/appsettings.AzureDev.json` ->
       `"Data Source=/home/data/lorevolve.db"`; replace `lorex-dev-lfp18`, `rg-lorex-dev` and `/home/data/lorex.db` in
       `docs/` and `STATE.md` (`git grep -n "lorex-dev\|/home/data/lorex.db"`). Merge it.
6. - [ ] GitHub variable `AZURE_WEBAPP_NAME` -> `lorevolve-dev-<suffix>`; run **Deploy DEV**.
7. - [ ] Verify on the new URL: sign in, your universes are there, pictures load, a save works, `/health` is green.
       AI apps: reconnect them to the new address (the OAuth issuer moved with the hostname).
8. - [ ] Leave the old app **stopped** for a while. When you're sure: delete `rg-lorex-dev`, then the old R2 buckets.
9. - [ ] Update the Claude memory note `manual-dev-deploy-az` with the new app name.

## 5. Local folder (last; close every Claude session and editor on the repo first)

```powershell
Move-Item D:\Workspace\LOREX D:\Workspace\LOREVOLVE
```

```bash
git -C /d/Workspace/LOREVOLVE worktree repair
```

- [ ] Copy Claude's memory so the next session still has it:
      `C:\Users\Victus\.claude\projects\D--Workspace-LOREX\memory` ->
      `C:\Users\Victus\.claude\projects\D--Workspace-LOREVOLVE\memory` (create the folder by opening one session in
      the new path first).
- [ ] `python -m graphify update .` in the new folder (the graph is gitignored and rebuildable).
- [ ] Replace the remaining `Workspace\LOREX` paths in the repository (`git grep -n "Workspace.LOREX"`).
- [ ] Verify: `Start-LorEvolve.cmd` boots the app.

## 6. Done

- [ ] `git grep -in lorex` shows only the read-old fallbacks ADR 0067 lists (and that ADR). Delete this file.
