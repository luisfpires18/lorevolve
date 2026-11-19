// Run with `node --test uiContract/cards.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps card grids, cards, item rows and outline nodes on their shared parts (#413): CardGrid, CardSkeleton,
// EntityCard, CatalogCard, EntityRow, LinkRow, TypeRow, TypeRowActions, ProjectCard and OutlineItem, and the raised
// surface's lift and the card grid's columns in one CSS rule each. Each list below only shrinks, and a stale entry
// fails. Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { classStrings, read, tsxFiles, webRoot } from './support.ts'

const tokens = (source: string) => classStrings(source).flatMap((value) => value.split(/\s+/))
const hasToken = (source: string, match: (token: string) => boolean) => tokens(source).some(match)
const named = (names: string[]) => (token: string) => names.includes(token)
const family = (roots: string[]) => (token: string) =>
  roots.some(
    (root) => token === root || token.startsWith(`${root}__`) || token.startsWith(`${root}--`),
  )

const withToken = (match: (token: string) => boolean) =>
  tsxFiles.filter((file) => hasToken(read(file), match))

function check(found: string[], allowed: Map<string, string>, say: string) {
  assert.deepEqual(
    found.filter((file) => !allowed.has(file)),
    [],
    say,
  )
  assert.deepEqual(
    [...allowed.keys()].filter((file) => !found.includes(file)),
    [],
    'stale allowlist entry: remove it',
  )
}

const only = (file: string, why = 'the shared part') => new Map([[file, why]])

const cssFiles = readdirSync(join(webRoot, 'src/styles'))
  .filter((file) => file.endsWith('.css'))
  .map((file) => 'src/styles/' + file)
  .sort()
const cssWith = (pattern: RegExp) => cssFiles.filter((file) => pattern.test(read(file)))

const ENTITY_CARD = (token: string) => token === 'entitycard' || token.startsWith('entitycard--')
const CARD_GRID = (token: string) => token === 'cardgrid' || token.startsWith('cardgrid--')
const GONE_GRIDS = [
  'plates',
  'adminstats',
  'adminusers',
  'lore__skeleton',
  'lorecatalog__grid--rows',
]
const ROW_LINK = (token: string) =>
  token === 'rowlink' ||
  token === 'rowlink__target' ||
  family(['storyrow', 'idearow', 'rulerow'])(token)
