# M4 audit: retiring the legacy web assistant

Issue [#156](https://github.com/luisfpires18/lorevolve/issues/156) (LOREX-024), tracker
[#136](https://github.com/luisfpires18/lorevolve/issues/136). Investigation only: this audit changes no runtime code,
no table and no configuration. It is the prerequisite for #157, #158, #159 and #160, and it decides what each of them
may remove.

Audited at `origin/dev` `ec89d3b` on 2026-11-15. Every path below was verified to exist in the repository at that
commit; file sizes and line numbers are from it.

The provider in question is **Groq** (`console.groq.com`, an OpenAI-compatible Responses API), not xAI's Grok. Nothing
in the repository references xAI.

## 1. What the web assistant is today

ADR 0045 (`docs/architecture/decisions/0045-universe-assistant.md`) is the deciding record, amended by ADR 0047 for
propose mode. The assistant is a drawer beside the universe search: an account asks a question, the server runs up to
seven model calls over read-only tools, and in propose mode it stages an AI change proposal for review.

It is **live on DEV today**, not dead code. Read from Azure on 2026-11-15, names and non-secret values only:

```text
az webapp config appsettings list -g rg-lorevolve-dev  -n dev-lorevolve  --query "[].name" -o tsv
az webapp config appsettings list -g rg-lorevolve-prod -n prod-lorevolve --query "[].name" -o tsv
```

| Host | Assistant app settings | Provider |
| --- | --- | --- |
| DEV `dev-lorevolve` | `Assistant__Provider`, `Assistant__Groq__ApiKey`, `Assistant__Groq__Model`, `Assistant__OpenAI__ApiKey`, `Assistant__OpenAI__Model` | `Groq`, model `openai/gpt-oss-120b` (an OpenAI model name, `gpt-6-luna`, is also stored but unused while the provider is Groq) |
| PROD `prod-lorevolve` | none | the assistant has never been switched on in production |

No key value was read or printed. Two secrets exist on DEV (`Assistant__Groq__ApiKey`,
`Assistant__OpenAI__ApiKey`); both become unused when the feature goes, and both are owner actions (section 7).

PROD having no `Assistant__*` setting is the single most useful fact in this audit: retiring the feature cannot regress
production behaviour, because production already answers "the assistant is not set up on this LorEvolve".

## 2. Inventory and ownership

"Assistant-only" means nothing outside `Features/Assistant` or the assistant UI reads it. "Shared" means something that
survives M4 depends on it.

### 2.1 Backend (`src/LorEvolve.Api`)

| Path | Lines | Ownership | Note |
| --- | --- | --- | --- |
| `Features/Assistant/AssistantSetup.cs` | 78 | assistant-only | `AddLorEvolveAssistant`, provider choice, allowance constants, `assistant_rate_limited` |
| `Features/Assistant/AssistantEndpoints.cs` | 214 | assistant-only | the only assistant routes (section 2.5) |
| `Features/Assistant/AssistantContracts.cs` | 70 | assistant-only | request, answer, segments, sources |
| `Features/Assistant/AssistantProvider.cs` | 111 | assistant-only | `IAssistantProvider`, failures, the unavailable provider |
| `Features/Assistant/AssistantAllowance.cs` | 129 | assistant-only | **in-process memory only**, no table; also `AssistantLine` and the usage records |
| `Features/Assistant/AssistantTools.cs` | 467 | assistant-only | the assistant's own tool set, separate from the MCP tools |
| `Features/Assistant/AssistantProposals.cs` | 313 | assistant-only | stages through the shared `AiChangeStaging`, which stays |
| `Features/Assistant/UniverseAssistant.cs` | 349 | assistant-only | the conversation, the brief, `ReadOnlyRule` |
| `Features/Assistant/ResponsesConversation.cs` | 381 | assistant-only | the only `OpenAI.Responses` conversation code |
| `Features/Assistant/OpenAIAssistantProvider.cs` | 33 | assistant-only | |
| `Features/Assistant/GroqAssistantProvider.cs` | 59 | assistant-only | |
| `Features/Assistant/FakeAssistantProvider.cs` | 300 | assistant-only | drives the Playwright suite (section 4) |
| `Program.cs` | 3 lines | shared file | `using` line 5, `AddLorEvolveAssistant` line 80, `MapAssistantEndpoints` line 187 |
| `LorEvolve.Api.csproj` line 17 | 1 line | assistant-only package | `OpenAI` 2.14.0, pinned in `Directory.Packages.props` line 25 |

Nothing outside the feature folder references an Assistant symbol. Verified:

```bash
grep -rn --include=*.cs -E "Assistant" src/LorEvolve.Api | grep -v "^src/LorEvolve.Api/Features/Assistant/" | grep -v Migrations/
# Features/AiChanges/AiChangeModel.cs:14:    Assistant = 1,
# Program.cs:5, Program.cs:80, Program.cs:187
```

`Features/Mcp/LorEvolveMcpTools.cs` and `LorEvolveMcpMapTools.cs` mention the assistant in prose only ("the tools the
built-in assistant uses, and nothing of the assistant itself"); the MCP tool set is its own code. `Features/AiChanges`
mentions it in comments plus the one enum member below.

The `OpenAI` NuGet package has exactly three consumers, all inside `Features/Assistant`
(`GroqAssistantProvider.cs`, `OpenAIAssistantProvider.cs`, `ResponsesConversation.cs`), plus the skipped smoke test.
`ModelContextProtocol.AspNetCore` is MCP's and unrelated.

### 2.2 Persisted state

| Store | Classification | Decision |
| --- | --- | --- |
| `UniverseAiHelpOff` table (`Features/Universes/UniverseAiHelpOff.cs`, migration `20261028112828_AddUniverseAiHelpOff`) | **shared, and author-owned** | **keep** |
| `AiChangeProposals.Source = AiChangeSource.Assistant` (value `1`) | **shared, historical author data** | **keep the enum member and its number** |
| assistant allowance and usage counters | nothing persisted | no migration needed |
| conversations, questions, answers | nothing persisted | the assistant never stored a turn; `store: false` at the provider |

`UniverseAiHelpOff` is not assistant-only, despite the name. Its own summary says it hides "the assistant, Connect to AI
and AI Changes", and the code proves it after the assistant is gone:

- `src/LorEvolve.Web/src/pages/UniverseOverview.tsx:83` gates **Connect to AI** (the MCP connect dialog) on
  `universe.aiHelp`.
- `src/LorEvolve.Web/src/universes/sections.ts:177` hides the **AI Changes** workspace section when `aiHelp` is false.

So a row in that table is an author's choice about MCP and AI Changes as much as about the assistant, and dropping it
would silently turn MCP discovery and the AI Changes section back on for every universe whose owner switched them off.
**#159 must not drop it.** The row is also not carried in a backup by design
(`tests/LorEvolve.Api.Tests/BackupInventoryTests.cs:137`, classified as "a workspace display preference"), and
`LaterSchema.cs:337` lists its table and index as later schema, so restore and the rollback tests already account for
it. None of that changes in M4.

`AiChangeSource.Assistant` is written into rows that authors reviewed. The review UI already has words for it
(`src/LorEvolve.Web/src/i18n/en/review.ts:12`, "LorEvolve Assistant"). Renumbering or deleting the member would
relabel or break historical proposals, so both stay; only the prose around them may be marked as retired.

**Consequence for #159: there is no assistant-only table or column to retire.** Its acceptance criteria are satisfied
by proving ownership and leaving the schema alone, not by writing a drop migration. See section 6.

### 2.3 Configuration

| Path | Content |
| --- | --- |
| `src/LorEvolve.Api/appsettings.json` lines 17 to 28 | the whole `Assistant` block: `Provider`, `OpenAI:ApiKey`, `OpenAI:Model`, `Groq:ApiKey`, `Groq:Model`, all empty |
| `src/LorEvolve.Api/appsettings.Development.json` lines 20 to 22 | `Assistant:Provider = Fake` |
| DEV App Service | the five settings in section 1 |
| PROD App Service | none |
| `.github/workflows` | no assistant or Groq reference at all (verified by grep) |

No committed file holds a key. The empty strings in `appsettings.json` are placeholders only.

### 2.4 Web (`src/LorEvolve.Web/src`)

| Path | Lines | Ownership |
| --- | --- | --- |
| `components/UniverseAssistant.tsx` | 582 | assistant-only (the drawer, including the propose toggle and the proposal review link) |
| `components/AssistantUsage.tsx` | 138 | assistant-only (the Profile's AI Assistant allowance) |
| `assistant/api.ts` | 110 | assistant-only |
| `assistant/types.ts` | 87 | assistant-only |
| `i18n/en/assistant.ts`, `i18n/pt-PT/assistant.ts` | 179, 182 | assistant-only, imported by `i18n/en.ts:10` and `i18n/pt-PT.ts:10` |
| `i18n/*/account.ts` `assistant` block | 2 keys | assistant-only (Profile usage heading) |
| `i18n/*/apiErrors.ts` lines 113 to 117 | 4 keys | assistant-only, **but bound by a contract test** (section 4) |
| `pages/UniverseWorkspace.tsx:6,474` | 2 places | shared file, assistant-only lines |
| `pages/ProfilePage.tsx:3` | 1 import plus its section | shared file |
| `i18n/en/admin.ts:39` | 1 string | assistant-only ("Assistant questions are counted in memory only") |
| `i18n/*/universe.ts` `aiHelpHint` | 1 string | **shared**, needs rewording, not deleting: the toggle still governs Connect to AI and AI Changes |
| `i18n/en/entity.ts:131`, `i18n/en/places.ts:326,328` | 3 strings | **shared prose** that names the assistant; reword, do not delete the keys |
| `i18n/*/review.ts:12,41,51` | 3 strings | **shared**: line 12 labels historical proposals and must keep working; 41 and 51 tell the author how to propose and must stop naming the assistant |
| `styles.css` assistant rules | CSS | assistant-only, remove with the drawer |
| `universes/sections.ts`, `universes/types.ts`, `components/UniverseForm.tsx`, `pages/UniverseSettings.tsx` | the `aiHelp` flag | **shared**, keep |

`ConnectToAi.tsx`, `aiChanges/`, `mcp/api.ts` and `pages/AiChangesPage.tsx` matched the search on the word "AI" only.
They are MCP and AI Changes, out of scope, and must keep working.

### 2.5 Routes to be removed

Both are registered in `Features/Assistant/AssistantEndpoints.cs`:

| Route | Method | Line |
| --- | --- | --- |
| `/api/universes/{universeId:guid}/assistant` | GET (status) | 43 |
| `/api/universes/{universeId:guid}/assistant` | POST (ask) | 44 |
| `/api/profile/assistant-usage` | GET | 47 |

After #158 all three must answer 404. The refusal codes that disappear with them are `assistant_unavailable`,
`assistant_busy`, `assistant_timeout`, `assistant_failed` (`AssistantEndpoints.cs`) and `assistant_rate_limited`
(`AssistantSetup.cs`).

## 3. Preserved boundaries

Nothing below may change in M4. Each line names the test that proves it still works.

| Preserved | Where | Dependency test |
| --- | --- | --- |
| MCP OAuth: registration, PKCE, consent, token, refresh, scope narrowing | `Features/Mcp/`, `Features/Auth/` | `McpProposalTests`, `McpToolTests`, E2E `mcp-connect.spec.ts` |
| MCP read tools, including maps and projects | `Features/Mcp/LorEvolveMcpTools.cs`, `LorEvolveMcpMapTools.cs`, `LorEvolveMcpProjectEntityTools.cs` | `McpToolTests`, `MapGeographyTests` (the MCP half) |
| MCP proposals: `propose_changes`, options, read | `Features/Mcp/LorEvolveMcpProposalTools.cs` | `McpProposalTests` |
| AI Changes staging, review, approval, commit | `Features/AiChanges/` | `AiChangeTests`, `AiChangeMigrationTests`, E2E `ai-changes.spec.ts` |
| Connected apps and the `aiHelp` gate on them | `Features/Mcp/ConnectedAppEndpoints.cs`, `UniverseOverview.tsx` | `UniverseAiHelpTests`, E2E `ai-changes.spec.ts` (the connected-app test) |
| Universe search, lore reading | `Features/Search/`, `Features/Reading/` | `universe-search.spec.ts`, API search tests |
| Backup, restore, migration fingerprints | `Features/Export/`, `LaterSchema.cs`, `BackupInventoryTests.cs` | `BackupInventoryTests`, the migration tests, E2E `restore.spec.ts` |

## 4. Test and operations implications

### 4.1 Assistant-only test files (delete with the code)

`AssistantTests.cs` (840), `AssistantUsageTests.cs` (225), `AssistantRateLimitTests.cs` (139),
`AssistantOpenAISmokeTests.cs` (139, skipped unless a key is in the environment), `GroqAssistantProviderTests.cs` (451),
`OpenAIAssistantProviderTests.cs` (230), `ScriptedAssistantProvider.cs` (57, the test double).

### 4.2 Mixed test files (surgery, not deletion)

| File | What depends on the assistant | What to do |
| --- | --- | --- |
| `LorEvolveApiFactory.cs:46,109 to 112` | the `IAssistantProvider` replacement seam | remove the seam with the last test that uses it |
| `McpProposalTests.cs:227` `The_assistant_proposes_only_in_propose_mode_through_the_same_review`, and `:265` asserting both sources are listed together | the whole test asks the assistant over HTTP | keep the MCP half; the two-source assertion must either seed an `Assistant` row directly or be dropped, and the test renamed |
| `MapGeographyTests.cs:327,383` | two tests drive map tools through the assistant | the MCP map tools already cover the same ground at `:402`; fold the assertions that matter into the MCP path and delete the assistant ones |
| `ApiErrorCodeContractTests.cs` | asserts the API's codes and `apiErrors.ts` agree | the five assistant codes and the four web strings must go in the same PR, or this test fails |
| `UniverseAiHelpTests.cs` (34) | nothing; it tests the flag | keep, and keep it meaningful: it now proves the Connect to AI and AI Changes gate |
| `BackupInventoryTests.cs:137`, `LaterSchema.cs:337` | `UniverseAiHelpOff` classification | unchanged, because the table stays |

### 4.3 The E2E problem, and it is the real one

Four Playwright specs stage AI change proposals **through the assistant drawer** on the Fake provider. They are the
only end-to-end coverage of staging, review, partial approval and schema and picture proposals:

| Spec | Lines | How it stages |
| --- | --- | --- |
| `universe-assistant.spec.ts` | 273 | the assistant itself; delete with the feature |
| `account-usage.spec.ts` | 309 | asks a question to make the Profile allowance move; the AI Assistant half of the Usage section goes, Storage stays |
| `ai-changes.spec.ts` | 412 | `page.getByRole('button', { name: 'Assistant' })` then `assistant-ask` (line 74 onward) |
| `ai-content.spec.ts` | 232 | the same drawer (line 56 onward) |
| `ai-schema.spec.ts` | 202 | the same drawer (line 42 onward) |

Removing the drawer therefore breaks the staging step of `ai-changes`, `ai-content` and `ai-schema`, which are exactly
the regressions the tracker says must keep passing. Deleting that coverage is not acceptable, so #157 has to replace
the staging step rather than remove it.

The replacement already exists in pieces. `ai-changes.spec.ts:329` performs the full OAuth dance in Playwright and ends
holding an access token with `lorevolve.propose`, and `tests/LorEvolve.Api.Tests/McpTestClient.cs` shows the shape of a
raw JSON-RPC call against `/mcp/universes/{id}` (`McpTestClient.McpPath`), with the proposal tool names in
`LorEvolveMcpProposalTools`. So the recommended approach for #157 is one shared helper in the E2E suite, for example
`specs/support/propose-over-mcp.ts`, that registers a client, approves `lorevolve.propose`, and posts
`tools/call` for `propose_changes` with `Accept: application/json, text/event-stream`. The three specs then keep every
assertion they have about review, approval and application, and change only how the proposal arrived. A proposal staged
this way has `Source = Mcp`, so the two assertions that read `'LorEvolve Assistant'` as the source
(`ai-changes.spec.ts:112,245`) become the MCP wording `review.ts:13,14` already has: `{name} (connected app)`, or
`A connected app` when the client has no name.

Estimated cost: one helper of about 80 lines, plus three small edits per spec. That belongs in #157 with the UI removal,
because that is the PR that breaks them.

### 4.4 Operations

`SYSTEMS.md` describes the feature in rows 264 to 275 (one per assistant file), plus row 320 and row 321 for the two
`appsettings` files and row 389 for `src/assistant/`. Rows 22, 121, 218, 227 and 409 name the assistant inside entries
about the maps checklist, `MapGeography.cs`, `ManuscriptMentions.cs`, `AiChangeModel.cs` and `RequestLanguage`, and
those are shared code that stays, so their wording is edited, not removed. Row 273 is also stale today: it says the
allowance is "20 questions in 10 minutes" while `AssistantSetup.cs` has 10 ask and 5 propose questions an hour. The row
goes with the feature, so #160 settles it by deletion.

`docs/deployment/assistant-limits-and-cost.md` (the whole file) is about the assistant's windows, Groq's free tier and
its line. It is obsolete once the feature goes. `docs/deployment/azure-dev.md:228 to 233` documents the
`Assistant__*` settings, and `docs/deployment/azure-prod.md:58` lists `Assistant__*` as an optional setting. Those are
#160's.

ADR 0045 must be marked superseded rather than deleted (`docs/architecture/decisions/README.md` indexes it), and ADR
0047's two entry points become one. Audits and history under `docs/architecture/audits/` and `docs/history/` are records
of what was true at the time and are not edited.

## 5. Conflicting in-flight work

Checked on 2026-11-15 against every open PR and every remote branch.

- Open PRs #74, #75, #76, #80 and the four dependabot PRs: none touches an assistant, Groq or `aiHelp` path (verified
  with `gh pr view <n> --json files`).
- The M3 session is working in parallel on `Features/CanonIntegrity/`, new Systems feature folders, the MCP tools and
  the World Logic pages. No overlap with this inventory, except that both milestones add migrations, so M4 rebases on
  `dev` before each merge. #159 adds no migration (section 2.2), which removes that risk entirely for the one task
  where it would have mattered.
- `feat/ai-help-off-by-default` (local only, one commit `3f32588`, "New universes start with AI help off", listed in
  `.ai/STATE.md` under "Committed, not on dev"): this is the one real conflict. It changes the default of the flag M4
  keeps. It is the owner's to merge or drop, and M4 neither merges nor deletes it. If it is ever merged after M4, its
  wording will need the same rewrite as `aiHelpHint`.
- `feat/desktop-edition` (PR #76) is large but assistant-free.

No branch must be rebased or edited by M4.

## 6. Removal plan

One PR per issue, in this order, each off `dev`.

**#157, the web UI.** Delete `components/UniverseAssistant.tsx`, `components/AssistantUsage.tsx`, `assistant/api.ts`,
`assistant/types.ts`, both `i18n/*/assistant.ts` files and their imports, the `account.ts` assistant block, the
`admin.ts:39` string and the assistant CSS. Remove the render at `UniverseWorkspace.tsx:474` and the import at line 6,
and the Profile section at `ProfilePage.tsx:3`. Keep the `aiHelp` flag, its form control and its settings row, and
reword `aiHelpHint`, `review.ts:41,51`, `entity.ts:131` and `places.ts:326,328` so they no longer promise an assistant.
Delete `universe-assistant.spec.ts`, cut the AI Assistant half of `account-usage.spec.ts`, and move
`ai-changes.spec.ts`, `ai-content.spec.ts` and `ai-schema.spec.ts` onto the MCP staging helper of section 4.3. Leave
`apiErrors.ts` alone in this PR: those four strings pair with server codes that still exist until #158, and
`ApiErrorCodeContractTests` checks that pairing.

**#158, the API and the providers.** Delete `Features/Assistant/` whole, the three `Program.cs` lines, and the `OpenAI`
package reference in `LorEvolve.Api.csproj` and `Directory.Packages.props`. Delete the seven assistant-only test files
of 4.1 and the factory seam, do the surgery of 4.2 on `McpProposalTests` and `MapGeographyTests`, and in this PR remove
the four `apiErrors.ts` strings together with their server codes. Prove the three routes answer 404.

**#159, persistence.** Per section 2.2 there is nothing to drop: no assistant-only table, column or row exists, the
allowance was always in memory, and `UniverseAiHelpOff` and `AiChangeSource.Assistant` are both shared and
author-owned. The task is to prove that, with `dotnet ef migrations has-pending-model-changes` clean, the migration,
backup and restore suites green, and `BackupInventoryTests` and `LaterSchema` unchanged. Record the retention decision
for both items in the PR. If the owner would rather drop `UniverseAiHelpOff` and lose every author's choice, that is a
scope change and needs their word (section 7).

**#160, configuration and docs.** Remove the `Assistant` block from `appsettings.json` and the `Assistant:Provider`
line from `appsettings.Development.json`, so no assistant setting is needed to boot. Retire
`docs/deployment/assistant-limits-and-cost.md`, cut `azure-dev.md:228 to 233` and the `azure-prod.md:58` row, update
`SYSTEMS.md` (its rows are listed in section 4.4; `.ai/PROJECT.md` names the assistant nowhere), mark ADR 0045
superseded, and add the MCP-only verification checklist. Explain,
rather than delete, every remaining "Assistant" or "Groq" string: the `AiChangeSource.Assistant` member, the
"LorEvolve Assistant" review label, the ADRs and the dated audits and history.

## 7. Owner decisions and owner actions

Nothing here blocks M4; the plan above proceeds without any of it.

1. **DEV app settings (action).** Delete `Assistant__Provider`, `Assistant__Groq__ApiKey`, `Assistant__Groq__Model`,
   `Assistant__OpenAI__ApiKey` and `Assistant__OpenAI__Model` from `dev-lorevolve` after #160 merges. An unknown
   setting is harmless to the app, so the order is safe either way.
2. **Keys (action).** Revoke the Groq API key at `console.groq.com` and the OpenAI key at `platform.openai.com` once
   those settings are gone. They are the only two secrets this milestone orphans.
3. **`UniverseAiHelpOff` (decision, default taken).** Kept, with its toggle, because it still governs Connect to AI and
   the AI Changes section. Say so if you would rather the toggle and the table went and those two were always offered.
4. **`feat/ai-help-off-by-default` (decision, untouched).** Still unmerged and still yours to merge or drop.
5. **Checks deferred to the milestone end.** On DEV after M4: no Assistant button beside a universe's search, no AI
   Assistant block in the Profile's Usage section, Connect to AI still offered on a universe's front page, the AI
   Changes section still listed, a proposal from a connected AI app still reviewable and applicable, and the AI help
   toggle in universe settings still hiding the last two.
