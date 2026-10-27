# TODO - finish the LorEvolve rename outside the code

The code, docs and images are renamed (ADR 0067). Steps 0-4 are done; what is left is cleanup and the local folder.
Delete this file when everything is ticked.

## Done 2026-10-27

- [x] Rename merged into `dev` and deployed.
- [x] Local dev database moved to `src/LorEvolve.Api/App_Data/lorevolve.dev.db`.
- [x] GitHub repository renamed to `luisfpires18/lorevolve`; `origin` updated.
- [x] Azure federated credential `github-lorevolve-dev` added (subject
      `repo:luisfpires18@29492601/lorevolve@1359933673:environment:dev`); deploys sign in under the new name.
- [x] R2: `lorevolve-media-dev` created, 36 objects copied and checked; app token `lorex-dev` covers it; DEV uses it.
- [x] DEV moved to **https://dev-lorevolve.azurewebsites.net** (same resource group and Free plan): settings copied
      (`Mcp__Origin`, `AllowedHosts` set to the new host), database and Data Protection keys copied to
      `/home/data/lorevolve.db` and `/home/data/keys`, `AZURE_WEBAPP_NAME` changed at repository **and** `dev`
      environment level. Deploys are clean now (`type: ZIP`, `clean: true`).

## Cleanup - when you are happy with the new DEV

Each is safe to do on its own, in any order.

- [ ] Delete the old app `lorex-dev-lfp18` (stopped). It frees most of the Free plan's shared 1 GB:

```bash
az webapp delete -g rg-lorex-dev -n lorex-dev-lfp18 --keep-empty-plan
```

- [ ] Remove the old federated credential:

```bash
az ad app federated-credential delete --id 5b627c11-0050-4130-a062-4f41b7d02ed1 --federated-credential-id github-lorex-dev
```

- [ ] Cloudflare R2: on the `lorex-dev` token remove bucket `lorex-media-dev`, then delete the bucket. The copy-only
      token `lorevolve-dev` expires by itself (2026-10-28); delete it any time.
- [ ] Drop the now-redundant app setting `ConnectionStrings__LorEvolveDb` on `dev-lorevolve` (the code's
      `appsettings.AzureDev.json` names `/home/data/lorevolve.db` itself).
- [ ] Local: delete the leftover untracked `D:\Workspace\LOREX\src\Lorex.Api\` (~520 MB: old test databases, `bin`,
      `obj`) and `D:\Workspace\LOREX\.lorex\` (old launcher logs).
- [ ] AI apps connected to the old address: remove them and connect again to the new one.
- [ ] Optional names that still say lorex but nobody sees: resource group `rg-lorex-dev`, plan
      `lorex-dev-lfp18-plan`, R2 token `lorex-dev`. Renaming any of them means recreating it; leaving them is fine.

## Local folder (last; close every Claude session and editor on the repo first)

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

## Done

- [ ] `git grep -in lorex` shows only the read-old fallbacks ADR 0067 lists, the `lorex-recovery` drafts database, and
      the names above you chose to keep. Delete this file.
