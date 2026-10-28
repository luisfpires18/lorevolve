# ADR 0035 - A relation kind may carry an explicit family meaning, and a family tree derives the rest

Status: accepted (2026-09-16); two statements superseded by ADR 0040 (2026-09-30), marked below

## Context

LorEvolve already stores links between entries: one row, a source, a target, and an authored relation kind that
carries both readings (ADR 0008). An author who wants a family tree has everything the tree needs recorded
already - "Mara parent of Lia", "Oren adopted Lia" - and no way to see it as a family.

The owner asked for family connections, not a social graph: parents and children, biological and adoptive,
with siblings and grandparents falling out of them.

Three shapes were available.

**Read the kind's name.** "Parent of", "mother", "father" are what most authors write. Rejected outright, for
the reason ADR 0023 rejected it for age rules and ADR 0011 for field meanings: it fails in any other language,
on "Bore", "Sired", "Whelped" and "Progenitor of", and on the author who meant something else by the same word.
A name has no semantic authority anywhere in LorEvolve, and a family tree is the worst place to start.

**A dedicated family-link table.** Parent links of their own, apart from relationships. It would duplicate the
one thing the author has already recorded: the same two entries would be linked twice, in two systems, each
able to disagree with the other, each needing its own Trash behaviour, backup member, validation and UI. The
only thing it would buy is a place to put family-specific columns, and there are none - a parent link is a
link.

**An explicit meaning on the relation kind.** One typed column saying what every link of that kind means to a
family tree. The links themselves are untouched, and an author turns an existing kind into family history in
one save.

## Decision

**The kind owns its family meaning, as a typed column.** `RelationshipTypes` gains `FamilySemantic`:
`None`, `BiologicalParent` or `AdoptiveParent`, stored as an integer, defaulting to `None`. Typed column
rather than JSON, for ADR 0007's reason; on the kind rather than on each link, because it is the kind's
meaning, and because changing it must change every link of that kind at once. The API carries it as
`familySemantic`, and on an update a missing member leaves the stored meaning exactly as it is, the way
`canonConstraints` does - so a client that predates family trees cannot wipe one by saving a rename.

**A name still means nothing.** A kind called "parent of" with no family meaning is invisible to the family
tree, and a kind called anything at all with one is read as a parent link. This is pinned by tests, in the
API, the backup, the migration and the browser.

**Direction is the stored direction: source parent, target child.** Both meanings point the same way, so
there is no "child of" meaning and no second kind needed to write a link the other way round - a kind's
existing inverse name already reads it from the child's side (ADR 0008), and the relation editor still offers
both readings. A symmetric kind says neither end is special, so it may not carry a family meaning at all, for
the reason it may not carry an age order (ADR 0023); a request that sets one, or turns a kind symmetric
beneath one, is refused rather than having the meaning silently dropped.

**Family meaning is not a Canon constraint.** The two columns are independent: a kind may carry an age rule,
a family meaning, both or neither, and configuring one never changes the other. A family-semantic link passes
through exactly the validation and the Canon rules it always did.

**Relatives are derived on every read, and never written.** `GET /api/universes/{u}/family-tree/{entityId}`
answers one bounded view: the focal entry, its parents, grandparents, siblings, children and grandchildren,
the parent links between them, and every entry's name, type, Canon status and thumbnail identity. A sibling is
two parent links that share a parent; a grandparent is two links in a row. No sibling, grandparent or
grandchild row is ever stored, no Canon finding, moment or revision is written by a read, and nothing on the
tree is inferred from an alias, a tag, an entry type, a date, a story or prose. Ids only.

**Two generations each way, stated explicitly.** `generationsEachWay` is in the response and fixed at 2.
There is no depth parameter: a `depth=99` graph endpoint is exactly the general relationship graph this
feature is not.

**Bounded queries, not the universe's graph.** At most five queries per read whatever the family's size: the
universe, the focal entry, the links touching it, the links one step further out from its parents and
children in one query, and every entry named in one more. Pinned by a test that counts commands over a family
of forty relatives.

**Every path is carried, and nothing more is claimed.** A relative comes back with the paths of parent links
that make it one, so the client can say *Shares Mara - biological for both* or *Shares Oren - adoptive for
Lia, biological for Tam*. What is deliberately absent is any word for how much of a family two entries share:
**no full or half sibling**. One recorded parent proves nothing about a parent nobody wrote down, and missing
data is unknown rather than false.

~~**Entry types mean nothing here.** There is no "Character" and no personhood test: any entry may hold family
links, because the author is the one who recorded them. A location with a parent is the author's business.~~
*Superseded 2026-09-30 by ADR 0040: a type now says, explicitly, whether its entries are offered by the Family Tree.
Still no personhood test and nothing read from a name, and any entry keeps the family links already recorded on it.*

**Circles are reported, never resolved.** Parent links can be written in a circle - A bore B, B bore A - which
no ancestry can be derived from. Three answers were considered, and two are taken:

