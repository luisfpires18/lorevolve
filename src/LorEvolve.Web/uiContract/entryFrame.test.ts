// Run with `node --test uiContract/entryFrame.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps an entry screen's frame on its shared parts (#456): the bar, the layout and the dates are EntryFrame's
// (components/lore/EntryFrame.tsx), and the type's link back is EntryHead's EntryTypeLink. Each list below only
// shrinks: a stale entry fails so nobody forgets.
// Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { classStrings, read, tsxFiles, webRoot } from './support.ts'

const tsFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .filter((file) => /\.tsx?$/.test(file))
  .sort()

const FRAME = 'src/components/lore/EntryFrame.tsx'

const tokens = (source: string) => classStrings(source).flatMap((value) => value.split(/\s+/))
const writes = (token: string) => (source: string) => tokens(source).includes(token)
const definesPictureShape = (source: string) => /\bfunction\s+pictureShape\b/.test(source)

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

test('the guards fail on a bad snippet and pass a good one', () => {
  assert.equal(writes('entry__bar')('<div className="entry__bar">'), true)
  assert.equal(writes('entry__bar')('<EntryBar tools={tools} />'), false)
  assert.equal(writes('entry__lenses')('<div className="entry__lenses" />'), true)
  assert.equal(writes('entry__tools')("<div className={x ? 'entry__tools' : ''}>"), true)
  assert.equal(writes('entry__layout')('<div className={`entry__layout ${x}`}>'), true)
  assert.equal(writes('entry__layout')('<EntryLayout picture={picture} view>'), false)
  assert.equal(writes('rail__meta')('<p className="rail__meta">'), true)
  assert.equal(writes('rail__meta')('<EntryDates createdAt={a} updatedAt={b} />'), false)
  assert.equal(writes('entry__type')('<Link className="entry__type" to={to}>'), true)
  assert.equal(writes('entry__type')('<TypeIcon className="entry__typeicon" />'), false)
  assert.equal(writes('entry__type')('<select className="entry__typepick">'), false)
  assert.equal(definesPictureShape('function pictureShape(image: Size) {'), true)
  assert.equal(definesPictureShape('data-shape={pictureShape(picture)}'), false)
})

test("an entry screen's bar is EntryBar", () => {
  only(tsxFiles, writes('entry__bar'), [FRAME], 'use EntryBar')
  only(tsxFiles, writes('entry__lenses'), [FRAME], 'use EntryBar')
  // ManuscriptTools draws a head's tools, not a bar.
  only(
    tsxFiles,
    writes('entry__tools'),
    [FRAME, 'src/components/stories/ManuscriptTools.tsx'],
    'use EntryBar',
  )
})

test("an entry screen's layout is EntryLayout, and only it says the picture's shape", () => {
  // A manuscript and a story's scenes lay out without a picture: EntryLayout would add data-picture to them.
  only(
    tsxFiles,
    writes('entry__layout'),
    [FRAME, 'src/components/ManuscriptParts.tsx', 'src/components/stories/StoryScenes.tsx'],
    'use EntryLayout',
  )
  only(tsFiles, definesPictureShape, [FRAME], 'use EntryLayout, which owns pictureShape')
})

test("an entry's dates are EntryDates", () => {
  only(tsxFiles, writes('rail__meta'), [FRAME], 'use EntryDates')
})

test("an entry's type link is EntryTypeLink", () => {
  only(tsxFiles, writes('entry__type'), ['src/components/EntryHead.tsx'], 'use EntryTypeLink')
})

// The entry page and the list draw a Lore or a project entry (#551): each Lore-only part is gated by `isLore`.
const LORE_ONLY_FILES = [
  'src/pages/EntityPage.tsx',
  'src/pages/LorePage.tsx',
  ...[
    'EntryHeader',
    'EntryTools',
    'EntryNotices',
    'EntryForm',
    'EntryArticleView',
    'LoreHeader',
    'LoreControls',
    'LoreResultActions',
    'LoreStatus',
    'LoreResults',
  ].map((name) => `src/components/lore/${name}.tsx`),
]
const LORE_ONLY = [
  '<EntryViewsNav',
  '<ContentPublication',
  '<PrivateNotes',
  '<LoreOnMaps',
  '<EntityArticleSection',
  '<CanonStatusPicker',
  '<CanonBadge',
  '<CanonBlockNotice',
  '<TokenInput',
  '<TagList',
  'entry-aliases',
  'family-tree/',
  'duplicate-entity',
  'suggest-entity',
  "'entity.page.form.noteArticle'",
  '"mass-create"',
  '<GroupSwitcher',
  '"lore-mass-created"',
]
// Comments cut out, their line breaks kept, so "the 12 lines above" counts the file's own lines.
const codeLines = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ''))
    .replace(/(^|\s)\/\/.*$/gm, '$1')
    .split('\n')
