// Run with `node --test uiContract/controls.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps the small controls on their shared parts (#414): SegmentedControl and CanonStatusPicker for a
// choice on the page, MoveItems for a move, ZoomControls for a canvas's zoom, DisclosureButton for
// show and hide, Crumb for a back link, InlineConfirm for the one inline question, ViewChips for
// Lore's group chips and SwitchGroup for the account menu's theme and language (#456). Each list below only shrinks, and a stale entry fails. Catalogue:
// docs/design/ui-components.md.

import { register } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classStrings, read, tsxFiles } from './support.ts'

// `en.ts` imports its parts without file extensions; this hook lets Node find the `.ts` file.
register(
  'data:text/javascript,' +
    encodeURIComponent(
      "export async function resolve(s, c, next) { try { return await next(s, c) } catch (e) { if (s.startsWith('.') && /ERR_(MODULE_NOT_FOUND|UNSUPPORTED_DIR_IMPORT)/.test(e.code)) return next(s + '.ts', c); throw e } }",
    ),
)

// Class tokens split on spaces and on the mark `literals()` puts for `${...}`, keeping the mark at
// the start of what follows it: `segmented ${x}` gives `segmented`, `${area}__confirm` gives
// `\u0001__confirm`, `lorecatalog__group${on}` gives `lorecatalog__group`.
const tokens = (source: string) =>
  classStrings(source).flatMap((value) =>
    value.replaceAll('\u0001', ' \u0001').split(/\s+/).filter(Boolean),
  )
const hasToken = (source: string, match: (token: string) => boolean) => tokens(source).some(match)
const named = (names: string[]) => (token: string) => names.includes(token)
const withToken = (match: (token: string) => boolean) =>
  tsxFiles.filter((file) => hasToken(read(file), match))
const withText = (pattern: RegExp) => tsxFiles.filter((file) => pattern.test(read(file)))

// The names a file imports from lucide-react, an import over several lines included.
const lucideNames = (source: string) =>
  [...source.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'lucide-react'/g)].flatMap((m) =>
    m[1]
      .split(',')
      .map((name) => name.trim().split(/\s+as\s+/)[0])
      .filter(Boolean),
  )
const importing = (names: string[]) =>
  tsxFiles.filter((file) => lucideNames(read(file)).some((name) => names.includes(name)))

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

const c = (file: string) => `src/components/${file}.tsx`
const list = (why: string, files: string[]) => files.map((file) => [c(file), why] as const)
const only = (...files: string[]) => new Map(files.map((file) => [c(file), 'the shared part']))

const SEGMENTED = (token: string) =>
  token === 'segmented' || token.startsWith('segmented__') || token.startsWith('segmented--')
const THEMESWITCH = (token: string) =>
  token === 'themeswitch' || token.startsWith('themeswitch__') || token.startsWith('themeswitch--')
const CANON = named(['canon', 'canon__step'])
const ZOOM_CLASSES = named(['mapviewer__controls', 'boardcanvas__controls'])
const CONFIRM = (token: string) =>
  ['settings', 'publication', 'trash'].some(
    (area) => token === `${area}__confirm` || token === `${area}__confirmtitle`,
  ) ||
  token === 'trash__confirmerror' ||
  token === '\u0001__confirm' ||
  token === '\u0001__confirmtitle'
const CHIPS = named([
  'lorecatalog__groups',
  'lorecatalog__group',
  'lorecatalog__groupicon',
  'lorecatalog__groupcount',
])
const MOVE_WORDS = /^Move( .+)? (up|down|earlier|later)$/

test('the control guards catch a hand-made control, template-built classes included', () => {
  assert.ok(hasToken('<div className="segmented">', SEGMENTED))
  assert.ok(hasToken('<div className={`segmented ${x}`}>', SEGMENTED))
  assert.ok(hasToken('<button className="segmented__option">', SEGMENTED))
  assert.ok(!hasToken('<div className="segmentedish">', SEGMENTED))
  assert.ok(hasToken('<div className="themeswitch themeswitch--menu">', THEMESWITCH))
  assert.ok(hasToken('<button className={`themeswitch__option ${x}`}>', THEMESWITCH))
  assert.ok(!hasToken('<SwitchGroup label={label} inMenu value={v} onChange={set} />', THEMESWITCH))
  assert.ok(hasToken('<div className="canon">', CANON))
  assert.ok(!hasToken('<div className="canonpage">', CANON))
  assert.ok(hasToken('<div className={`${area}__confirm`}>', CONFIRM))
  assert.ok(hasToken('<p className={`${area}__confirmtitle`}>', CONFIRM))
  assert.ok(hasToken('<div className="trash__confirm trash__bulkconfirm">', CONFIRM))
  assert.ok(!hasToken('<p className="trash__confirmtext">', CONFIRM))
  assert.ok(hasToken('<button className={`lorecatalog__group${on}`}>', CHIPS))
  assert.ok(!hasToken('<span className="lorecatalog__browselabel">', CHIPS))
  assert.ok(hasToken('<div className="mapviewer__controls">', ZOOM_CLASSES))
  assert.deepEqual(lucideNames("import { ArrowUp, Pencil } from 'lucide-react'"), [
    'ArrowUp',
    'Pencil',
  ])
  assert.deepEqual(lucideNames("import {\n  ArrowDown,\n  ArrowUpRight,\n} from 'lucide-react'"), [
    'ArrowDown',
    'ArrowUpRight',
  ])
  assert.ok(!lucideNames("import { ArrowUpRight } from 'lucide-react'").includes('ArrowUp'))
  assert.ok(MOVE_WORDS.test('Move {name} up') && MOVE_WORDS.test('Move earlier'))
  assert.ok(!MOVE_WORDS.test('Move to trash'))
})