- **Write-time refusal: no.** ADR 0023's rule holds - an authored contradiction is stored and then reported.
  A circle can also appear without any link being written, by giving an existing kind a family meaning or by
  restoring a backup, so a refusal at the link would be both incomplete and surprising.
- **Traversal: bounded by construction.** Each position is a fixed walk of one or two links, so no circle can
  make the derivation recurse. Circles among the links a tree read are found with Tarjan's algorithm on an
  explicit stack and reported in `loops`, with the entries and the links that close them, so the page names
  the problem rather than drawing nonsense.
- **Canon Integrity: `CANON-FAMILY-001`, Medium.** One finding per circle of Canon parent links between Canon,
  live entries - a strongly connected group with every link between its members, fingerprinted over those links
  as a set (`UnorderedFrom`), so the same circle survives a restore's new ids and a link added to it is a new
  finding. Medium rather than High because a world with time travel or rebirth may mean exactly that, and
  LorEvolve cannot tell which without reading words - the one thing this decision forbids. So nothing is refused,
  and no link is ever rewritten or deleted on the author's behalf.

**The Trash decides what a tree can see, and nothing new is invented.** A link is read only while both of its
ends are live, which is what every other read of a relationship already does (ADR 0015): a trashed entry is
not a relative, a path through it disappears, and restoring the entry brings the connection back whole because
the links were never touched. A trashed entry has no tree of its own - the same 404 as any other missing entry
- and there is no Family Tree Trash.

**Canon status is shown, never assumed.** Each link carries its own Canon status and each entry its own, and
both are on screen: a Draft link is drawn faintly and named "Draft connection" in words. A derived sibling is
not a Canon fact about the world; it is a consequence of the links, and the links say what they are.

**Ownership is the universe, every time.** Every query holds the relationship, its kind and both of its ends
to the universe in the route, over and above the ownership check the route begins with. Another account's
universe, another universe's entry, a guessed id and an entry in the Trash are all the same 404 with nothing
in the body. A test writes a cross-universe row straight into the database and proves the read still refuses
to walk into it.

**Backup: format version 14.** `relationshipTypes[].familySemantic`, written by name. This is a bump, and the
distinction against ADR 0023 - which added Canon constraints *within* version 4 - is the point: a constraint is
a check run against links whose meaning a reader keeps, and this *is* the meaning. A version 13 reader would
restore every link with the family it records silently gone, and must not be allowed to guess it back from the
kind's name. A file at version 13 or earlier reads as `None`, whatever its kinds are called, even if the file
carries the member. No derived relative is in a backup; only the authored kinds and links.

**Migration `AddRelationshipFamilySemantics` is one additive column.** Every existing kind is `None`, and the
migration test writes kinds called parent, mother, father, child, sibling and family with links on them and
proves they all come back with no family meaning. The rollback uses SQLite's own `DROP COLUMN` rather than
EF Core's table rebuild, so nothing that points at `RelationshipTypes` is dropped and recreated underneath it.

**The workspace is a section of the universe.** `Family Tree` sits in the sidebar after Lore, at
`/app/universes/{universeId}/family-tree/{entityId}` - the entry in focus is in the address, so a reload, the
browser's Back and Forward and a shared link all land on the same family. With no entry chosen, the page is an
entry picker and an empty state. ~~Every entry's page offers "Family tree", because family is what an author
recorded, not something LorEvolve decides an entry is eligible for.~~ *Superseded 2026-09-30 by ADR 0040: an entry's page
offers it when its type is enabled for the Family Tree, or when a family link already touches it.*

**The drawing is generations, not a graph.** Rows of cards - grandparents, parents, the focal entry with its
siblings, children, grandchildren - in plain React and CSS, with the connecting lines measured from the cards
and drawn in one `aria-hidden` SVG: solid for biological, dashed for adoptive, faded for anything not Canon.
No graph library, no canvas, no node editor. The lines are decoration: every position and every biological or
adoptive connection is also written on the card in words, so the tree is read the same by a screen reader, and
the whole structure is headings, lists, links and buttons that the keyboard reaches in order. The diagram
scrolls sideways inside its own box on a narrow screen; the page never does.

**Adding a connection from the tree writes an ordinary relationship.** The form picks a kind that carries a
family meaning, which side the focal entry is on, the other entry and a Canon status, and posts the same
relationship the entry page posts, through the same route and the same validation. There is no second family
edge anywhere.

## Deferred

- Spouses, partners, ex-partners, step-parents, guardians, in-laws, cousins, aunts and uncles, dynasties,
  houses, clans, succession, inheritance and family events. None of them is a parent link, and most are
  relationships LorEvolve already stores perfectly well without a tree.
- Half and full siblings as claims, and any other genealogical classification that needs assumptions about
  parents nobody recorded.
