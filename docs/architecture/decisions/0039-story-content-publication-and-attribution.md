# ADR 0039 - A story's parts are published one by one on its own page; a world may credit the work it is based on

Status: accepted (2026-09-29)

## Context

Product refinement 015. A published story (ADR 0036, Task 011) was a landing page: title, public summary, author. Readers
had nothing to read. The Story domain already has its units (ADR 0024-0027): scenes, optionally grouped by chapters; one
plain-text manuscript per scene; plot arcs with ordered beats. Nothing about them was publishable, and Task 011 deferred
"public story prose" pending a decision about chapters and scenes.

Separately, a fan or reference universe - the owner's Lord of the Rings pilot - was presented as its LorEvolve author's own
creation, with no honest way to credit the original creator.

## Decision

**Three selections, on the units that already exist.** No new chapter, manuscript or plot model.

- `Scenes.Visibility` - the scene's **outline**: its title and summary.
- `Scenes.ManuscriptVisibility` - the scene's **prose**, read under the scene's title. Independent of the outline: a
  reference world publishes outlines with no prose; a novelist may publish prose without the planning summary.
- `PlotArcs.Visibility` - the **arc**: title, description, and its live beats' titles and descriptions. Per arc, because
  plot is planning and often spoils: an author publishes one thread and keeps another. Nothing else ever publishes plot.

All `ContentVisibility`, `Private` by default; the migration (`AddStoryContentPublication`) leaves every existing row
private. Set only by `POST .../stories/{s}/scenes/{id}/publish|unpublish`, `.../scenes/{id}/manuscript/publish|unpublish`
and `.../plot-arcs/{id}/publish|unpublish`: owner-scoped, idempotent, live part of a live story only, not an edit (no
`UpdatedAt`, history or search). They answer `StoryPartPublicationState` (`visibility`, `storyIsPublic`).

**Effective visibility has three levels, in one predicate each.** `PublicationRules.PublicScenes`, `PublicManuscripts` and
`PublicPlotArcs` each hold `PublicStories` (which holds `Public`), so a part is readable only while its universe is public,
its story is public (selected, summarised, live) and the part is selected and live. A private parent hides and clears
nothing; republishing brings back exactly what was selected.

**Read on the story's page, not at addresses of their own.** `GET /api/public/universes/{slug}/stories/{storySlug}` is now
`PublicStoryDetail`: the listing plus `manuscript` (`title`, `text`), `scenes` (`title`, `summary`) and `plot` (`title`,
`description`, `beats[]` of `title`, `description`) - allow-lists, projected member by member, five queries. Reading order
is the workspace's (Unchaptered, then chapters in order, each by its own order); arcs by arc order, beats by beat order.
Empty prose is left out. No part has a slug, so no second address, no SEO or sitemap change, and nothing new to mint.
**No chapter is published**: its title and number would be structure nobody chose to show, so parts read as one ordered
sequence. No counts, ids, notes, points of view, dates, lore or scene/beat links.

**Attribution is the universe's, and the LorEvolve author stays the author of record.** `Universes.OriginalCreator` (120) and
`OriginalWork` (200), saved with the public details: `basedOnExternalWork: true` requires the creator (trimmed, no invisible
controls, as a public name); `false` clears both; omitted keeps them. `PublicUniverse` gains `originalCreator` and
`originalWork` (null for an original world). The portal then says "Based on works by {creator} · {work}", "Curated on LorEvolve
by {author}" and "Unofficial fan or reference project. Not affiliated with or endorsed by the original creator." The
original creator is text: never a link, never an account, never an author page; only the LorEvolve author links. Explore's `q`
also matches the creator and work. The LorEvolve author's `PublicDisplayName` is never replaced by the creator's name - that
would make an account appear to be someone it is not.

**Backup format 17** carries the attribution (authored text a v16 reader would drop, crediting nobody). No version carries
a part's selection, as none carries an entry's or story's: every restored scene, prose and arc is private. v1-16 restore as
original worlds; a v17 file naming a work without a creator is refused.

## Consequences

- A long story's published prose is one response and one page. Bounded by what authors publish (1M characters per scene).
  A per-scene reader route with its own slug is the upgrade path if that proves heavy.
- Chapter headings are not shown publicly. Publishing them would need a chapter selection of its own.
- Restoring a trashed selected scene or arc from the Trash makes it public again if its story is; the Trash's
  "Restore and publish?" question (Task 012) covers entries and stories only.
- Attribution makes no claim about whether a derivative project is permitted; it only credits.
