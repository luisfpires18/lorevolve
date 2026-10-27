# TODO - finish the LorEvolve rename outside the code

The code, docs and images are renamed (ADR 0067). What is left lives outside the repository. **Order matters**: the
local folder goes last. Delete this file when everything is ticked.

Placeholders: `<suffix>` = any short unique tail for the new app name (the old one was `lfp18`).

---

## 0. Merge and deploy - done 2026-10-27

- [x] Rename merged into `dev` and deployed. DEV's startup command had to change by hand
      (`az webapp config set ... --startup-file "dotnet LorEvolve.Api.dll"`): the template sets it, but only a template
      deployment applies it, and the published DLL is now `LorEvolve.Api.dll`.
- [x] Local dev database moved to `src/LorEvolve.Api/App_Data/lorevolve.dev.db`.
- [ ] Optional: delete the leftover untracked `src/Lorex.Api/` (old test databases, `bin`, `obj`) and `.lorex/`.

## 1. GitHub repository - done 2026-10-27

- [x] Renamed to `luisfpires18/lorevolve`; `origin` updated. GitHub redirects the old URL.

## 2. Azure sign-in for the deploy workflow

The repository's OIDC subject is ID-qualified: `repo:luisfpires18@29492601/lorevolve@1359933673:environment:dev`.

- [x] Federated credential `github-lorevolve-dev` added with that subject, before the rename.
- [ ] Once a Deploy DEV run after the rename is green, remove the old one:

```bash
az ad app federated-credential delete --id 5b627c11-0050-4130-a062-4f41b7d02ed1 --federated-credential-id github-lorex-dev
```

## 3. R2 media - done 2026-10-27

Account `luisfrpires18@gmail.com`. DEV's bucket was `lorex-media-dev` (database backups are off on DEV: no bucket).

- [x] `lorevolve-media-dev` created; 36 objects copied and checked (`rclone check`, 0 differences).
- [x] App token `lorex-dev` given `lorevolve-media-dev`; DEV's `Media__R2__Bucket` switched. Pictures load.
- [ ] After a few days of DEV working: remove `lorex-media-dev` from the `lorex-dev` token, then delete the bucket.
      The copy-only token `lorevolve-dev` expires on its own (2026-10-28).
- [ ] Local development: `dotnet user-secrets --project src/LorEvolve.Api set "Media:R2:Bucket" "lorevolve-media-dev"`
      (only if you use R2 locally).

## 4. Azure DEV app (optional - only the name `lorex-dev-lfp18` is left)

App Service names are permanent, so this is a new app beside the old one, then a move of the database. DEV already
runs LorEvolve under the old name; do this only if the `lorex` hostname matters.

1. - [ ] New resource group and app from the same template (it sets the startup command itself):

   ```bash
   az group create -n rg-lorevolve-dev -l westeurope
   ```

   ```bash
   az deployment group create -g rg-lorevolve-dev -f infra/main.bicep -p appName=lorevolve-dev-<suffix>
   ```

2. - [ ] Give the deploy's app registration **Contributor** on `rg-lorevolve-dev` (as for the old group).
3. - [ ] Copy the app settings (list the old ones; set each on the new app), changing
       `Mcp__Origin` (and `PublicSite__Origin` if set) to `https://lorevolve-dev-<suffix>.azurewebsites.net`.

   ```bash
   az webapp config appsettings list -g rg-lorex-dev -n lorex-dev-lfp18 -o table
   ```

4. - [ ] Freeze and copy the database. Stop the old app first so SQLite's WAL is folded into the file:

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

   Keep the downloaded `lorex.db` until step 7; never commit it.
5. - [ ] On a branch: `src/LorEvolve.Api/appsettings.AzureDev.json` -> `"Data Source=/home/data/lorevolve.db"`; replace
       `lorex-dev-lfp18`, `rg-lorex-dev` and `/home/data/lorex.db` in `docs/` and `STATE.md`. Merge it.
6. - [ ] GitHub variable `AZURE_WEBAPP_NAME` -> `lorevolve-dev-<suffix>`; run **Deploy DEV**.
7. - [ ] Verify on the new URL: sign in, universes there, pictures load, a save works, `/health` green. Reconnect AI
       apps (the OAuth issuer moved with the hostname).
8. - [ ] Leave the old app **stopped** a while, then delete `rg-lorex-dev`. Update the memory note `manual-dev-deploy-az`.

## 5. Local folder (last; close every Claude session and editor on the repo first)

```powershell
Move-Item D:\Workspace\LOREX D:\Workspace\LOREVOLVE
```

```bash
git -C /d/Workspace/LOREVOLVE worktree repair
```

- [ ] Copy Claude's memory: `C:\Users\Victus\.claude\projects\D--Workspace-LOREX\memory` ->
      `C:\Users\Victus\.claude\projects\D--Workspace-LOREVOLVE\memory` (open one session in the new path first).
- [ ] `python -m graphify update .` in the new folder.
- [ ] Replace the remaining `Workspace\LOREX` paths in the repository (`git grep -n "Workspace.LOREX"`).
- [ ] Verify: `Start-LorEvolve.cmd` boots the app.

## 6. Done

- [ ] `git grep -in lorex` shows only the read-old fallbacks ADR 0067 lists (and that ADR). Delete this file.
