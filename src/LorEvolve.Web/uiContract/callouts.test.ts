// Run with `node --test uiContract/callouts.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps message boxes and confirm focus on their shared parts (#456): Callout draws every `.notice` and `.callout`,
// useConfirmFocus moves the focus into an inline confirm and back. Each list below only shrinks, and a stale entry
// fails. Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { classStrings, read, tsxFiles, webRoot } from './support.ts'

const sourceFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

// Files that write a `notice` or `callout` class by hand, with the reason. Callout itself is the part.
const HAND_CALLOUTS = new Map<string, string>([['src/components/Callout.tsx', 'the part']])

// Files whose effect focuses a confirm or its panel by hand. useConfirmFocus is the part.
const HAND_CONFIRM_FOCUS = new Set(['src/lib/useConfirmFocus.ts'])

const CALLOUT_CLASS = /(^|\s)(notice|callout)(--[\w-]+|__[\w-]+)?(\s|$)/
const writesCallout = (source: string) =>
  classStrings(source).some((value) => CALLOUT_CLASS.test(value))

// A ref whose name ends in confirm, panel or erase (`confirm`, `deleteConfirm`, `bulkPanelRef`, `eraseRef`), focused
// inside a useEffect: `?.focus(`, `!.focus(` or `.focus(`, with a braced body or an arrow without braces.
const CONFIRM_FOCUS = /\b\w*(confirm|panel|erase)(Ref)?\.current[?!]?\.focus\(/i

// The text between the `(` at `open` and its matching `)`. Quotes are not tracked: an apostrophe in a comment is
// common, a lone parenthesis in a string inside an effect is not.
function parenBody(source: string, open: number): string {
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++
    else if (source[i] === ')' && --depth === 0) return source.slice(open + 1, i)
  }
  return source.slice(open + 1)
}

const focusesConfirm = (source: string) =>
  [...source.matchAll(/useEffect\(/g)].some((m) =>
    CONFIRM_FOCUS.test(parenBody(source, m.index + m[0].length - 1)),
  )

function onlyAllowed(found: string[], allowed: Set<string> | Map<string, string>) {
  const names = [...allowed.keys()]
  assert.deepEqual(
    found.filter((file) => !names.includes(file)),
    [],
    'New offender: use the shared part, see docs/design/ui-components.md',
  )
  assert.deepEqual(
    names.filter((file) => !found.includes(file)),
    [],
    'No longer an exception: remove it from the list',
  )
}

test('the guards fail on a bad snippet', () => {
  assert.equal(writesCallout('<p className="notice">x</p>'), true)
  assert.equal(writesCallout('<div className="callout callout--warning x">'), true)
  assert.equal(writesCallout('<p className="callout__title">'), true)
  assert.equal(writesCallout('<p className={`notice ${extra}`}>'), true)
  assert.equal(writesCallout("<p className={on ? 'notice notice--error' : 'x'}>"), true)
  assert.equal(writesCallout('<p className="ideas__notice">'), false)
  assert.equal(writesCallout('<p className={`callout-${x}`}>'), false)
  assert.equal(
    focusesConfirm('useEffect(() => {\n  if (open) confirm.current?.focus()\n}, [open])'),
    true,
  )
  assert.equal(
    focusesConfirm('useEffect(() => {\n  if (open) bulkPanelRef.current?.focus()\n}, [open])'),
    true,
  )
  assert.equal(
    focusesConfirm('useEffect(() => {\n  if (p) problemRef.current?.focus()\n}, [p])'),
    false,
  )
  assert.equal(
    focusesConfirm('useEffect(() => {\n  if (erasing) eraseRef.current?.focus()\n}, [erasing])'),
    true,
  )
  assert.equal(focusesConfirm('useEffect(() => {\n  confirmRef.current!.focus()\n}, [x])'), true)
  assert.equal(focusesConfirm('useEffect(() => panel.current?.focus(), [open])'), true)
  assert.equal(focusesConfirm('function go() {\n  confirm.current?.focus()\n}'), false)
})

test('a notice or callout box is Callout, except the listed files', () => {
  onlyAllowed(
    tsxFiles.filter((file) => writesCallout(read(file))),
    HAND_CALLOUTS,
  )
})

test("a confirm's focus effect is useConfirmFocus", () => {
  onlyAllowed(
    sourceFiles.filter((file) => focusesConfirm(read(file))),
    HAND_CONFIRM_FOCUS,
  )
})
