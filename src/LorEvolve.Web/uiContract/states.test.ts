// Run with `node --test uiContract/states.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps a failed read, a loading line, a quiet line and a screen reader message on their shared parts
// (#410): LoadError, LoadingNote, QuietNote, Announce, OutcomeNotice, errorText and useAsyncRead.
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

// Files that draw `notice notice--error` by hand, with the reason. LoadError is the shared part.
const ERROR_BLOCKS = new Map<string, string>([
  ['src/components/admin/BackupFacts.tsx', 'action error: the backup job reported a problem'],
  ['src/components/lore/MassCreateBar.tsx', 'action error: a create that failed'],
  ['src/components/projects/NewProject.tsx', 'action error: a create that failed'],
  ['src/components/worldLogic/FindingDetail.tsx', 'action error: a decision that failed'],
  ['src/components/worldLogic/FindingRow.tsx', 'action error: a decision that failed'],
  ['src/components/worldLogic/SystemRow.tsx', 'action error: a change that failed'],
  [
    'src/components/worldLogic/WorldLogicIntegrity.tsx',
    'action error: a check that failed, and its cap',
  ],
  [
    'src/pages/ConnectAuthorizePage.tsx',
    'consent errors: no access, invalid link; no re-read exists',
  ],
])

// Files that draw a `notice` with role="status" by hand. LoadingNote and OutcomeNotice are the parts.
const STATUS_NOTICES = new Map<string, string>([
  ['src/components/ideas/BoardToolbar.tsx', 'a connect prompt with Cancel, not a loading line'],
  [
    'src/components/worldLogic/MachineNotices.tsx',
    'a connect prompt with Cancel, not a loading line',
  ],
  [
    'src/components/worldLogic/WorldLogicIntegrity.tsx',
    'the cap on findings, drawn as an error block',
  ],
])

// Files that still declare their own read state with `kind: 'loading'`. useAsyncRead holds `Load<T>`.
const OWN_READ_STATES = new Set(['src/lib/useAsyncRead.ts'])

type Guard = (source: string) => boolean

const tags = (source: string) =>
  ['p', 'div', 'span'].flatMap((name) => elements(source, name).map((element) => element.tag))

const drawsErrorBlock: Guard = (source) =>
  tags(source).some((tag) => /className="notice notice--error/.test(tag))
const drawsStatusNotice: Guard = (source) =>
  tags(source).some((tag) => /className="notice[ "]/.test(tag) && /role="status"/.test(tag))
const drawsHiddenStatus: Guard = (source) =>
  tags(source).some((tag) => /className="visually-hidden"/.test(tag) && /role="status"/.test(tag))
const writesErrorText: Guard = (source) => /instanceof Error \?/.test(source)
const declaresReadState: Guard = (source) =>
  /\{ kind: 'loading' \}\s*\||\|\s*\{ kind: 'loading' \}/.test(source)
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
  assert.ok(drawsStatusNotice('<p className="notice" role="status">x</p>'))
  assert.ok(!drawsStatusNotice('<p className="notice__x" role="status">x</p>'))
  assert.ok(drawsHiddenStatus('<span className="visually-hidden" role="status">x</span>'))
  assert.ok(writesErrorText("e instanceof Error ? e.message : 'x'"))
  assert.ok(declaresReadState("type S = { kind: 'loading' } | { kind: 'ready' }"))
  assert.ok(usesMuted('<p className="muted">x</p>'))
})

test('a failed read is LoadError; only action errors draw their own block', () => {
  check(drawsErrorBlock, tsxFiles, ERROR_BLOCKS)
})

test('a loading line is LoadingNote, a create or delete notice is OutcomeNotice', () => {
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

test('no className="muted": it has no rule; QuietNote is the quiet line', () => {
  check(usesMuted, tsxFiles, new Set())
})
