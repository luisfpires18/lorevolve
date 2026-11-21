// Run with `node --test uiContract/cssTwins.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps the stylesheets from growing the same rule twice (#456). A column with one gap is `.stack` plus `--2`, `--3` or
// `--4`; a column list is `.plainlist .stack`; the drawer and the confirm title share one rule; the too-long count is
// `.toolong`; the shelf card's picture is one `.shelfcard img` rule. A new rule with one of these declaration blocks is
// an offender: put the utility class on the markup instead. The sheets load in numeric order, so a utility lives in
// `022-utilities.css`. Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { read, rulesOf, webRoot } from './support.ts'

const stylesDir = join(webRoot, 'src/styles')
const sheets = readdirSync(stylesDir)
  .filter((file) => file.endsWith('.css'))
  .sort()

/** A declaration block with its order, spacing and a trailing semicolon left out: two equal blocks read the same. */
const block = (declarations: string) =>
  declarations
    .split(';')
    .map((declaration) =>
      declaration
        .trim()
        .replace(/\s*:\s*/, ': ')
        .replace(/\s+/g, ' '),
    )
    .filter(Boolean)
    .sort()
    .join('; ')

const column = 'display: flex; flex-direction: column'

// A bare column, a bare list reset and the gap-5 column are not here: a few sheets still write them out (listed in the
// stage 16 PR) and they are not part of this guard yet.
const WATCHED: { why: string; body: string; only: string[] }[] = [
  ...[2, 3, 4].map((step) => ({
    why: `a column with the gap of space-${step} is .stack .stack--${step}`,
    body: block(`${column}; gap: var(--space-${step})`),
    only: [],
  })),
  {
    why: 'an unmarked column list is .plainlist .stack',
    body: block(`${column}; list-style: none; margin: 0; padding: 0`),
    only: [],
  },
  {
    why: 'a drawer and a confirm title share one rule',
    body: block(
      'font-family: var(--display); font-size: var(--text-section); font-weight: 400; line-height: 1.25; margin: 0; overflow-wrap: anywhere',
    ),
    only: ['.confirm__title, .drawer__title'],
  },
  {
    why: 'the too-long count is .toolong (CharCount `toolong`)',
    body: block('flex: 1 1 100%; order: -1; margin: 0'),
    only: ['.toolong'],
  },
  {
    why: 'a shelf card picture is one `.shelfcard img` rule',
    body: block('position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover'),
    only: ['.shelfcard img'],
  },
]

/** The rules of a sheet that carry a watched block under a selector that is not the block's own. */
function twinsIn(css: string) {
  const found: string[] = []
  for (const rule of rulesOf(css)) {
    const body = block(rule.body)
    const selector = rule.selector.replace(/\s+/g, ' ')
    for (const watched of WATCHED) {
      if (body === watched.body && !watched.only.includes(selector)) {
        found.push(`${selector}: ${watched.why}`)
      }
    }
  }
  return found
}

test('no stylesheet writes a rule the shared utilities already are', () => {
  const found = sheets.flatMap((sheet) =>
    twinsIn(read(`src/styles/${sheet}`)).map((twin) => `${sheet} ${twin}`),
  )
  assert.deepEqual(found, [], 'use the utility class on the markup (docs/design/ui-components.md)')
})

test('each utility is defined once, in 022-utilities.css', () => {
  const css = read('src/styles/022-utilities.css')
  const selectors = rulesOf(css).map((rule) => rule.selector)
  for (const name of ['.stack', '.stack--2', '.stack--3', '.stack--4', '.plainlist', '.toolong']) {
    assert.equal(
      selectors.filter((selector) => selector === name).length,
      1,
      `${name} is defined once`,
    )
  }
  for (const sheet of sheets.filter((file) => file !== '022-utilities.css')) {
    const again = rulesOf(read(`src/styles/${sheet}`)).filter((rule) =>
      /^\.(stack(--\d)?|plainlist|toolong)$/.test(rule.selector),
    )
    assert.deepEqual(again, [], `${sheet} redefines a utility`)
  }
})

const COLUMN_3 = '.a {\n  display: flex;\n  flex-direction: column;\n  gap: var(--space-3);\n}'
const COVER = 'position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover'

test('self test: a copy of a watched block is an offender, whatever its order or spacing', () => {
  assert.equal(twinsIn(COLUMN_3).length, 1)
  assert.equal(twinsIn('.a { gap:var(--space-2); flex-direction:column; display:flex }').length, 1)
  assert.equal(
    twinsIn(
      '.a, .b { display: flex; flex-direction: column; list-style: none; margin: 0; padding: 0 }',
    ).length,
    1,
  )
  assert.equal(twinsIn('.a { flex: 1 1 100%; margin: 0; order: -1; }').length, 1)
  assert.equal(twinsIn(`.a img { ${COVER} }`).length, 1)
  assert.equal(twinsIn(`@media (max-width: 40rem) {\n  ${COLUMN_3}\n}`).length, 1)
})

test('self test: the shared rules themselves and a different block are not offenders', () => {
  assert.deepEqual(twinsIn('.toolong { flex: 1 1 100%; order: -1; margin: 0; }'), [])
  assert.deepEqual(twinsIn(`.shelfcard img { ${COVER}; }`), [])
  assert.deepEqual(
    twinsIn('.a { display: flex; flex-direction: column; gap: var(--space-5); }'),
    [],
  )
  assert.deepEqual(
    twinsIn('.a { display: flex; flex-direction: column; gap: var(--space-3); min-width: 0; }'),
    [],
  )
})
