// Run with `node --test uiContract/lists.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps a numbered list's pages, a growing list's Show more, a search box and the wait for typing on their shared
// parts (#411): Pager, ShowMore, SearchField and useDebouncedValue. Each list below only shrinks, and a stale entry
// fails. Catalogue: docs/design/ui-components.md.

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
  ['src/lib/useLocalDraft.ts', 'a draft is written after typing stops and flushed on leave'],
  ['src/lore/useEntryArrival.ts', 'the arrival highlight is removed after 2.4 seconds'],
  ['src/stories/useStoryArrival.ts', 'the arrival highlight is removed after 2.4 seconds'],
  ['src/universes/useWorkspaceReads.ts', 'preloads the workspace after 2.5 seconds'],
])

type Guard = (source: string) => boolean

const handPager: Guard = (source) => /className="pager"|pager__position/.test(source)
const handSearch: Guard = (source) => /type="search"/.test(source)
const handTimer: Guard = (source) => /\bsetTimeout\(/.test(source)

// An `onClick={...}` that names a load-more handler: Show more is `ShowMore onMore={...}`.
const handShowMore: Guard = (source) =>
  [...source.matchAll(/onClick=\{/g)].some((m) =>
    /\b(showMore|loadMore|readMore)\b/.test(braceBody(source, m.index + m[0].length - 1)),
  )

function check(guard: Guard, files: string[], allowed: Set<string> | Map<string, string>) {
  const found = files.filter((file) => guard(read(file)))
  assert.deepEqual(
    found.filter((file) => !allowed.has(file)),
    [],
    'use the shared part (docs/design/ui-components.md)',
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
  assert.ok(handSearch('<input type="search" />'))
  assert.ok(!handSearch('<SearchField value="" onChange={set} />'))
  assert.ok(handTimer('const t = setTimeout(() => go(), 150)'))
  assert.ok(handTimer('const t = window.setTimeout(go, 150)'))
  assert.ok(!handTimer('const settled = useDebouncedValue(typed)'))
})

test('the pages of a list are Pager', () => {
  check(handPager, tsxFiles, new Set(['src/components/Pager.tsx']))
})

test('a growing list continues with ShowMore', () => {
  check(handShowMore, tsxFiles, new Set())
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
