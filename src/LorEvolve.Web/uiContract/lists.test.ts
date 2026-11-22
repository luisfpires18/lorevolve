// Run with `node --test uiContract/lists.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps a numbered list's pages, a growing list's Show more, a search box and the wait for typing on their shared
// parts (#411): Pager, ShowMore, SearchField and useDebouncedValue. Keeps a page's tail, a world rule's row and the
// excerpt's ellipsis on PagedList, WorldRuleRow and LinkRow excerptShortened (#456). Each list below only shrinks, and
// a stale entry fails. Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { braceBody, read, tsxFiles, webRoot } from './support.ts'

const sourceFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

// Header search bars, not list fields: each has its own look and form, with the reason.
const OWN_SEARCH = new Map<string, string>([
  [
    'src/components/PortalSearch.tsx',
    'portal header bar: a submit form with a clear button, drawn in the portal tokens',
  ],
  [
    'src/components/UniverseSearch.tsx',
    'workspace header combobox with a listbox popup and arrow keys',
  ],
])

// Timers that are not a typing wait: a debounce returns a settled value, these run an action on a clock.
const CLOCKS = new Map<string, string>([
  ['src/components/admin/DatabaseBackups.tsx', 'polls a running backup every 3 seconds'],
  ['src/components/SaveAction.tsx', 'the Saved note fades after 2 seconds'],
  ['src/export/api.ts', 'revokes a download address after the click'],
  ['src/lib/launch.ts', 'the opening waits for its animation'],
  ['src/lib/useArrivalMark.ts', 'the arrival highlight is removed after 2.4 seconds'],
  [
    'src/lib/useLocalDraft.ts',
    'saves the draft when typing stops and must also save it on leave, which a settled value cannot do',
  ],
  ['src/universes/useWorkspaceReads.ts', 'preloads the workspace after 2.5 seconds'],
])

// Pager users whose tail is not a pure move into PagedList, with the reason.
const OWN_TAIL = new Map<string, string>([
  [
    'src/components/admin/FeedbackScreen.tsx',
    'one ternary, and its pages are computed from totalCount and pageSize',
  ],
  ['src/components/admin/UsersScreen.tsx', 'a count line and a CardGrid, not a ul'],
  [
    'src/components/lore/LoreResults.tsx',
    'three empty states, gated by the chosen name, group or type',
  ],
  ['src/pages/TimelinePage.tsx', 'rows are TimelineStream groups, not a ul'],
  ['src/pages/UniversesPage.tsx', 'the empty state waits on isStarting'],
])

type Guard = (source: string) => boolean