test('a choice on the page is SegmentedControl; canon steps are CanonStatusPicker', () => {
  check(withToken(SEGMENTED), only('SegmentedControl'), 'use SegmentedControl')
  check(withToken(CANON), new Map(), 'use CanonStatusPicker')
  check(
    withText(/\bCANON_ORDER\b/),
    new Map([
      [c('CanonStatusPicker'), 'the shared part'],
      ...list('canon as a select, one per table row', ['lore/MassCreateRow']),
      ...list('canon as a select in a filter of selects', ['timeline/TimelineControls']),
    ]),
    'use CanonStatusPicker',
  )
})

test("the account menu's theme and language choice is SwitchGroup", () => {
  check(withToken(THEMESWITCH), only('ThemeSwitch'), 'use SwitchGroup')
})

test('aria-pressed is a choice, a chip, or one of the listed toggles', () => {
  check(
    withText(/aria-pressed/),
    new Map([
      [c('SegmentedControl'), 'the shared part'],
      [c('ViewChips'), 'the shared part'],
      ...list('a canvas node or a map pin', [
        'CanvasCardButton',
        'worldLogic/MachineStateCard',
        'worldLogic/MachineLineLabel',
        'maps/MapViewerLayer',
      ]),
      ...list('a list row', ['ideas/BoardListView', 'maps/MapPinList']),
      ...list('one on/off button, not a choice among values', [
        'ideas/BoardToolbar',
        'ideas/BoardCardInspector',
        'lore/LoreResultActions',
        'trash/TrashHeader',
        'maps/MapHeader',
        'lore/LoreControls',
      ]),
      ...list('a strip of pictures', ['lore/EntryPicture']),
      ...list('the rich-text toolbar', ['LoreEditor']),
      ...list('the account menu', ['ThemeSwitch']),
      ...list('a drag handle', ['TypeReorderHandle']),
    ]),
    'use SegmentedControl, or ViewChips with button items',
  )
})

test('a move is MoveItems', () => {
  check(importing(['ArrowUp', 'ArrowDown']), only('MoveItems'), 'use MoveItems')
  check(
    importing(['ArrowLeft']),
    new Map([
      [c('Crumb'), 'the shared back link'],
      [c('Pager'), 'the shared pager'],
      [c('MoveItems'), 'a move in a row of pictures'],
      ...list('a button inside the drawer', ['lore/LorePreview']),
      ...list('on every workspace page; a Crumb would add a second Breadcrumb nav', [
        'universes/WorkspaceSidebar',
      ]),
      ...list("the public portal's own way back, in its tokens", ['portal/PublicCrumbs']),
    ]),
    'use Crumb with back, or MoveItems',
  )
})

test("a canvas's zoom is ZoomControls", () => {
  check(importing(['ZoomIn', 'ZoomOut', 'Maximize']), only('ZoomControls'), 'use ZoomControls')
  check(withToken(ZOOM_CLASSES), only('ZoomControls'), 'use ZoomControls')
})

test('show and hide is DisclosureButton; the listed others own their aria-expanded', () => {
  check(
    withText(/aria-expanded/),
    new Map([
      [c('DisclosureButton'), 'the shared part'],
      ...list('a menu or a combobox', ['ActionMenu', 'UniverseSearch', 'EntityPicker']),
      ...list('a tree branch', ['LoreCatalog']),
      ...list('a canvas node', ['familyTree/FamilyNode']),
      ...list("the rail's menu", ['universes/WorkspaceRail']),
      ...list("a rule row's fold, LinkRow's button mode", ['LinkRow']),
    ]).set('src/pages/UniversesPage.tsx', 'Restore opens only'),
    'use DisclosureButton',
  )
})

test('an inline confirm is InlineConfirm', () => {
  check(withToken(CONFIRM), only('InlineConfirm'), 'use InlineConfirm')
})

test("Lore's group chips are ViewChips", () => {
  check(withToken(CHIPS), only('ViewChips'), 'use ViewChips')
})

type Tree = { [key: string]: string | Tree }
const en = (await import('../src/i18n/en.ts')).default as Tree
const pt = (await import('../src/i18n/pt-PT.ts')).default as Tree

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') out.set(prefix + key, value)
    else for (const [k, v] of flatten(value, prefix + key + '.')) out.set(k, v)
  }
  return out
}

test('the move words live once, in shell.actions', () => {
  const enText = flatten(en)
  const ptText = flatten(pt)
  assert.deepEqual(
    [...enText]
      .filter(([key, value]) => !key.startsWith('shell.actions.') && MOVE_WORDS.test(value))
      .map(([key]) => key),
    [],
    'use MoveItems, whose words are shell.actions.move*',
  )
  for (const word of ['Up', 'Down', 'Earlier', 'Later']) {
    for (const suffix of ['', 'Named']) {
      const key = `shell.actions.move${word}${suffix}`
      assert.ok(enText.has(key) && ptText.has(key), `${key} in both languages`)
    }
  }
})
