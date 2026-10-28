# ADR 0040 - A type may be enabled for the Family Tree, and a relation kind may mean family without ancestry

Status: accepted (2026-09-30). Supersedes two statements of ADR 0035, named below; the rest of 0035 stands.

## Context

Real use - a Lord of the Rings pilot - found three problems with ADR 0035 as built.

- **Every entry was offered a family.** 0035 said "entry types mean nothing here", so `Species → Men` had a Family tree
  action and the tree's picker offered every location, item and species in the world beside the people.
- **Only parents existed.** An author could not record "Bilbo uncle of Frodo" as family at all. The only family meanings
  were `BiologicalParent` and `AdoptiveParent`, and faking an uncle as a parent link would invent an ancestry.
- **Types was one long mixed page.** Lore types, relation kinds and event kinds and methods ran one under another, with a
  permanently open "New type" form in the middle.

## Decision

**Family Tree eligibility is explicit type metadata.** `EntityTypes.FamilyTreeEligible`, a boolean, set by the author on
the Types screen (Lore Types tab, and in the New type dialog). It decides where the Family Tree is *offered*: the tree's
entry picker (`GET .../entities?familyTreeEligible=true`, the same listing and search every picker uses, filtered on the
type's column) and the Family tree action on an entry's page. Nothing reads a type's name or icon to decide it, at run
time or anywhere else.

*This supersedes 0035's "Entry types mean nothing here" and "Every entry's page offers Family tree".*

**Only the starter Character is seeded eligible.** `EntityTypeDefaults` carries the flag as data beside each starter's
icon; Character is `true`, the other six `false`. A starter re-seeded into an existing universe (the seeding fills in
missing names) is created the same way.

**Existing universes: one exact rule.** Migration `AddEntityTypeFamilyTreeEligibility` adds the column as `false` and
turns it on only for a row that is still the starter Character exactly as seeded: name `Character`, description
`People, and anything else with a will of its own.`, icon `character`, colour `#4f6bd6`. A starter the author renamed,
redescribed, re-iconed or recoloured is theirs and stays off; so does every custom type, including one merely called
"Character" in another universe. `EntityTypeDefaults.IsUntouchedStarterCharacter` is the same rule in code, used to read
older backups, so both upgrade paths agree. Anything ambiguous stays off and the author turns it on.

**Legacy family data stays reachable.** Eligibility gates where the tree is offered, never what an entry may hold. The
tree endpoint answers for any live entry of the universe, as before, and says whether each node's type is eligible
(`entityTypeFamilyTreeEligible`), so the page shows *This entry's type is not currently enabled for Family Tree* with a
link to Lore Types rather than hiding anything. An entry's detail carries `hasFamilyConnections` - a live link of a
family kind touches it - and its page offers Family tree when that is true whatever its type. Nothing is rewritten or
deleted, and an ineligible entry is not added to the picker because some entry of its type was once in a family.

**Parent meanings still define ancestry, and only they do.** `BiologicalParent` and `AdoptiveParent` keep every meaning
0035 gave them: source parent, target child, and the only links walked for parents, grandparents, siblings, children,
grandchildren, the tree's circles and `CANON-FAMILY-001`. `RelationshipFamilySemantics.Parent` is that set, used by every
query that derives anything.

**A new meaning: `NonStructuralFamily` (3).** "This relationship belongs in the Family Tree experience, but it places
neither entry in the ancestry" - uncle, aunt, cousin, spouse, guardian, step-sibling, godparent. Stored in the existing
integer column; no schema change. *This supersedes 0035's "family semantics only represent parent relationships".*

- **Authored, never derived.** The tree lists the focal entry's non-structural links under *Other family connections*,
  each read from the focal entry's side with the kind's own words (`RelationshipValidation.LabelFor`, the one wording every
  relation list uses): *Bilbo uncle of Frodo*, and from Frodo *nephew or niece of Bilbo*. It is never walked: an "uncle
  of" makes nobody a parent, sibling, grandparent or grandchild, and LorEvolve never derives an uncle from parent links
  either. Derived ancestry and authored family stay two different things on screen.
- **Symmetric kinds may carry it.** A parent meaning names a side and is still refused on a symmetric kind; "married to"
  names none, so it may be non-structural and reads the same from both ends.
- **No Canon change.** `CANON-FAMILY-001` inspects parent meanings only, so two "uncle of" links in a circle are no
  finding. Relationship Canon constraints are untouched.
- **Family links remain ordinary relationships.** No table, no second relationship system, no Family Tree write endpoint.
  The tree's read still costs at most five queries: the links touching the focal entry are read once and split into
  parent links and authored ones; the next step out reads parent links only.

**A family kind is created without leaving the tree.** *Add family connection* offers *New family relationship kind*, a
dialog posting to the existing `POST .../relationship-types` with name, inverse name, symmetric and a family meaning
(default: family that does not define ancestry; biological or adoptive parent may be chosen; parent meanings are not
offered for a symmetric kind). The new kind joins the form's list and is chosen at once, with no route change. The same
dialog is offered on the tree's empty state when no family kind exists. The form follows the meaning: a parent kind asks
which side is the parent; any other family kind is read as a relation - *Bilbo [uncle of ▼] Frodo*, or the inverse
reading - and never mentions parents.

**Types is three tabs in one destination.** Lore Types, Relation Kinds, and Event Kinds & Methods, in the address as
`?tab=` (`lore` is the default and leaves it out; `relations`, `events`), every panel mounted and hidden - Settings'
pattern, now shared as `QueryTabList`/`TabPanel` and `useQueryTab`. Unlike Settings, each tab chosen is pushed as a step of
history, so Back and Forward walk the tabs; Settings keeps replacing (`useQueryTab(tabs, { history: 'push' })`). `+ New type` is the page
header's action on the Lore Types tab and opens a dialog: name, icon, Family Tree. The relation kind manager and the event
kind manager move into their tabs unchanged, apart from the new meaning in the relation kind editor.

**Backup: format version 18.** `entityTypes[].familyTreeEligible`, and `NonStructuralFamily` by name in
`relationshipTypes[].familySemantic`. A bump, not an ignorable member: a version 17 reader does not know the new meaning
and must never read it as a parent link, and eligibility is an authored choice. A file at version 17 or earlier reads each
type through the starter rule above, even if it carries a value; a file at version 17 or earlier carrying
`NonStructuralFamily` was not written by LorEvolve and is refused.

## Consequences

- An upgraded universe keeps every family tree it had; only its untouched Character is offered by default, and a
  species with a parent link says so on its tree instead of disappearing.
- A universe whose Character was customised offers no Family Tree picker entries until its author enables a type; the
  tree says *No Lore Type is enabled for Family Tree yet* and links to Lore Types.
- The Family Tree's picker and the connection form's picker filter on the type, so an ineligible entry can still be
  linked from its Relations view - the relation editor is not the Family Tree and filters nothing.

## Deferred

- Spouses placed inside ancestry rows, derived uncles and cousins, full and half siblings, arbitrary family graph layout,
  configurable depth. Unchanged from ADR 0035.
- Canon constraints on a kind made from the Family Tree dialog: set on the Relation Kinds tab afterwards.
- Reusing the Family Tree dialog as the Relation Kinds tab's create form: that form carries Canon constraints the dialog
  deliberately leaves out, so the two stay separate.

## Amendment: portrait nodes with details, and groups enabled for the tree (2026-10-20, Issue #37)

Real use found the tree's cards hard to scan, and the focal entry's authored family listed apart from the people it
belongs to. Nine owner decisions (1A-9A on the issue) settle the redesign.

**A member is a portrait in a circle, with the name beneath and an eye for its details.** About 7.5rem across on a
comfortable desktop, less on a tablet and 4.5rem on a phone, all in rem so a larger text size grows them; the name wraps to
three lines at most, inside its member. The thumbnail is the author's square crop drawn round by CSS, and an entry with no
picture keeps its type's placeholder. The focal member is the same node with an accent ring and `aria-current`; an entry
not Canon yet has a dashed ring, as a link not Canon yet is a faded line. Nothing else is on the node: type, status,
positions and links are one press away. The portrait still takes the focus to that member's family.

**The details are LorEvolve's modal `<dialog>`, as every drawer is** (`FamilyMemberDetails`, through `useDrawerGuard`): a
small popover held against its node on a wide screen, a sheet from the bottom of the screen at the tree's phone width
(640px), placed and focused before it is painted. Escape and a press outside close it, the focus starts on its heading and
goes back to the eye. The heading and actions keep their place and only the middle scrolls. It holds the name, type and
Canon status; *In this family*, the positions derived for that member and the drawn parent links touching it, in the same
words the cards used; *Other family*, that member's authored non-structural links, each linking to the related entry
whether or not it is drawn; and Open entry, and for a relative, Show this family.

**Authored family is read for every drawn member, not only the focal one.** `FamilyTreeConnection` gains `EntityId`, the
member whose side it is read from; a link between two drawn members is listed once from each side. One more query reads
every `NonStructuralFamily` link touching anyone drawn, so the tree costs at most six queries. Still listed, never walked:
a "brother of" makes nobody a sibling or a parent, and the derivation is unchanged. No line is drawn for it and no node is
added for a relative outside the ancestry: that entry is in `Nodes`, by name, without being placed. The separate *Other
family connections* section is gone; its links are in the members' details.

**Ordinary relationships stay apart.** Below the tree, *Other relationships* lists the focal entry's links whose kind has
no family meaning, read from the existing relation list and filtered on the kind. They make no node, line, generation or
detail.

**A group may be enabled for the Family Tree.** `EntityTypeGroups.FamilyTreeEnabled`, false for every group, starter
groups included (migration `AddEntityTypeGroupFamilyTree`, additive). A type is offered the tree when its own switch is on
**or** it is in a group its author enabled; being in a group enables nothing, and nothing reads a group's or a type's
name. `FamilyTreeEligibility.TypeIds` is that one rule, composed as a subquery into every reader: the picker's
`familyTreeEligible=true`, the families listing, the tree's nodes, and the type list's new read-only `familyTreeOffered`
(the type's own `familyTreeEligible` keeps its meaning and is still what a save writes). A type in several enabled groups is
one type. `PUT .../entity-type-groups/{id}/family-tree` (`{ enabled }`, EditContent; Reviewer and Viewer 403, another
universe's group 404) changes only that flag. Renaming keeps it, since it lives on the group by id. Deleting an enabled
group is refused (409 `entity_type_group_family_tree`) until it is turned off, beside #36's other refusals. A type leaving
an enabled group, or an empty enabled group, simply offers nothing; no relationship or parentage is rewritten either way,
and a recorded family stays readable through the not-enabled note as before. Backup format 24 (ADR 0014 amendment).

The setting is *Types in Family Tree*, folded at the foot of the Family Tree page and open when nothing is enabled yet: the
types enabled one by one, then each group with a switch and the types it covers. Every member reads it; only those who may
edit types switch it.

### Deferred

Spouses, siblings and other authored family drawn as lines or peripheral nodes; a switch for an existing type's own
eligibility on the Types screen (still set at creation, or through a group); a group's Family Tree state shown in the type
editor.

## Amendment: couples, shared stems, and no words on lines (2026-10-28)

A realistic three-generation family (the Hollowtide demo on DEV) fell apart: a spouse stood at the far end of the row,
recorded family crossed generations as long dotted arcs, and every arc carried a sentence that ran into the next.

**Couples come from structure, never from a kind's name.** Two members are a couple when they are co-parents of a drawn
child, or when recorded family joins them within one generation and they are not already siblings by a shared parent.
The focal entry's unplaced relatives (a spouse with no parent links) count as its generation. A couple stands side by
side, joined by a short line: solid for co-parents, dotted for recorded family alone. Joins are taken only while each
member keeps two neighbours at most and no circle forms, so a unit is always a simple line; a join left out shows on
hover only. `familyTree/layout.ts` (`arrangeFamily`) holds the rule and orders each generation under its parents by a
down, up and down barycentre sweep; `familyLayout.test.ts` checks it.

**Children hang from one stem.** From between two co-parents who are joined, otherwise from under the single parent;
siblings share the bar and drop from it. A sibling is read from that bar, so no sibling line is drawn, and a stem from
the middle of a couple only ever means both are recorded parents.

**No permanent line for other recorded family, and no words on any line.** Pointing at or focusing a member draws their
recorded family that no join shows, and a caption beneath the tree writes out each link. The details list them as
before. Still listed, never walked.

**Phone.** Still no lines. A couple is held in one soft band, so the row never wraps between them.

Derivation, the API, the queries and the backup format are unchanged.