const handPager: Guard = (source) => /className="pager"|pager__position/.test(source)
const handSearch: Guard = (source) => /type="search"/.test(source)
const handTimer: Guard = (source) => /\bsetTimeout\(/.test(source)
// The Show more label is ShowMore's own: the key read anywhere else draws the button by hand.
const handShowMoreLabel: Guard = (source) => /shell\.showMore\.label/.test(source)

// An `onClick={...}` that names a load-more handler: Show more is `ShowMore onMore={...}`.
const handShowMore: Guard = (source) =>
  [...source.matchAll(/onClick=\{/g)].some((m) =>
    /\b(showMore|loadMore|readMore)\b/.test(braceBody(source, m.index + m[0].length - 1)),
  )

// A page's tail by hand: the pager drawn beside its own check for a page with no rows.
const handPagedTail: Guard = (source) =>
  /<Pager[\s>]/.test(source) && /items\.length === 0/.test(source)
// The page-empty words are PagedList's own: the key read anywhere else draws that state by hand.
const handPageEmpty: Guard = (source) => /canon\.rules\.pageEmpty\./.test(source)
const handEllipsis: Guard = (source) => /isExcerptShortened\s*(\?|&&)/.test(source)
// The has-check chip is WorldRuleRow's own.
const handRuleRow: Guard = (source) => /canon\.rules\.checked/.test(source)

function check(
  guard: Guard,
  files: string[],
  allowed: Set<string> | Map<string, string>,
  message = 'use the shared part (docs/design/ui-components.md)',
) {
  const found = files.filter((file) => guard(read(file)))
  assert.deepEqual(
    found.filter((file) => !allowed.has(file)),
    [],
    message,
  )
  assert.deepEqual(
    [...allowed.keys()].filter((file) => !found.includes(file)),
    [],
    'stale allowlist entry: remove it',
  )
}

test('each guard catches the hand-written form', () => {
  assert.ok(handPager('<nav className="pager" aria-label="x">'))
  assert.ok(handPager('<span className="pager__position">1</span>'))
  assert.ok(!handPager('<Pager page={1} totalPages={2} onPage={go} />'))
  assert.ok(handShowMore('<Button onClick={loadMore}>More</Button>'))
  assert.ok(handShowMore('<button onClick={() => void readMore()}>More</button>'))
  assert.ok(!handShowMore('<ShowMore onMore={loadMore} />'))
  assert.ok(handShowMoreLabel("<Button>{t('shell.showMore.label')}</Button>"))
  assert.ok(!handShowMoreLabel('<ShowMore onMore={loadMore} />'))
  assert.ok(handSearch('<input type="search" />'))
  assert.ok(!handSearch('<SearchField value="" onChange={set} />'))
  assert.ok(handTimer('const t = setTimeout(() => go(), 150)'))
  assert.ok(handTimer('const t = window.setTimeout(go, 150)'))
  assert.ok(!handTimer('const settled = useDebouncedValue(typed)'))
  assert.ok(handPagedTail('{list.items.length === 0 ? <EmptyState /> : null}<Pager page={1} />'))
  assert.ok(!handPagedTail('<PagedList result={list} renderItem={row} empty={none} onPage={go} />'))
  assert.ok(handPageEmpty("<EmptyState title={t('canon.rules.pageEmpty.title')} />"))
  assert.ok(!handPageEmpty('<PagedList result={list} pageEmptyTestId="x-page-empty" />'))
  assert.ok(handEllipsis("{rule.isExcerptShortened ? '…' : null}"))
  assert.ok(handEllipsis("{rule.isExcerptShortened && '…'}"))
  assert.ok(!handEllipsis('<LinkRow excerptShortened={rule.isExcerptShortened} />'))
  assert.ok(handRuleRow("<span>{t('canon.rules.checked')}</span>"))
  assert.ok(!handRuleRow('<WorldRuleRow rule={rule} ids={ids} />'))
})

test('the pages of a list are Pager', () => {
  check(handPager, tsxFiles, new Set(['src/components/Pager.tsx']))
})

test('a page tail is PagedList, a world rule row is WorldRuleRow, an ellipsis is excerptShortened', () => {
  // B4 moves these into the shared parts; each list shrinks to the part alone.
  check(
    handPagedTail,
    tsxFiles,
    new Map([
      ...OWN_TAIL,
      ...[
        'src/components/canon/CanonResults.tsx',
        'src/components/ideas/RecordListPage.tsx',
        'src/components/worldLogic/WorldLogicIntegrity.tsx',
        'src/components/worldLogic/WorldLogicRules.tsx',
        'src/components/worldLogic/WorldLogicSystems.tsx',
        'src/components/worldRules/WorldRulesList.tsx',
        'src/pages/UniverseTrash.tsx',
      ].map((file) => [file, 'moves into PagedList in #456 B4'] as const),
    ]),
    'use PagedList',
  )
  check(
    handPageEmpty,
    tsxFiles,
    new Set([
      'src/components/worldLogic/WorldLogicIntegrity.tsx',
      'src/components/worldLogic/WorldLogicRules.tsx',
      'src/components/worldLogic/WorldLogicSystems.tsx',
      'src/components/worldRules/WorldRulesList.tsx',
    ]),
    'use PagedList pageEmptyTestId',
  )
  check(
    handEllipsis,
    tsxFiles,
    new Set([
      'src/components/worldLogic/SystemRow.tsx',
      'src/components/worldLogic/WorldLogicRules.tsx',
      'src/components/worldRules/WorldRulesList.tsx',
      'src/pages/IdeasPage.tsx',
    ]),
    'use LinkRow excerptShortened',
  )
  check(
    handRuleRow,
    tsxFiles,
    new Set([
      'src/components/worldLogic/WorldLogicRules.tsx',
      'src/components/worldRules/WorldRulesList.tsx',
    ]),
    'use WorldRuleRow',
  )
})

test('a growing list continues with ShowMore', () => {
  check(handShowMore, tsxFiles, new Set())
  check(handShowMoreLabel, sourceFiles, new Set(['src/components/ShowMore.tsx']))
})

test('a search box is SearchField; the two header bars are their own', () => {
  check(
    handSearch,
    tsxFiles,
    new Map([...OWN_SEARCH, ['src/components/SearchField.tsx', 'the shared part']]),
  )
})

test('a wait for typing is useDebouncedValue; a timer that is not one is listed with its reason', () => {
  check(
    handTimer,
    sourceFiles,
    new Map([...CLOCKS, ['src/lib/useDebouncedValue.ts', 'the shared part']]),
  )
})
