// Run with `node --test uiContract/formMessage.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps the red line under a form on its shared part (#456): FormMessage draws the `form__message`
// paragraph, so no other file writes that class. The list below only shrinks, and a stale entry fails.
// Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { classStrings, read, tsxFiles, webRoot } from './support.ts'

// Files that may still write their own line. Empty since the auth pages moved onto FormMessage.
const PUBLIC_PAGES: string[] = []

const codeFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

// A class string with the `form__message` token: a plain class, a ternary branch or a template literal.
// The mark `literals()` puts for `${...}` is split off, so "form__message ${x}" still counts.
const handWritten = (source: string) =>
  classStrings(source).some((value) =>
    value.replaceAll('\u0001', ' \u0001').split(/\s+/).includes('form__message'),
  )

// An action's feedback pair drawn by hand: a ternary on `isError` (not an `isError?:` type) choosing the line.
const pairsFeedback = (source: string) => /\bisError\s*\?\s*[(<]/.test(source)

// Files that draw their own feedback pair.
const FEEDBACK_PAIRS = [
  'src/components/ReviewSuggestions.tsx',
  'src/components/aiChanges/AiChangeNotices.tsx',
]

test('the form message guard catches a hand-written line, template-built classes included', () => {
  assert.ok(handWritten('<p className="form__message" role="alert">{m}</p>'))
  assert.ok(handWritten('<p className="form__message article__failure">{m}</p>'))
  assert.ok(handWritten('<p className={`form__message ${extra}`}>{m}</p>'))
  assert.ok(handWritten("<p className={ok ? 'callout' : 'form__message'}>{m}</p>"))
  assert.ok(!handWritten('<FormMessage testId="x">{m}</FormMessage>'))
  assert.ok(!handWritten('<p className="form__messages">{m}</p>'))
  assert.ok(
    pairsFeedback(
      'feedback.isError ? (<FormMessage ref={line}>x</FormMessage>) : (<Callout look="callout">x</Callout>)',
    ),
  )
  assert.ok(!pairsFeedback('<FeedbackLine feedback={feedback} line={feedbackLine} testId="x" />'))
  assert.ok(!pairsFeedback('type F = { isError?: boolean }'))
})

test('a form message is drawn by FormMessage', () => {
  const allowed = PUBLIC_PAGES
  const found = codeFiles.filter(
    (file) => file !== 'src/components/FormMessage.tsx' && handWritten(read(file)),
  )
  assert.deepEqual(
    found.filter((file) => !allowed.includes(file)),
    [],
    'use <FormMessage> from components/FormMessage',
  )
  assert.deepEqual(
    allowed.filter((file) => !found.includes(file)),
    [],
    'stale allowlist entry: remove it',
  )
})

test("an action's feedback line is FeedbackLine", () => {
  const found = tsxFiles.filter((file) => pairsFeedback(read(file)))
  assert.deepEqual(
    found.filter((file) => !FEEDBACK_PAIRS.includes(file)),
    [],
    'use <FeedbackLine> from components/FormMessage',
  )
  assert.deepEqual(
    FEEDBACK_PAIRS.filter((file) => !found.includes(file)),
    [],
    'stale allowlist entry: remove it',
  )
})
