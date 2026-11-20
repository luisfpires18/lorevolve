// Run with `node --test uiContract/callouts.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps message boxes and confirm focus on their shared parts (#456): Callout draws every `.notice` and `.callout`,
// useConfirmFocus moves the focus into an inline confirm and back. Each list below only shrinks, and a stale entry
// fails. Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { braceBody, classStrings, read, tsxFiles, webRoot } from './support.ts'

const sourceFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

// Files that write a `notice` or `callout` class by hand, with the reason. Callout itself is the part.
const HAND_CALLOUTS = new Map<string, string>([
  ['src/components/Callout.tsx', 'the part'],
  ['src/auth/routes.tsx', 'auth pages are not touched by #456'],
  ['src/pages/ForgotPasswordPage.tsx', 'auth pages are not touched by #456'],
  ['src/pages/RegisterPage.tsx', 'auth pages are not touched by #456'],
  ['src/pages/ResetPasswordPage.tsx', 'auth pages are not touched by #456'],
])

// Files whose effect focuses a confirm or its panel by hand. useConfirmFocus is the part.
const HAND_CONFIRM_FOCUS = new Set(['src/lib/useConfirmFocus.ts'])

const CALLOUT_CLASS = /(^|\s)(notice|callout)(--[\w-]+|__[\w-]+)?(\s|$)/
const writesCallout = (source: string) =>
  classStrings(source).some((value) => CALLOUT_CLASS.test(value))

// A ref whose name ends in confirm or panel (`confirm`, `deleteConfirm`, `bulkPanelRef`), focused inside a useEffect.
const CONFIRM_FOCUS = /\b\w*(confirm|panel)(Ref)?\.current\??\.focus\(/i
const focusesConfirm = (source: string) =>
  [...source.matchAll(/useEffect\(\s*\(\)\s*=>\s*\{/g)].some((m) =>
    CONFIRM_FOCUS.test(braceBody(source, m.index + m[0].length - 1)),
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
