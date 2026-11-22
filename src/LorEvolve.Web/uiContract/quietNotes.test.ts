// Run with `node --test uiContract/quietNotes.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps the quiet lines on their shared part (#456): QuietNote draws a settings note and a "saved" line, so no file
// writes `settings__note` or `settings__saved`. `entry__blank`, `projectcard__meta` and a hint outside a Field
// (`field__hint`) are drawn by it too; the few files that stay are listed below, the list only shrinks, and a stale
// entry fails.
// Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { classStrings, read, webRoot } from './support.ts'

const codeFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

// A class string with the token: a plain class, a ternary branch or a template literal. The mark `literals()`
// puts for `${...}` is split off, so "settings__note ${x}" still counts.
const writes = (source: string, token: string) =>
  classStrings(source).some((value) =>
    value.replaceAll('\u0001', ' \u0001').split(/\s+/).includes(token),
  )

test('the quiet note guard catches a hand-written line, template-built classes included', () => {
  assert.ok(writes('<p className="settings__note">{m}</p>', 'settings__note'))
  assert.ok(writes('<p className="settings__saved extra">{m}</p>', 'settings__saved'))
  assert.ok(writes('<p className={`settings__note ${extra}`}>{m}</p>', 'settings__note'))
  assert.ok(writes("<p className={ok ? 'muted' : 'settings__saved'}>{m}</p>", 'settings__saved'))
  assert.ok(!writes('<QuietNote spacing="block">{m}</QuietNote>', 'settings__note'))
  assert.ok(!writes('<p className="settings__notes">{m}</p>', 'settings__note'))
  assert.ok(
    writes(
      '<QuietNote size="body" className="relations__quiet">{m}</QuietNote>',
      'relations__quiet',
    ),
  )
  assert.ok(!writes('<ReadingNote testId="x">{m}</ReadingNote>', 'relations__quiet'))
})

test('a settings note and a saved line are drawn by QuietNote', () => {
  for (const token of ['settings__note', 'settings__saved']) {
    assert.deepEqual(
      codeFiles.filter((file) => writes(read(file), token)),
      [],
      `use <QuietNote spacing="block"> or <QuietNote tone="saved"> from components/QuietNote (${token})`,
    )
  }
})

// Still hand-written, each for a reason a QuietNote would change: the three hints below carry a class of their own whose
// sheet loads before `.field__hint`, so the margin they end up with comes from that rule; CharCount and the shared
// Field and CheckField draw the hint class for good; a hint after a segmented control takes the `.segmented +`
// margin; EraRelations styles a `summary`, which QuietNote cannot be. `relations__quiet` is `ReadingNote`'s own class.
const STAYS: Record<string, string[]> = {
  entry__blank: [],
  projectcard__meta: [],
  relations__quiet: ['src/components/QuietNote.tsx'],
  field__hint: [
    'src/components/CharCount.tsx',
    'src/components/CheckField.tsx',
    'src/components/EraRelations.tsx',
    'src/components/Field.tsx',
    'src/components/TypeGroupsField.tsx',
    'src/components/lore/MassCreateDefaults.tsx',
    'src/components/timeline/MomentDating.tsx',
    'src/components/universes/InviteForm.tsx',
  ],
}

test('the other quiet lines only stay where the list says', () => {
  for (const [token, allowed] of Object.entries(STAYS)) {
    const found = codeFiles.filter((file) => writes(read(file), token))
    assert.deepEqual(
      found.filter((file) => !allowed.includes(file)),
      [],
      `${token}: use QuietNote or ReadingNote, or Field hint under a control`,
    )
    assert.deepEqual(
      allowed.filter((file) => !found.includes(file)),
      [],
      `${token}: stale allowlist entry, remove it`,
    )
  }
})
