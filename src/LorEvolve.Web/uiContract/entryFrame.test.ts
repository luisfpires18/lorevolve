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

// The entry page draws a Lore or a project entry (#551): each Lore-only part is gated by `isLore`.
const LORE_ONLY_FILES = [
  'src/pages/EntityPage.tsx',
  ...['EntryHeader', 'EntryTools', 'EntryNotices', 'EntryForm', 'EntryArticleView'].map(
    (name) => `src/components/lore/${name}.tsx`,
  ),
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
]
// Comments cut out, their line breaks kept, so "the 12 lines above" counts the file's own lines.
const codeLines = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ''))
    .replace(/(^|\s)\/\/.*$/gm, '$1')
    .split('\n')
/** The Lore-only markers on a code line with no `isLore` on it or the 12 lines above. */
function ungated(source: string) {
  const lines = codeLines(source)
  return LORE_ONLY.filter((marker) =>
    lines.some(
      (line, at) =>
        line.includes(marker) &&
        !lines.slice(Math.max(0, at - 12), at + 1).some((one) => /\bisLore\b/.test(one)),
    ),
  )
}

test('the Lore-only gate fails on an ungated part and passes a gated one', () => {
  assert.deepEqual(ungated('{isLore ? (\n  <LoreOnMaps id={x} />\n) : null}'), [])
  assert.deepEqual(ungated('<LoreOnMaps id={x} />'), ['<LoreOnMaps'])
  assert.deepEqual(ungated('{isLore && access.publish ? (\n<ContentPublication'), [])
  assert.deepEqual(ungated('{/* isLore */}\n<CanonBadge />'), ['<CanonBadge'])
})

test('the entry page draws its Lore-only parts only for a Lore entry', () => {
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
