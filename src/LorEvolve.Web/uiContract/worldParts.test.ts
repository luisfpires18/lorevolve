// Run with `node --test uiContract/worldParts.test.ts` (Node 22.18+ strips the types itself).
//
// The Lore and World parts (#456 stage 14): the progression rows, the World logic rows on LinkRow, the maps grid on
// CardGrid, the address writer and select mode. Each list below only shrinks: a stale entry fails so nobody forgets.
// Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { braceBody, classStrings, read, webRoot } from './support.ts'

const srcFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()
const tsFiles = srcFiles.filter((file) => /\.tsx?$/.test(file))
const cssFiles = srcFiles.filter((file) => file.endsWith('.css'))

const tokens = (source: string) =>
  classStrings(source).flatMap((value) => value.replaceAll('\u0001', ' ').split(/\s+/))

/** The files a check finds must be exactly the allowed ones: a new one is an offender, a missing one is stale. */
function only(files: string[], check: (source: string) => boolean, allowed: string[], why: string) {
  const found = files.filter((file) => check(read(file)))
  assert.deepEqual(
    found.filter((file) => !allowed.includes(file)),
    [],
    `${why} (docs/design/ui-components.md)`,
  )
  assert.deepEqual(
    allowed.filter((file) => !found.includes(file)),
    [],
    'stale allowlist entry: remove it',
  )
}

// I34. A form, ability or appearance row is ItemRow.
const writesItemRow = (source: string) => tokens(source).includes('progitems__item')

test('a progression row is ItemRow', () => {
  assert.ok(writesItemRow('<li className="progitems__item">'))
  assert.ok(writesItemRow('<li className={`progitems__item ${extra}`}>'))
  assert.ok(!writesItemRow('<li className="progitems__items">'))
  only(tsFiles, writesItemRow, ['src/components/progression/ItemRow.tsx'], 'use ItemRow')
})

// I35. A rule row's title button (drawer or fold) is LinkRow's button mode.
const writesRuleToggle = (source: string) => tokens(source).includes('rulerow__toggle')

test('a rule row that opens or folds is LinkRow with onOpen or onToggle', () => {
  assert.ok(writesRuleToggle('<button className="rulerow__title rulerow__toggle">'))
  assert.ok(writesRuleToggle('<button className={`rulerow__toggle ${open}`}>'))
  assert.ok(!writesRuleToggle('<p className="rulerow__title">'))
  only(tsFiles, writesRuleToggle, ['src/components/LinkRow.tsx'], 'use LinkRow onOpen or onToggle')
})

// I36. The maps list is CardGrid: the hand grid is gone from markup and styles alike.
const MAPLIST = /^maplist($|__|--)/
const writesMapList = (source: string) => tokens(source).some((token) => MAPLIST.test(token))

test('the maps list is CardGrid', () => {
  assert.ok(writesMapList('<ul className="maplist">'))
  assert.ok(writesMapList('<ul className={`maplist ${extra}`}>'))
  assert.ok(writesMapList("<ul className={wide ? 'maplist--wide' : ''}>"))
  assert.ok(!writesMapList('<li className="mapcard">'))
  only(tsFiles, writesMapList, [], 'use CardGrid min={16} gap={5}')
  only(cssFiles, (css) => /\.maplist\b/.test(css), [], 'use CardGrid min={16} gap={5}')
})

// I37. An address copied and sent back to the first page by hand: `changed` and `pageParam` in lib/queryParams.ts.
const QUERY_WRITERS = [
  'src/lib/queryParams.ts',
  'src/components/FamilyDiscovery.tsx', // outside this stage's folders; its goToPage is pageParam
  'src/lib/useListFilters.ts', // outside this stage's folders; its write is changed with keepPage
  'src/lore/fieldFilters.ts', // appends a repeated key, which changed cannot write
]
const writesQueryByHand = (source: string) =>
  source.includes('new URLSearchParams(') && /\.delete\(\s*['"`]page['"`]\s*\)/.test(source)

test('an address written back to the first page uses changed or pageParam', () => {
  assert.ok(writesQueryByHand("const next = new URLSearchParams(current)\nnext.delete('page')"))
  assert.ok(writesQueryByHand('const next = new URLSearchParams(current)\nnext.delete(`page`)'))
  assert.ok(!writesQueryByHand("const next = new URLSearchParams(current)\nnext.delete('pin')"))
  assert.ok(!writesQueryByHand("changed(current, { page: null })\nnext.delete('page')"))
  only(
    tsFiles,
    writesQueryByHand,
    QUERY_WRITERS,
    'use changed or pageParam from lib/queryParams.ts',
  )
})

// I40. Select mode's verbs are useSelection: a selectPage of a caller wraps it, never builds the set itself.
function buildsSelectPage(source: string) {
  for (const m of source.matchAll(/function selectPage\s*\([^)]*\)\s*\{/g)) {
    if (/new Set\(/.test(braceBody(source, m.index + m[0].length - 1))) return true
  }
  for (const m of source.matchAll(/selectPage\s*=\s*\([^)]*\)\s*=>/g)) {
    if (/new Set\(/.test(source.slice(m.index, source.indexOf('\n', m.index + m[0].length) + 1)))
      return true
  }
  return false
}

test('Select page is useSelection', () => {
  assert.ok(buildsSelectPage('function selectPage() {\n  setSelection({ ids: new Set(ids) })\n}'))
  assert.ok(buildsSelectPage('const selectPage = () => setSelection({ ids: new Set(ids) })\n'))
  assert.ok(!buildsSelectPage('function selectPage() {\n  selecting.selectPage()\n}'))
  only(tsFiles, buildsSelectPage, ['src/lib/useSelection.ts'], 'use useSelection')
})
