// Run with `node --test uiContract/states.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps a failed read, a loading line, a quiet line and a screen reader message on their shared parts
// (#410): LoadError, LoadingNote, QuietNote, Announce, Callout, errorText and useAsyncRead.
// Each list below only shrinks, and a stale entry fails. Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { elements, read, tsxFiles, webRoot } from './support.ts'

const sourceFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

// Files that draw `notice notice--error` themselves (a `Callout` with that look), with the reason. LoadError is the
// shared part.
const ERROR_BLOCKS = new Map<string, string>([
  ['src/components/LoadError.tsx', 'the shared part'],
  ['src/components/admin/BackupFacts.tsx', 'action error: the backup job reported a problem'],
  ['src/components/lore/MassCreateBar.tsx', 'action error: a create that failed'],
  ['src/components/projects/NewProject.tsx', 'action error: a create that failed'],
  [
    'src/components/DisclosurePanel.tsx',
    "a row detail's read error: closing and opening reads again",
  ],
  ['src/components/worldLogic/FindingDetail.tsx', 'action error: a decision that failed'],
  [
    'src/components/worldLogic/WorldLogicIntegrity.tsx',
    'action error: a check that failed, and its cap',
  ],
  ['src/auth/routes.tsx', 'auth pages are out of #410 scope (Issue #410, leave list)'],
  [
    'src/pages/ConnectAuthorizePage.tsx',
    'consent errors: no access, invalid link; no re-read exists',
  ],
])

// Files that draw a `notice` box with role="status" themselves. LoadingNote is the part; a create or delete notice is
// a `Callout` holding a `<p role="status">`.
const STATUS_NOTICES = new Map<string, string>([
  ['src/components/LoadingNote.tsx', 'the part'],
  ['src/components/ideas/BoardToolbar.tsx', 'a connect prompt with Cancel, not a loading line'],
  [
    'src/components/worldLogic/MachinePanelBody.tsx',
    'a connect prompt with Cancel, not a loading line',
  ],
  [
    'src/components/worldLogic/WorldLogicIntegrity.tsx',
    'the cap on findings, drawn as an error block',
  ],
])

// Files that still declare their own read state. useAsyncRead holds `Load<T>`. The screens below key the state by the
// id they read for (so a switch never shows the old thing) or hold more than one outcome; `Load<T>` does neither.
const OWN_READ_STATES = new Map<string, string>([
  ['src/lib/useAsyncRead.ts', 'the shared Load<T> itself'],
  ['src/mcp/useConnectionRequest.ts', 'the consent flow is an auth page, out of #410 scope'],
  [
    'src/projects/useProjectRead.ts',
    'read through useAsyncRead; a story and a moved story are outcomes the page names by id',
  ],
  ['src/pages/PublicAuthorPage.tsx', 'keyed by slug; null stands for loading; PortalError retries'],
  ['src/pages/PublicLorePage.tsx', 'keyed by key; null stands for loading; PortalError retries'],
  ['src/pages/PublicStoryPage.tsx', 'keyed by key; null stands for loading; PortalError retries'],
  ['src/pages/PublicWorldPage.tsx', 'keyed by slug; null stands for loading; PortalError retries'],
])

// Files that set `kind: 'missing'` with no 404 test near it, with the reason.
const MISSING_WITHOUT_404 = new Map<string, string>([
  ['src/projects/useProjectRead.ts', 'missing is a story absent from the projects list, not a 404'],
])

type Guard = (source: string) => boolean

const tags = (source: string) =>
  ['p', 'div', 'span', 'Callout'].flatMap((name) =>
    elements(source, name).map((element) => element.tag),
  )
const noticeLook = (tag: string) => /look="notice"/.test(tag)

const drawsErrorBlock: Guard = (source) =>
  tags(source).some(
    (tag) =>
      /className="notice notice--error/.test(tag) || (noticeLook(tag) && /tone="error"/.test(tag)),
  )
const drawsStatusNotice: Guard = (source) =>
  tags(source).some(
    (tag) => (/className="notice[ "]/.test(tag) || noticeLook(tag)) && /role="status"/.test(tag),
  )
