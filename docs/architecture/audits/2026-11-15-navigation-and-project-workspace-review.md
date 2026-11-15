# Navigation and project workspace review

Date: 2026-11-15. Branch reviewed: `dev` at `a9bbd201`, after #184 (PR #186) and #158 (PR #187) merged.

This reviews the owner's brief of 2026-11-15 on LorEvolve's navigation and information architecture
against the source as it stands. It is a review, not an implementation: nothing here changes behaviour.
The brief's own screenshots are treated as intent, not as a specification of pixels, as the owner asked.

The proposed work is listed in the last section and opened as issues under the M5 tracker. All of it waits
for M3 (#135) to finish. M4 (#136) finished on 2026-11-15, while this review was being written, so it no longer
blocks the pass; section 8 says what it covered.

## How to read this

Every claim below names the file and line it rests on. Each item in the owner's target structure is marked:

- **Done**: `dev` already does it.
- **Partly**: part of it is there, the rest is not.
- **Not done**: `dev` does not do it.

## What changed after the brief was written

The brief says of `ProjectPage.tsx` that it "renders ProjectSchema, ProjectEntries and, for Series/Film/Comic,
ProjectSeasons consecutively on the same page". That is still true: `src/LorEvolve.Web/src/pages/ProjectPage.tsx:253`,
`:258` and `:270-285`. What changed under #184 is the inside of those panels, not the stacking. Creation forms now
sit behind an action rather than standing open (`src/LorEvolve.Web/src/components/ProjectSchema.tsx:128`, `:142`),
and per row actions moved into the app's `ActionMenu` (`ProjectSchema.tsx:294`, `:361`).

So the page is shorter and quieter than the brief describes, but its structural problem is untouched. The case for
splitting it is now about navigation and addressability, not about form clutter. That matters for how the split is
scoped: it is a routing change, not a visual cleanup.

## 1. The sidebar

### All Universes, universe header, Overview

**Done.** The workspace rail draws the universe header and its sections from `SECTION_GROUPS`
(`src/LorEvolve.Web/src/pages/UniverseWorkspace.tsx:405-449`), with the front page as its own group
(`src/LorEvolve.Web/src/universes/sections.ts:36-42`).

### A WORLD BUILDING group holding Lore, Types, Family Tree, World Maps, Timeline, World Logic, Universe Ideas

**Not done.** Those seven destinations exist, but they are spread across three unlabelled groups:

- `WORLD` holds Lore, Types, Family Tree and Maps (`universes/sections.ts:45-66`).
- `RULES` holds World Rules, Canon and Chronology (`universes/sections.ts:69-86`).
- `WRITING` holds Stories, Timeline and Ideas (`universes/sections.ts:89-106`).

There is no World Logic section. The groups carry no labels at all, by an explicit decision recorded in the file:
"The worldbuilding groups carry no labels - the spacing says it" (`universes/sections.ts:144-147`). The brief's
mock-up labels every group. That is a deliberate reversal of a stated decision, so it should be made once, on
purpose, rather than as a side effect of regrouping.

### No duplicate Stories entry

**Not done.** `stories` is still a universe section (`universes/sections.ts:90-94`) with its own routes
(`src/LorEvolve.Web/src/App.tsx:284-301`), while the same stories also appear in the projects group as Writing
Projects, derived rather than copied (`src/LorEvolve.Api/Features/Projects/ProjectEndpoints.cs`, `ListAsync`, which
appends `StoryProjects.ReadableAsync`). An author sees one body of work in two places in one sidebar.

### A PROJECTS group with All Projects, the projects, New Project

**Done.** `ProjectsNav` draws exactly that: All projects (`src/LorEvolve.Web/src/components/ProjectsNav.tsx:70-84`),
one row per project (`:86-169`), New project (`:172-188`). It is placed above the upkeep group
(`UniverseWorkspace.tsx:413`).

### A MANAGEMENT group with AI Changes, Publish, Trash, Settings

**Partly.** All four exist, but in two groups: AI Changes sits alone in `REVIEW`
(`universes/sections.ts:109-116`) and the other three in `UPKEEP` (`:122-140`). The brief puts all four together
under one label.

### Project names expand to major views; chapters, scenes, maps and entities stay out

**Partly, and the rule does not hold as written.** See section 5.

## 2. What belongs where

| Brief's final home | State on `dev` | Evidence |
| --- | --- | --- |
| Lore at Universe > Lore | Done | `universes/sections.ts:47` |
| Types at Universe > Types | Done | `universes/sections.ts:52` |
| Family Tree at Universe | Done | `universes/sections.ts:57` |
| Maps at Universe > World Maps | Partly: the section is `maps`, labelled from `workspace.sections.maps` | `universes/sections.ts:62` |
| World Rules under World Logic > Rules | Not done: top-level `world-rules` | `universes/sections.ts:71` |
| World Systems under World Logic > Systems | Not done: no systems UI yet, M3 #150 and #152 | `universes/sections.ts:69-86` |
| Canon under World Logic > Integrity | Not done: top-level `canon`, marked `wip` | `universes/sections.ts:76-79` |
| Chronology under Timeline > Configuration | Not done: top-level `chronology` in the rules group | `universes/sections.ts:82` |
| Timeline at Universe > Timeline | Done | `universes/sections.ts:96` |
| Stories as Writing Projects, no duplicate universe area | Not done | `universes/sections.ts:90-94` |
| Manuscript inside the Writing project | Partly: it exists, reached through the story, not the project | `App.tsx:295-296` |
| Game entities at Game Project > Entities | Partly: entities exist, as a panel not a view | `ProjectPage.tsx:258` |
| Project Types at Project > Entity Types | Partly: they exist, stacked above the entries | `ProjectPage.tsx:253` |
| AI Changes under Management | Partly: present, in its own group | `universes/sections.ts:109-116` |

### Universe Types and Project Types share infrastructure but never share an editor

**Done.** They share the `EntityTypes` table and are separated by a project scope on the row:
`src/LorEvolve.Api/Features/ProjectEntities/ProjectEntityTypeEndpoints.cs:128` filters on
`type.UniverseId == project.UniverseId && type.ProjectId == project.Id`. The editors are different components,
`ProjectSchema.tsx` against the universe types screen. Nothing mixes them.

### World Maps and Game Maps stay separate

**Done by construction, untested.** A project map would be an entity of a project-defined type, which cannot reach
the universe maps feature at all. There is no shared surface where they could be confused. No work is needed; the
brief's concern is already satisfied by the scoping above.

## 3. The project workspace

### One page per concern instead of one stacked page

**Not done.** `ProjectPage.tsx` renders the header (`:211-246`), then `ProjectSchema` (`:253`), then
`ProjectEntries` (`:258`), then `ProjectSeasons` for Series, Film and Comic (`:270-285`). There is no tab bar
and no sub-route.

### Project-kind-specific views registered as data

**Not done.** `src/LorEvolve.Web/src/projects/sections.ts:20-26` declares exactly one section, the overview, and the
file's own comment says so: "Today a project has one page, its overview" (`projects/sections.ts:9`). The routes
match: `/app/projects/:projectId` and the universe-scoped twin have no child segments
(`App.tsx:177`, `App.tsx:281`).

### Writing and non-Writing projects share an entry point

**Not done, and confirmed in two places.** `projectRowPath` sends a project that has a `storyId` to the story's own
address (`projects/sections.ts:85-91`), and `ProjectsNav` gives that row no disclosure at all, by design: "A Story
shown as a Writing Project is one link to the story, with no disclosure" (`ProjectsNav.tsx:90-105`). So a Writing
project behaves unlike every other project in the same list.

### Entity Types reachable from inside Entities

**Not done.** They are a sibling panel above the entries, which is the exact scroll the brief objects to
(`ProjectPage.tsx:253-262`). The API supports the target shape; see section 6.

### Writing keeps its Structure and Manuscript editor

**Done, and worth protecting.** `StoryPage` serves `scenes`, `plot`, `manuscript` and `ideas` views
(`App.tsx:287`, `:291`, `:296`, `:300`). Any consolidation must keep these addresses working, not reimplement them.

### A per-project Ideas view

**Not done, and it is not a UI change.** `Idea` has `UniverseId` and reference rows for entities, stories, scenes
and plot arcs, but no project link at all (`src/LorEvolve.Api/Features/Ideas/IdeaModel.cs:34`, `:80-117`). A Writing
project can borrow the story's Ideas tab; a Game, Series, Film or Comic project has nowhere to put an idea. See the
disagreement in section 4.

## 4. Where I disagree with the brief

**The brief under-scopes project Ideas.** It lists "Consolidate Ideas scoping" as P2, grouped with breadcrumbs and
redirects, which reads as a UI tidy-up. It is not. `IdeaModel.cs:34` gives an idea a universe and nothing else, so
a Project Ideas tab needs a column, a migration, contract and MCP changes before any tab can be drawn. Either raise
it to P1 with its own backend issue, or drop the Ideas tab from the first consolidation pass and keep Writing's
existing story Ideas. The breakdown below takes the first option and gives it its own issue, because the mock-up
shows Ideas on every project kind.

**The brief over-credits M3 for World Logic.** It marks "Merge World Rules, Systems and Integrity under World Logic"
as "Already covered by M3". #152 does build the World Logic page with Rules, Systems and Integrity, and does expose
it in the sidebar, but its own scope section puts "unrelated navigation redesign" explicitly out of scope. So M3
will add a World Logic entry while leaving `RULES` as a group, Chronology inside it, and Canon addressable on its
own. The regrouping is left over, and the consolidation pass must do it after #152 lands, not instead of it.

**The brief's description of `ProjectPage` is one day stale.** It is right about the stacking and wrong about the
clutter, for the reason given at the top. Nothing in the plan changes because of this, but the issue that splits the
page should not propose moving creation forms behind actions: #184 already did that.

**The sidebar rule does not survive forty projects as written.** See section 5. I agree with the rule's intent and
disagree that it can be applied unconditionally.

**The product model tree omits two things it should show.** Universe Ideas and Chronology appear in the sidebar
mock-up and the feature table but not in the tree under Canonical World. Minor, but the tree is the thing later
readers will quote.

## 5. The sidebar rule at four projects and at forty

The rule is: project names expand to major views; chapters, scenes, maps and entities stay out of the sidebar.

**What `dev` does today.** `ProjectsNav` renders every project the account can reach in that universe
(`ProjectsNav.tsx:86`), expands only the project the author is in (`:87`), and keeps anything opened by hand open
until it is closed by hand (`:116`). The expansion lists `PROJECT_SECTIONS`, which is one entry
(`ProjectsNav.tsx:147`, `projects/sections.ts:20-26`). Nothing below a project's major views is in the sidebar, so
the second half of the rule already holds.

**At four projects the rule holds well.** Four rows, one of them expanded into four or five links: about nine rows
under the group, below the seven worldbuilding sections. That is the mock-up, and it is fine.

**At forty it does not.** Three things break, in order of severity:

1. The list is unpaged end to end. `listProjects` sends no limit (`src/LorEvolve.Web/src/projects/api.ts:13-19`) and
   the API returns every readable project, appends every readable Story as a Writing Project, and sorts the result
   in memory (`src/LorEvolve.Api/Features/Projects/ProjectEndpoints.cs`, `ListAsync`). Forty projects plus their
   stories is one unbounded payload on every workspace mount.
2. Forty rows push the MANAGEMENT group off the first screen even with everything collapsed, and each row is two
   lines, name and kind (`ProjectsNav.tsx:100-101`). The brief's own mock-up sets MANAGEMENT directly under the
   projects, which stops being true at roughly a dozen.
3. Opened state is unbounded and sticky (`ProjectsNav.tsx:43`, `:116`). An author who opens six projects keeps six
   expansions until they close them one at a time.

**Recommendation.** Keep the rule, bound the list. Show the most recently updated projects, say eight, plus the one
the author is in if it is not among them, and let All Projects carry the rest; that link already exists
(`ProjectsNav.tsx:70-84`). Give the PROJECTS group the collapse the mock-up draws, which is not implemented today.
Page `listProjects` when the bound is added, so the payload is bounded too, not only the rendering. This is listed
as its own issue rather than folded into the regrouping, because it is a behaviour change an author will notice.

## 6. Does M2's API support one Entities view with types inside it

**Yes, with no round trip per type, and with one caveat.**

The card grid in the owner's screenshot is a single request:

- `GET /api/projects/{projectId}/entity-types`, route name `ListProjectEntityTypes`
  (`src/LorEvolve.Api/Features/ProjectEntities/ProjectEntityTypeEndpoints.cs:44`, `:48`).
  It returns every type of the project with its icon, accent colour and `EntryCount`
  (`src/LorEvolve.Api/Features/ProjectEntities/ProjectEntityContracts.cs:41-51`). The count is not computed per
  type: one grouped query covers the whole project
  (`ProjectEntityTypeEndpoints.cs:145-149`), and the result is read from a dictionary at `:167`. So a project with
  six types costs one request and three queries in total, not six.

Opening one card is a second request:

- `GET /api/projects/{projectId}/entities?typeId={typeId}`, route name `ListProjectEntities`
  (`src/LorEvolve.Api/Features/ProjectEntities/ProjectEntityEndpoints.cs:36`), with the filter at `:51` and `:63`.
  Each row already carries its type's name, icon and accent colour and the linked canon entry's name
  (`ProjectEntityContracts.cs:67-77`), so the drill-in needs no join request either.

**The caveat.** Neither list is paged. `ListProjectEntities` applies the type filter and returns everything that
matches (`ProjectEntityEndpoints.cs:60-81`); there is no skip, take or cursor. For the card grid this does not
matter, because the grid reads counts from the types call. It matters for the drill-in: a type with a few thousand
entries ships all of them. Paging should land with the drill-in view, not after it, and it is listed as part of that
issue rather than as separate work.

**Conclusion.** The shape the owner drew is the shape the API already serves. Nothing in M2 has to change for the
Entities view itself.

## 7. Historical assumptions that a project may have no universe

The database correction is merged: `UniverseId` is non-nullable and documented as required
(`src/LorEvolve.Api/Features/Projects/ProjectModel.cs:41`, `:72`), by migration
`20261114154009_RequireProjectUniverse`. What remains is on the web side and in comments:

- `src/LorEvolve.Web/src/projects/types.ts:39` keeps `universe: ProjectUniverse | null` and `:60` keeps
  `universeId: string | null`.
- `ProjectPage.tsx:221-224` branches on the null and falls back to a "No universe" label
  (`src/LorEvolve.Web/src/i18n/en/projects.ts:43`).
- `ProjectPage.tsx:275` then passes `project.universe!.id` to `ProjectSeasons` with no guard. If the null the type
  allows ever arrived, the Series, Film and Comic structure panel would throw. It cannot arrive today, because the
  column is required, so this is a latent defect kept alive by a type that no longer matches the database rather
  than a live bug.
- `projects/sections.ts:67-68` still explains the account-level address by "a project may belong to no universe",
  and `projectPath` keeps the universe-free branch at `:72-77`. The address itself is worth keeping; the reason
  given for it is now wrong.
- `ProjectsNav.tsx:66-68` repeats the same reason.
- `ProjectPage.tsx:53-54` states the opposite, correct rule in the same file as the branch at `:221`.

The "No universe" strings under Ideas are not part of this: an idea genuinely may have no universe
(`IdeaModel.cs:34`), and those should be left alone.

## 8. What M3 and M4 already cover

Read from trackers #135 and #136 and their children on 2026-11-15.

**M3 (#135) covers**, and the consolidation must not propose again:

- The World Logic page itself, with Rules, Systems and Integrity views, old World Rule links kept valid, and a
  World Logic entry in the worldbuilding sidebar: #152, open, depends on #150.
- Systems persistence (#150), the condition evaluator (#151), integrity findings (#153), MCP rule workflows (#154)
  and the MCP parity audit (#155). All open. #149 merged in PR #183.

**M3 does not cover**: removing the `RULES` group, moving Chronology, labelling the groups, or any project-side
navigation. #152 lists "unrelated navigation redesign" as out of scope.

**M4 (#136) covers**: the legacy web assistant's removal. Every child merged on 2026-11-15, after this review was
first written: #156 in PR #182, #157 in PR #185, #158 in PR #187, #159 in PR #190 and #160 in PR #202. So M4 no
longer blocks this pass; only M3 does. The tracker itself stays open until the owner closes it. Connect to AI, MCP
and AI Changes are preserved on purpose, so the MANAGEMENT group must still carry AI Changes.

**M4 does not cover**: moving AI Changes into a labelled Management group, which is navigation.

**Neither covers**: everything in section 9.

## 9. Proposed task breakdown

One issue per pull request, ordered so that no issue depends on a later one. All of them wait for M3 (#135); M4's
children merged on 2026-11-15 and no longer block them. They are open under the M5 tracker, #201, which carries that
wait in its own Constraints section.

### P0

**1. Regroup the universe sidebar into Worldbuilding, Projects and Management, and drop the duplicate Stories entry.** (LOREX-032, #191)
Changes `src/LorEvolve.Web/src/universes/sections.ts` (group constants and `SECTION_GROUPS`),
`src/LorEvolve.Web/src/pages/UniverseWorkspace.tsx` (group labels and the narrow-layout sheet), the locale files, and
the workspace navigation E2E specs. Stories leaves the sidebar; `/app/universes/:id/stories` keeps working and keeps
its routes. Done when the sidebar shows three labelled groups in the brief's order, World Logic appears where M3 put
it, Chronology and Canon no longer stand as top-level entries, Stories appears only as a Writing Project, and the
navigation specs assert the new grouping.
Verification: `(cd src/LorEvolve.Web && npm run typecheck && npm run lint && npm run build)`, then the workspace
navigation E2E specs.

**2. Give a project its own sections and a workspace shell.** (LOREX-033, #192)
Changes `src/LorEvolve.Web/src/projects/sections.ts` (per-kind section lists and their labels),
`src/LorEvolve.Web/src/App.tsx` (child routes under both project addresses) and a new project shell component with a
tab bar, plus locale strings. No content moves yet: every new route renders what the overview renders today, so the
change is addressable navigation only. Done when each kind offers the brief's views as routes and as sidebar
expansions, the tab bar and the sidebar expansion never both show on a narrow viewport, and an unknown segment
redirects to the overview.
Verification: web checks as above, plus a new focused E2E spec for project navigation.

**3. Split the project page into its views.** (LOREX-034, #193)
Changes `src/LorEvolve.Web/src/pages/ProjectPage.tsx` to render one view per route rather than the stack at `:253`,
`:258` and `:270`, moving `ProjectEntries` to the Entities route and `ProjectSeasons` to Structure.
`ProjectSchema` moves with Entities under LOREX-037 (#196); until then it stays on the overview. Done when no route renders
more than one panel, the `schemaVersion` reload link between schema and entries still works, and the existing
project E2E specs pass with updated navigation steps.
Verification: web checks, project E2E specs.

**4. One entry point for every project kind.** (LOREX-035, #194)
Changes `src/LorEvolve.Web/src/projects/sections.ts` (`projectRowPath`), `ProjectsNav.tsx:90-105` (the disclosure
a Writing project does not get) and `App.tsx` so a Writing project opens its project shell, whose Structure,
Manuscript and Ideas tabs render the existing `StoryPage` views unchanged. Existing story URLs redirect to the
project equivalents and keep resolving, as #140 requires. Done when a Writing project and a Game project are reached
the same way, the manuscript editor is untouched, and old story links still open the right screen.
Verification: web checks, the story E2E specs, and the projects navigation spec.

### P1

**5. A real overview for non-Writing projects.** (LOREX-036, #195)
Changes the overview view from LOREX-034 (#193) to show what the brief's screenshot shows: recent entities, linked lore,
counts per type and a link into each major view. Reads `ListProjectEntityTypes` for the counts, which already carries
them. Done when the overview of a Game, Series, Film or Comic project shows its own content rather than a header and
nothing.
Verification: web checks, project E2E spec extended with the overview.

**6. Entity Types inside the Entities view.** (LOREX-037, #196)
Moves `ProjectSchema` from the overview into Entities as a secondary view reached by an action, so an author does
not scroll through definitions to reach content. Adds the type drill-in using
`GET /api/projects/{projectId}/entities?typeId=`, and pages that endpoint, since it returns every match today
(`ProjectEntityEndpoints.cs:60-81`). Done when the Entities view opens on the type cards, a card opens that type's
entries, the type editor is one action away, and a type with many entries loads a page at a time.
Verification: web checks, backend tests for the new paging parameters, project entities E2E spec.

**7. Project-scoped Ideas.** (LOREX-038, #197)
Adds a project link to `Idea` (`src/LorEvolve.Api/Features/Ideas/IdeaModel.cs`), the migration, the contract and
endpoint changes under `Features/Ideas`, the MCP tools that expose ideas, and the project Ideas view. Writing
projects keep the story Ideas they have. Done when an idea can belong to a project, a universe, or neither as it can
now, no existing idea is changed by the migration, and the backup and restore paths account for the new link.
Verification: `dotnet test` on the idea test classes, web checks, ideas E2E spec.

**8. Bound the sidebar project list.** (LOREX-039, #198)
Changes `ProjectsNav.tsx` to show a fixed number of projects plus the one in view, with the rest behind All
Projects, to give the PROJECTS group a collapse, and `projects/api.ts` with `ProjectEndpoints.ListAsync` to page the
list. Done when a universe with forty projects draws a bounded sidebar, the payload is bounded too, and the author's
current project is always present.
Verification: web checks, backend tests for the paging parameters, a sidebar E2E spec seeded with more projects than
the bound.

### P2

**9. Normalize project addresses, breadcrumbs and legacy redirects.** (LOREX-040, #199)
Settles one canonical address per project view, redirects the other, and puts a breadcrumb on the project shell.
Also clears the stale no-universe assumptions listed in section 7: `projects/types.ts:39` and `:60`, the branch at
`ProjectPage.tsx:221-224`, the unguarded `project.universe!.id` at `:275`, and the comments at
`projects/sections.ts:67-68` and `ProjectsNav.tsx:66-68`. Done when a project view has one address, every old
address redirects, and no web type or comment says a project may lack a universe.
Verification: web checks, the full project and story E2E specs.

**10. Chronology under Timeline.** (LOREX-041, #200)
Moves the chronology screen to a configuration view of Timeline and redirects the old address. Done when chronology
is reached from Timeline, the old link still resolves, and the sidebar has one fewer top-level entry.
Verification: web checks, chronology E2E spec.

## Open questions for the owner

1. The group labels reverse an explicit decision recorded at `universes/sections.ts:144-147`. Confirmed as intended?
2. Ideas on every project kind needs the schema change in LOREX-038 (#197). If that is too much for this pass, the Ideas tab
   can be dropped for non-Writing projects and the pass shrinks by one issue.
3. The sidebar bound in LOREX-039 (#198) is a visible behaviour change. Eight projects is a guess; the owner may prefer a
   different number or no bound at all.