- A general relationship graph, a node editor, and editing the tree as a second relationship database.
- More generations, a configurable depth, a whole-universe family view, and printing or exporting a tree.
- Family checks beyond the circle: no age rule, no lifespan rule and no species rule reads family meaning.
  `CANON-REL-002` and `CANON-REL-003` are configured per kind and work on a family kind exactly as before.
- Search over derived relatives. A sibling is not a document, and the universe search (ADR 0031) indexes
  authored content only.

## Consequences

- An existing universe gains nothing from the migration and nothing from the release: every kind is `None`,
  and a family tree is empty until an author says what one of their kinds means.
- One configuration save can fill or empty every family tree in the universe at once. That is the intent, and
  the tree derives from the current kinds and links on every read, so nothing can be stale.
- `CANON-FAMILY-001` costs one relationship query per evaluation, and nothing when no kind carries a meaning.
  ADR 0012's table still holds: no High rule reads a relationship, so relationship and relationship-type
  writes stay reconciled and ungated.
- A circle longer than the tree reaches is not named by the tree - it cannot see it - and is named by Canon
  Integrity if its links are Canon. Both are honest about what they read.
- The backup bump means a LorEvolve that predates this release refuses a new backup outright rather than
  restoring a world whose families have quietly vanished.

## Amendment - explicit type eligibility and family without ancestry (2026-09-30, ADR 0040)

Two statements above no longer hold, and are struck through where they stand rather than rewritten:

1. *Entry types mean nothing to the Family Tree.* A type now carries `FamilyTreeEligible`, set by its author and seeded
   only on the starter Character; the tree's picker and an entry's Family tree action follow it. Legacy family data stays
   reachable: the tree answers for any live entry, names an ineligible type on screen, and an entry already holding a
   family link keeps its action.
2. *Family meanings are only parent meanings.* `NonStructuralFamily` joins `BiologicalParent` and `AdoptiveParent`: a
   kind like "uncle of" or "married to" is listed with the focal entry as authored family, and derives nothing. Parent
   meanings alone still place entries, derive every relative, draw every line and feed `CANON-FAMILY-001`. A symmetric
   kind may carry the non-structural meaning; it still may not carry a parent one.

Everything else in this decision - ids only, the stored direction, the bounded five-query read, circles reported and
never resolved, the Trash, ownership, ordinary relationships and no second family table - is unchanged.

## Amendment - discovery: the families already recorded (2026-10-05, Product refinement 035)

The tree needed an entry the creator already knew. The bare Family Tree page now opens on the families the universe
already holds, derived like everything else here and stored nowhere.

- **A family is a projection, not a record.** One connected group of live entries joined by live relationships whose
  kind has a family meaning other than None - biological parent, adoptive parent or non-structural family - read
  without direction. A married couple with no children is a family; an "uncle of" joins two branches. Only the
  configured meaning counts, never a name. The population is exactly the tree's (`LiveLinks`): the relationship, its
  kind and both ends in this universe, both ends out of the Trash, every Canon status. No Family table, id, name or
  membership row exists, and nothing is maintained beside the relationships.
- **Offered when it can be opened, counted whole.** A family needs at least two distinct entries and at least one
  member whose type is enabled for the Family Tree; the tree opens on such a member. Its size counts every member,
  enabled or not. A group with no enabled member is not listed, though a deep link to one of its entries still works.
- **Deterministic.** Union-find over the links, so a circle or a link written twice joins nothing new and a link to
  oneself joins nobody. The tree opens on the enabled member with the most distinct family neighbours, then by name
  (case aside, then exactly), then by id: usually someone central, recomputed on every request and never stored. A
  summary names three members - that one first, then any the search matched, then the rest by name - and the size.
  Families are listed by that member's name.
- **`GET /api/universes/{id}/family-tree/families?q=&page=&pageSize=`**, Read capability, 12 a page, at most 40,
  clamped like every page. `q` matches any member's name, case aside, before paging; a family matching through several
  members is listed once, exact names before prefixes before contains. The answer is `{ items, page, pageSize,
  totalCount, totalPages }`, each item `{ focusEntityId, memberCount, previewMembers[{ entityId, name }] }`: no tree,
  link, path, picture or type.
- **Three queries whatever the size:** the access check, every live family link's two ends, and the live entries they
  name with their type's eligibility. Grouping, search and order run in memory, so each request inspects every family
  link in the universe while answering one page. A materialized family index is not part of this.
- **The tree is unchanged:** two generations each way, its own endpoint, read only for the family chosen.
- **Pages:** `/family-tree?q=&page=` holds the search and page; only typing waits. A summary is a link to
  `/family-tree/{focusEntityId}`; "Browse families" on that tree returns to the search it was opened from (carried in
  history state, never in the tree's address). Choosing a character stays as the second way in, folded behind "Find a
  character", and open from the start when no family exists yet.
- **Deferred:** creating a missing relative from the tree (Quick Create), unlimited genealogy, family names, new family
  meanings, and public family trees.