const drawsHiddenStatus: Guard = (source) =>
  tags(source).some((tag) => /className="visually-hidden"/.test(tag) && /role="status"/.test(tag))
const writesErrorText: Guard = (source) => /instanceof Error \?/.test(source)
// A read-state union: `{ kind: 'loading' }` beside another member, or a member that carries more fields or keys by
// id (`| { slug: string; kind: 'ready'; ... }`). Loading may be null in those, so a missing member counts too.
const declaresReadState: Guard = (source) =>
  /\{ kind: 'loading' \}\s*\||\|\s*\{[^}\n]*kind: '(loading|missing)'/.test(source)
// `kind: 'missing'` is a real 404 only: set it from isNotFound, a 404 status or the `missing:` option, a few lines apart.
const setsMissingWithout404: Guard = (source) => {
  const lines = source.split('\n')
  return lines.some(
    (line, index) =>
      /kind: 'missing'/.test(line) &&
      !/^\s*\|/.test(line) &&
      !/isNotFound|404|missing:/.test(lines.slice(Math.max(0, index - 4), index + 5).join('\n')),
  )
}
const usesMuted: Guard = (source) => /className="muted"/.test(source)

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
  assert.ok(drawsErrorBlock('<div className="notice notice--error" role="alert"><p>x</p></div>'))
  assert.ok(drawsErrorBlock('<Callout look="notice" tone="error" role="alert"><p>x</p></Callout>'))
  assert.ok(!drawsErrorBlock('<Callout look="notice" role="alert"><p>x</p></Callout>'))
  assert.ok(drawsStatusNotice('<p className="notice" role="status">x</p>'))
  assert.ok(drawsStatusNotice('<Callout look="notice" as="p" role="status">x</Callout>'))
  assert.ok(!drawsStatusNotice('<Callout look="notice"><p role="status">x</p></Callout>'))
  assert.ok(!drawsStatusNotice('<p className="notice__x" role="status">x</p>'))
  assert.ok(drawsHiddenStatus('<span className="visually-hidden" role="status">x</span>'))
  assert.ok(writesErrorText("e instanceof Error ? e.message : 'x'"))
  assert.ok(declaresReadState("type S = { kind: 'loading' } | { kind: 'ready' }"))
  assert.ok(declaresReadState("type S = | { slug: string; kind: 'missing' } | { kind: 'error' }"))
  assert.ok(
    declaresReadState(
      "type S =\n  | { kind: 'ready'; for: string }\n  | { kind: 'missing'; for: string }",
    ),
  )
  assert.ok(!declaresReadState("const a = { kind: 'ready', value: 1 }"))
  assert.ok(setsMissingWithout404("if (gone) {\n  setState({ kind: 'missing' })\n}"))
  assert.ok(!setsMissingWithout404("if (isNotFound(e)) {\n  setState({ kind: 'missing' })\n}"))
  assert.ok(!setsMissingWithout404("  | { kind: 'missing'; for: string }"))
  assert.ok(!setsMissingWithout404("status === 404 ? 'x' : 1\nsetState({ kind: 'missing' })"))
  assert.ok(usesMuted('<p className="muted">x</p>'))
})

test('a failed read is LoadError; only action errors draw their own block', () => {
  check(drawsErrorBlock, tsxFiles, ERROR_BLOCKS)
})

test('a loading line is LoadingNote, a create or delete notice is a Callout', () => {
  check(drawsStatusNotice, tsxFiles, STATUS_NOTICES)
})

test('a screen reader message is Announce', () => {
  check(drawsHiddenStatus, tsxFiles, new Set())
})

test('a caught error message is errorText', () => {
  check(writesErrorText, sourceFiles, new Set(['src/lib/errorText.ts']))
})

test('a read state is useAsyncRead; the list of own read states only shrinks', () => {
  check(declaresReadState, sourceFiles, OWN_READ_STATES)
})

test('kind: missing comes from a 404, never from a failed read', () => {
  check(setsMissingWithout404, sourceFiles, MISSING_WITHOUT_404)
})

test('no className="muted": it has no rule; QuietNote is the quiet line', () => {
  check(usesMuted, tsxFiles, new Set())
})