const TYPE_ROW = named(['types__row', 'types__head'])
const TYPE_ROW_PARTS = named(['types__actions', 'types__move', 'types__fieldcount'])
const PROJECT_CARD = named([
  'projectcard',
  'projectcard__head',
  'projectcard__title',
  'projectcard__actions',
])
const OUTLINE = named([
  'scene__number',
  'scene__titlerow',
  'plotarc__head',
  'chapter__head',
  'chapter__heading',
])
const LIFT = /translateY\(-2px\)/
const AUTO_GRID = /repeat\(auto-(fill|fit)/

test('the card guards catch a hand-made card, grid, row or lift', () => {
  assert.ok(hasToken('<div className="entitycard entitycard--static">', ENTITY_CARD))
  assert.ok(!hasToken('<span className="entitycard__name">', ENTITY_CARD))
  assert.ok(hasToken('<ul className={`cardgrid ${x}`}>', CARD_GRID))
  assert.ok(hasToken('<ul className="plates">', named(GONE_GRIDS)))
  assert.ok(hasToken('<li className="storyrow rowlink">', ROW_LINK))
  assert.ok(hasToken('<p className="idearow__meta">', ROW_LINK))
  assert.ok(!hasToken('<p className="ideasection">', ROW_LINK))
  assert.ok(hasToken('<li className="types__row">', TYPE_ROW))
  assert.ok(hasToken('<span className="types__actions">', TYPE_ROW_PARTS))
  assert.ok(hasToken('<li className="projectcard">', PROJECT_CARD))
  assert.ok(!hasToken('<p className="projectcard__meta">', PROJECT_CARD))
  assert.ok(hasToken('<header className="plotarc__head">', OUTLINE))
  assert.ok(/<EntityTile/.test('<EntityTile universeId={u} />'))
  assert.ok(LIFT.test('.x:hover { transform: translateY(-2px); }'))
  assert.ok(AUTO_GRID.test('grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));'))
})

test('an entry card is EntityCard', () => {
  check(withToken(ENTITY_CARD), only('src/components/EntityCard.tsx'), 'use EntityCard')
})

test('a catalogue card is CatalogCard and a placeholder card is CardSkeleton', () => {
  check(
    withToken(named(['typecard'])),
    new Map([
      ['src/components/CatalogCard.tsx', 'the shared part'],
      ['src/components/CardSkeleton.tsx', 'the type card placeholder'],
    ]),
    'use CatalogCard (TypeCard draws a type with it)',
  )
  check(
    withToken(family(['skeletoncard'])),
    only('src/components/CardSkeleton.tsx'),
    'use CardSkeleton',
  )
})

test('a list of cards is CardGrid', () => {
  check(withToken(CARD_GRID), only('src/components/CardGrid.tsx'), 'use CardGrid')
  check(withToken(named(GONE_GRIDS)), new Map(), 'use CardGrid with min, gap or rows')
})

test('a row that opens as a whole is LinkRow', () => {
  check(
    withToken(ROW_LINK),
    new Map([
      ['src/components/LinkRow.tsx', 'the shared part'],
      [
        'src/components/worldLogic/FindingRow.tsx',
        'a disclosure row: its title is a button that opens in place',
      ],
      ['src/components/worldLogic/MachineBinding.tsx', 'a disclosure row'],
      ['src/components/worldLogic/MachineStates.tsx', 'a disclosure row'],
      ['src/components/worldLogic/MachineTransitions.tsx', 'a disclosure row'],
      ['src/components/worldLogic/SystemRow.tsx', 'a disclosure row with nested rule rows'],
      ['src/components/worldLogic/FindingDetail.tsx', 'label headings, not a row'],
      ['src/components/ideas/BoardCardInspector.tsx', 'the inspector title, not a row'],
      [
        'src/components/ideas/IdeaRow.tsx',
        'the idearow__universe and idearow__seal chips it passes as meta',
      ],
      [
        'src/components/ideas/BoardsListRows.tsx',
        'the idearow__universe and idearow__seal chips it passes as meta',
      ],
      ['src/pages/WorldRulesPage.tsx', 'the rulerow__check chips it passes as meta'],
      [
        'src/components/worldLogic/WorldLogicRules.tsx',
        'the rulerow__check chips it passes as meta',
      ],
    ]),
    'use LinkRow',
  )
})

test("a row's who-is-this part is EntityRow", () => {
  check(
    tsxFiles.filter((file) => /<EntityTile/.test(read(file))),
    new Map([
      ['src/components/EntityCard.tsx', 'the shared card'],
      ['src/components/EntityRow.tsx', 'the shared row part'],
      ['src/components/LoreReference.tsx', 'a chip, not a row'],
      ['src/components/familyTree/FamilyNode.tsx', 'a node on a pan-and-zoom canvas'],
      ['src/components/trash/TrashRow.tsx', 'a Trash row (audit class d), left'],
    ]),
    'use EntityRow',
  )
  check(withToken(family(['entityrow'])), only('src/components/EntityRow.tsx'), 'use EntityRow')
  check(
    withToken(named(['relation__tile', 'relation__body', 'relation__meta'])),
    new Map(),
    'use EntityRow',
  )
})

test('a types list row is TypeRow, its verbs TypeRowActions', () => {
  check(withToken(TYPE_ROW), only('src/components/TypeRow.tsx'), 'use TypeRow')
  check(
    withToken(TYPE_ROW_PARTS),
    new Map([
      ['src/components/TypeRow.tsx', 'the shared row'],
      ['src/components/TypeRowActions.tsx', 'the shared verbs'],
    ]),
    'use TypeRow and TypeRowActions',
  )
})

test('a boxed project card with a head is ProjectCard', () => {
  check(
    withToken(PROJECT_CARD),
    new Map([
      ['src/components/ProjectCard.tsx', 'the shared part'],
      [
        'src/components/projectEntities/PagePanels.tsx',
        "a sub-list row's menu inside projectcard__inner",
      ],
    ]),
    'use ProjectCard',
  )
})

test('an arc, chapter or scene is OutlineItem', () => {
  check(withToken(OUTLINE), only('src/components/OutlineItem.tsx'), 'use OutlineItem')
})

test('the lift is one CSS rule', () => {
  check(
    cssWith(LIFT),
    only('src/styles/022-shared-surfaces.css', 'the shared lift'),
    'join the lift selector list',
  )
})

test('a card grid is the one .cardgrid rule; the other auto grids are listed with their reason', () => {
  check(
    cssWith(AUTO_GRID),
    new Map([
      ['src/styles/022-shared-surfaces.css', 'the shared .cardgrid'],
      ['src/styles/029-chronology-date-periods.css', '.era__fields: form layout'],
      ['src/styles/042-entry-form.css', '.entryform__fields: form layout'],
      ['src/styles/051-type-icon-picker.css', '.iconpicker__grid: form layout'],
      ['src/styles/054-relation-form.css', '.relform__grid: form layout'],
      ['src/styles/090-publishing-settings.css', '.publication__genrelist: form layout'],
      ['src/styles/116-entry-forms-and-abilities.css', '.scenepicks: a picker'],
      ['src/styles/102-universe-published.css', '.plore-grid, .pstory-grid: public portal'],
      ['src/styles/127-projects.css', '.shelf, .shelf--wide: objects on a shelf'],
      ['src/styles/121-maps.css', '.maplist: audit class d, left'],
    ]),
    'use CardGrid (.cardgrid with a modifier)',
  )
})
