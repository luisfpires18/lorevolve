// Run with `node --test uiContract/smallParts.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps dates, counts, badges, chips, pictures, arrival marks, heading counts, button rows and loading blocks on their
// shared parts (#417). Each list below only shrinks: a stale entry fails so nobody forgets.
// Catalogue: docs/design/ui-components.md. Tracker: #248.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  classStrings,
  elements,
  read,
  rulesOf,
  stripComments,
  tsxFiles,
  webRoot,
} from './support.ts'
import { monogram } from '../src/lib/monogram.ts'

const srcFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()
const tsFiles = srcFiles.filter((file) => /\.tsx?$/.test(file))
const cssFiles = srcFiles.filter((file) => file.endsWith('.css'))

const EM_DASH = String.fromCharCode(0x2014)
const tokens = (source: string) => classStrings(source).flatMap((value) => value.split(/\s+/))

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

// 1. Dates: the formatters are DateText's; RevisionSnapshot returns a field's fact as text, not a node.
const callsDateFormatter = (source: string) => /\bformatDate(Time)?\(/.test(source)
const writesTimeElement = (source: string) => /<time[\s>]/.test(source)

// 2. Counts: a number a reader sees goes through formatCount.
const callsToLocaleString = (source: string) => /\.toLocaleString\(/.test(source)
const formatsCountByHand = (source: string) => /numberFormat\(\{\},\s*'en'\)/.test(source)

// 3. The empty-fact dash is EMPTY_FACT (and one regex class in mentions).
const writesEmptyDash = (source: string) => stripComments(source).includes(EM_DASH)

// 4. A lore status badge is CanonBadge.
const canonStatusBadge = (source: string) =>
  elements(source, 'StatusBadge').some(({ tag }) => /CANON_LABELS|canonStatus/.test(tag))

// 5. Chips and tags are TagList and GenreChips.
const writesChip = (source: string) =>
  tokens(source).some((token) => ['chip', 'chip--round', 'chip--danger', 'taglist'].includes(token))
const writesAdminTag = (source: string) =>
  tokens(source).some((token) => token.startsWith('admintag'))
const writesGenreChip = (source: string) => tokens(source).includes('genrechip')

// 6. An initial is monogram.
const takesFirstCharacter = (source: string) =>
  /\[\.\.\.[^\]]+\]\[0\]|Array\.from\(.*\)\[0\]/.test(source)

// 7. A picture that can fail is PictureWithFallback; an avatar is Avatar.
const writesOnError = (source: string) => /\bonError=/.test(source)
const writesAvatarMark = (source: string) => /data-avatar/.test(source)

// 8. The arrival mark is useArrivalMark's.
const marksArrival = (source: string) => /setAttribute\('data-arrived'|\bARRIVAL_MS\b/.test(source)
const stylesArrival = (source: string) => /\[data-arrived\]/.test(source)

// 9. A count beside a heading is HeadingCount.
const OLD_COUNTS = ['reviewsection__count', 'scene__count', 'mapscreen__count']
const writesOldCount = (source: string) =>
  tokens(source).some((token) => OLD_COUNTS.includes(token))
const stylesOldCount = (css: string) => OLD_COUNTS.some((token) => css.includes(`.${token}`))
const writesHeadingCount = (source: string) => tokens(source).includes('headingcount')

// 10. A button row is laid out by `.actions`; only these rows lay themselves out (a column that stretches, a dialog's).
// `.trash__actions` and `.familydetails__actions` keep their own two-axis gap but no flex of their own.
const OWN_ROWS = ['imagefield__actions', 'board__inspectoractions', 'confirm__actions']
const rowRuleWithOwnLayout = (css: string) =>
  rulesOf(css).some(
    ({ selector, body }) =>
      /\.[\w-]*actions(?![\w-])/.test(selector) &&
      !OWN_ROWS.some((row) => selector.includes(`.${row}`)) &&
      /display:\s*(inline-)?flex/.test(body) &&
      /\bgap:/.test(body),
  )

// 11. A place class that stays on a row comes with `actions`.
const PLACES = [
  'form__actions',
  'lore__resultactions',
  'cropper__actions',
  'drawer__actions',
  'editconflict__actions',
  'recovery__actions',
  'empty__actions',
  'editorbar__actions',
  'avatar__actions',
  'pageheader__actions',
  'actionbar__actions',
  'article__actions',
  'types__actions',
  'artwork__actions',
  'pincard__actions',
  'fieldlist__actions',
  'sectionlist__actions',
  'trash__actions',
  'familydetails__actions',
]
const rowWithoutActions = (source: string) =>
  classStrings(source).some((value) => {
    const parts = value.split(/\s+/)
    return parts.some((part) => PLACES.includes(part)) && !parts.includes('actions')
  })

// 12. A loading block's keyframes live once beside the card skeleton, and no other skeleton paints the portal card.
const hasSkeletonKeyframes = (css: string) => /@keyframes skeleton-appear\b/.test(css)
const paintsPortalCardSkeleton = (css: string) =>
  rulesOf(css).some(
    ({ selector, body }) =>
      /skeleton/.test(selector) &&
      !/\.pskeleton/.test(selector) &&
      /background:\s*var\(--portal-card\)/.test(body),
  )

test('the guards fail on a bad snippet and pass a good one', () => {
  assert.equal(writesTimeElement('<time dateTime={x}>{formatDateTime(x)}</time>'), true)
  assert.equal(callsDateFormatter("t('k', { date: formatDate(x) })"), true)
  assert.equal(callsDateFormatter('<DateText value={x} withTime />'), false)
  assert.equal(callsToLocaleString('{ n: count.toLocaleString() }'), true)
  assert.equal(callsToLocaleString('{ n: formatCount(count) }'), false)
  assert.equal(
    formatsCountByHand("const count = (n: number) => numberFormat({}, 'en').format(n)"),
    true,
  )
  assert.equal(formatsCountByHand('formatCount(n)'), false)
  assert.equal(writesEmptyDash(`{value || '${EM_DASH}'}`), true)
  assert.equal(writesEmptyDash(`<span>${EM_DASH}</span>`), true)
  assert.equal(writesEmptyDash('{value || EMPTY_FACT}'), false)
  assert.equal(
    canonStatusBadge('<StatusBadge step={e.canonStatus} label={CANON_LABELS[e.canonStatus]} />'),
    true,
  )
  assert.equal(canonStatusBadge('<StatusBadge step={story.status} label={label} />'), false)
  assert.equal(writesChip('<span className={`chip ${x}`}>a</span>'), true)
  assert.equal(writesChip('<TagList tags={tags} />'), false)
  assert.equal(writesAdminTag('<span className="admintag admintag--blocked">a</span>'), true)
  assert.equal(writesGenreChip('<li className="genrechip">a</li>'), true)
  assert.equal(takesFirstCharacter('Array.from(name.trim())[0]?.toLocaleUpperCase()'), true)
  assert.equal(takesFirstCharacter('const first = [...name][0]'), true)
  assert.equal(takesFirstCharacter('monogram(name)'), false)
  assert.equal(writesOnError('<img onError={() => setBroken(true)} />'), true)
  assert.equal(writesOnError('<PictureWithFallback src={url} fallback={blank} />'), false)
  assert.equal(writesAvatarMark('<span data-avatar="monogram" />'), true)
  assert.equal(marksArrival("target.setAttribute('data-arrived', 'true')"), true)
  assert.equal(marksArrival('const ARRIVAL_MS = 2400'), true)
  assert.equal(marksArrival('useArrivalMark({ targetId })'), false)
  assert.equal(stylesArrival('.row[data-arrived] { color: red; }'), true)
  assert.equal(writesOldCount('<span className="reviewsection__count">{n}</span>'), true)
  assert.equal(stylesOldCount('.scene__count { color: red; }'), true)
  assert.equal(writesHeadingCount('<span className="headingcount">{n}</span>'), true)
  assert.equal(writesHeadingCount('<HeadingCount n={n} />'), false)
  assert.equal(rowRuleWithOwnLayout('.foo__actions { display: flex; gap: 0.6rem; }'), true)
  assert.equal(rowRuleWithOwnLayout('.foo__actions { margin-left: auto; }'), false)
  assert.equal(rowRuleWithOwnLayout('.confirm__actions { display: flex; gap: 1rem; }'), false)
  assert.equal(rowWithoutActions('<div className={`editorbar__actions ${x}`} />'), true)
  assert.equal(rowWithoutActions('<div className="actions editorbar__actions" />'), false)
  assert.equal(hasSkeletonKeyframes('@keyframes skeleton-appear { from { opacity: 0; } }'), true)
  assert.equal(paintsPortalCardSkeleton('.foo--skeleton { background: var(--portal-card); }'), true)
  assert.equal(paintsPortalCardSkeleton('.pskeleton { background: var(--portal-card); }'), false)
})

test('dates are DateText, and only it writes a <time>', () => {
  only(
    tsxFiles,
    callsDateFormatter,
    ['src/components/DateText.tsx', 'src/components/lore/RevisionSnapshot.tsx'],
    'use DateText',
  )
  only(tsxFiles, writesTimeElement, ['src/components/DateText.tsx'], 'use DateText')
})

test('a count a reader sees is formatCount', () => {
  only(tsFiles, callsToLocaleString, [], 'use formatCount')
  only(tsFiles, formatsCountByHand, ['src/i18n/format.ts'], 'use formatCount')
})

test('the empty-fact dash is EMPTY_FACT', () => {
  only(tsFiles, writesEmptyDash, ['src/lore/facts.ts', 'src/lore/mentions.ts'], 'use EMPTY_FACT')
})

test('a lore status badge is CanonBadge', () => {
  only(tsxFiles, canonStatusBadge, ['src/components/CanonBadge.tsx'], 'use CanonBadge')
})

test('tags and genres are TagList and GenreChips', () => {
  only(tsxFiles, writesChip, ['src/components/TagList.tsx'], 'use TagList')
  only(tsxFiles, writesAdminTag, [], 'use TagList look="round"')
  only(tsxFiles, writesGenreChip, ['src/components/portal/GenreChips.tsx'], 'use GenreChips')
})

test('an initial is monogram', () => {
  // UniverseCard's plate letter is decorative and keeps the world's own case; CSS draws it from `data-initial`.
  only(
    tsFiles,
    takesFirstCharacter,
    ['src/components/UniverseCard.tsx', 'src/lib/monogram.ts'],
    'use monogram',
  )
})

test('a picture that can fail is PictureWithFallback, and an avatar is Avatar', () => {
  only(
    tsxFiles,
    writesOnError,
    ['src/components/PictureWithFallback.tsx'],
    'use PictureWithFallback',
  )
  only(tsxFiles, writesAvatarMark, ['src/components/Avatar.tsx'], 'use Avatar')
})

test('a row reached by a link is marked by useArrivalMark', () => {
  only(tsFiles, marksArrival, ['src/lib/useArrivalMark.ts'], 'use useArrivalMark')
  only(
    cssFiles,
    stylesArrival,
    ['src/styles/022-shared-surfaces.css'],
    'the mark has one rule, in 022-shared-surfaces.css',
  )
})

test('a count beside a heading is HeadingCount', () => {
  only(tsxFiles, writesOldCount, [], 'use HeadingCount')
  only(cssFiles, stylesOldCount, [], 'use HeadingCount')
  only(tsxFiles, writesHeadingCount, ['src/components/HeadingCount.tsx'], 'use HeadingCount')
})

test('a button row is laid out by .actions, not by its own rule', () => {
  const rest = cssFiles.filter((file) => !file.endsWith('006-buttons.css'))
  only(rest, rowRuleWithOwnLayout, [], 'use the .actions class')
})

test('a place class on a button row comes with .actions', () => {
  only(tsxFiles, rowWithoutActions, [], 'add the actions class to the row')
})

test('a loading block has one set of keyframes and one portal skeleton', () => {
  only(
    cssFiles,
    hasSkeletonKeyframes,
    ['src/styles/022-shared-surfaces.css'],
    'the keyframes live in 022-shared-surfaces.css',
  )
  // The Explore card's own skeleton is the card shell itself, which this task leaves alone.
  only(
    cssFiles,
    paintsPortalCardSkeleton,
    ['src/styles/099-explore-worlds-2.css'],
    'use the .pskeleton class',
  )
})

test('monogram takes the first character a name carries', () => {
  assert.equal(monogram('ana'), 'A')
  assert.equal(monogram(' '), '?')
  assert.equal(monogram('\u{1F600}x'), '\u{1F600}')
  assert.equal(monogram('', '·'), '·')
})
