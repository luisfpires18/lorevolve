# ADR 0020 - An entity type's icon is a key from a closed, built-in set

Status: accepted (2026-09-11)

## Context

The Lore browser filtered by type through a plain `<select>`. It was replaced by a row of chips, and
a chip wants an icon. Entity types are the author's own - a world may have "Character" and
"Kingdom", or "Starship", "Dynasty" and "Rumour" - so whatever draws those icons cannot know in
advance what the types are.

Two shortcuts were available and both are wrong for the same reason ADR 0011 refused name matching
for field meanings. Guessing an icon from a type's name ("Kingdom" gets a crown) fails for every name
nobody anticipated, in every language, and silently changes when a type is renamed. Letting an author
upload an icon turns a label into media: storage, sanitising (SVG is refused for pictures in ADR 0019
for exactly this reason), and a second image pipeline for a glyph.

`EntityType.Icon` already existed: a nullable string of up to 40 characters, documented as an icon
identifier chosen by the client. The seven starter types were seeded with `character`, `location`,
`organization`, `event`, `item`, `species` and `concept`. No client ever set or drew it, and the API
accepted any short string.

## Decision

**The existing column is the icon key; no second one is added.** `EntityType.Icon` holds one key from
`EntityTypeIcons.Keys`, or null. The contract member stays `icon` on the type and `entityTypeIcon` on
cards and entries, and the backup's `icon` stays where it was. A new `IconKey` column beside it would
have been two fields meaning one thing.

**The set is closed, and the API enforces it.** Create and update trim the value, treat blank as none,
and refuse anything that is not exactly a key - a name, a differently cased key, markup or a URL - with
a validation problem on `icon`. The web client ships the same list (`src/lore/typeIcons.ts`) and draws
each key with one glyph from `lucide-react`.

**A key is a picture, never a meaning.** Nothing reads it except the screen that draws it. It is not
Canon semantics (ADR 0011), and no rule, search or export decision depends on it. Picker labels name
the picture ("Crown", "Map pin"), not a kind of lore.

**Nothing is ever inferred.** A type has the icon its author chose or none. The only icons not chosen
by an author are the starter types', and those are data written by `EntityTypeDefaults` - never a
lookup from a name. A type with no icon, or with a key a given build does not know, draws a neutral
generic shape.

**The seeded keys keep their names.** The first seven keys are exactly the values the starter types
were always seeded with, so every stored type and every version 3 backup already written names a real
icon. Keys added since name what they show: `crown`, `castle`, `mountain`, `sword`, `shield`, `gem`,
`leaf`, `sparkles`, `book`, `ship`. A key, once shipped, is never renamed or removed: it is stored and
exported. Adding one is a change to both lists and nothing else.

**Existing data is brought inside the set once.** Migration `RestrictEntityTypeIconKeys` keeps a value
that is a key after trimming and lowercasing, and clears anything else - which could only have been
written by hand against the API, since no client ever sent one. It is data only; the column is
unchanged. Down is a no-op: a cleared value was never recorded anywhere, and every surviving key is
still valid for the looser column.

**One small dependency, justified.** The web client had no icon set. `lucide-react` (ISC) is a single
established package whose icons are tree-shaken to the handful imported, drawn with one consistent
stroke, and rendered as inline SVG with no network request. Hand-drawing seventeen glyphs would have
been more code to maintain and less consistent.

## Consequences

- The backup format does not change version (ADR 0014). `icon` is still an optional string on each
  entity type; it now always carries a key or null, and every value a version 3 file could have been
  given by LorEvolve itself is still a key.
- The icon is editable at any time from the Types screen and saved on choosing, like a field's
  meaning. It is not gated by the promotion gate and writes no revision: a type is not an entry, and an
  icon is presentation.
- Two lists must change together. The API test pins that every starter icon is a key; the Playwright
  journey pins that a chosen, a seeded and a missing icon each render. Nothing generates one list from
  the other, because the client cannot import C#, and a build step to copy seventeen strings would
  cost more than it saves.
- An unknown key is survivable in both directions: the API refuses to store one, and the client draws
  the fallback for one it does not recognise, so a future key read by an older client degrades to the
  neutral shape rather than to nothing.