// A gate is `isLore` in a JSX condition that opens a branch (`{isLore ? (`, `isLore && <X`) or an early return
// (`if (!isLore) return`). A line that only declares, destructures or reads it as a value (`isLore: boolean`,
// `isLore,`, `isLore = true`, `const x = isLore ? a : b`, `label={isLore ? a : b}`) gates nothing, and neither
// does `!isLore`, which draws the branch for a project.
const INLINE_GATE = /(?<!!)\bisLore\b.*?(\?|&&)\s*</
const OPEN_GATE = /(?<!!)\bisLore\b.*(\?|&&)\s*\(\s*$/
const RETURN_GATE = /\bif\s*\(\s*!isLore\s*\)\s*return\b/
/** A gate on the marker's own line: the marker sits in the branch after `?` or `&&`, not past a `:` into the else. */
function inlineGated(line: string, marker: string) {
  const gate = INLINE_GATE.exec(line)
  if (!gate) return false
  const branch = line.slice(gate.index + gate[0].length - 1)
  const at = branch.indexOf(marker)
  return at >= 0 && !branch.slice(0, at).includes(':')
}
/** The branch a gate line opens is still open at the end of `text`: its `(` is never closed on the way. */
function stillOpen(text: string) {
  let depth = 1
  for (const char of text) {
    depth += char === '(' ? 1 : char === ')' ? -1 : 0
    if (depth <= 0) return false
  }
  return true
}
/** A marker passes with a gate on its own line, an early return above it, or a branch opened in the 12 lines above
 * and still open at the marker: a nearby branch that closed first gates nothing. */
function gated(lines: string[], at: number, marker: string) {
  if (inlineGated(lines[at], marker)) return true
  const before = lines[at].slice(0, lines[at].indexOf(marker))
  for (let from = at - 1; from >= Math.max(0, at - 12); from--) {
    if (RETURN_GATE.test(lines[from])) return true
    if (OPEN_GATE.test(lines[from]) && stillOpen([...lines.slice(from + 1, at), before].join('\n')))
      return true
  }
  return false
}
/** The Lore-only markers on a code line with no open `isLore` gate. */
function ungated(source: string) {
  const lines = codeLines(source)
  return LORE_ONLY.filter((marker) =>
    lines.some((line, at) => line.includes(marker) && !gated(lines, at, marker)),
  )
}

test('the Lore-only gate fails on an ungated part and passes a gated one', () => {
  assert.deepEqual(ungated('{isLore ? (\n  <LoreOnMaps id={x} />\n) : null}'), [])
  assert.deepEqual(ungated('<LoreOnMaps id={x} />'), ['<LoreOnMaps'])
  assert.deepEqual(ungated('{isLore && access.publish ? (\n<ContentPublication'), [])
  assert.deepEqual(ungated('{/* isLore */}\n<CanonBadge />'), ['<CanonBadge'])
  assert.deepEqual(ungated('  isLore: boolean\n}) {\n  return <CanonBadge />'), ['<CanonBadge'])
  assert.deepEqual(ungated('  isLore,\n  isLore = true,\n}) => <TagList />'), ['<TagList'])
  assert.deepEqual(ungated('const x = isLore ? a : b\n<CanonBadge />'), ['<CanonBadge'])
  assert.deepEqual(ungated("label={isLore ? t('a') : t('b')}\n<TagList />"), ['<TagList'])
  assert.deepEqual(ungated('  isLore: boolean\n{isLore ? (\n  <CanonBadge />'), [])
  assert.deepEqual(ungated('{isLore && (\n  <CanonBadge />'), [])
  assert.deepEqual(ungated('{isLore && <CanonBadge />}'), [])
  assert.deepEqual(ungated('{isNew && isLore ? (\n  <TagList />'), [])
  assert.deepEqual(ungated('if (!isLore) return null\nreturn <PrivateNotes />'), [])
  assert.deepEqual(ungated('{isLore ? (\n  <A />\n) : null}\n<CanonBadge />'), ['<CanonBadge'])
  assert.deepEqual(ungated('{isLore ? (\n  <div>\n    <CanonBadge />'), [])
  assert.deepEqual(ungated('{isLore && x ? (\n  <A onClick={() => f(y)} />\n  <CanonBadge />'), [])
  assert.deepEqual(ungated('{!isLore ? (\n  <CanonBadge />'), ['<CanonBadge'])
  assert.deepEqual(ungated('{!isLore && <CanonBadge />}'), ['<CanonBadge'])
  assert.deepEqual(ungated('{!isLore && (\n  <CanonBadge />'), ['<CanonBadge'])
  assert.deepEqual(ungated('if (isLore) return null\nreturn <PrivateNotes />'), ['<PrivateNotes'])
  assert.deepEqual(ungated('{isLore ? <A /> : <GroupSwitcher />}'), ['<GroupSwitcher'])
  assert.deepEqual(ungated('{isLore ? <GroupSwitcher /> : <A />}'), [])
  assert.deepEqual(ungated('<CanonBadge /> {isLore && <A />}'), ['<CanonBadge'])
})

test('the entry page and the list draw their Lore-only parts only for a Lore source', () => {
  const found = LORE_ONLY_FILES.flatMap((file) =>
    ungated(read(file)).map((marker) => `${file} ${marker}`),
  )
  assert.deepEqual(found, [], 'gate it with isLore')
  const code = LORE_ONLY_FILES.map((file) => codeLines(read(file)).join('\n')).join('\n')
  assert.deepEqual(
    LORE_ONLY.filter((marker) => !code.includes(marker)),
    [],
    'stale marker: remove it',
  )
})
