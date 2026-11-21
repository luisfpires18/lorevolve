// Run with `node --test uiContract/deadCss.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps a class nobody writes out of the stylesheets (#456): every class selector in `src/styles/` is a whole word in
// some string of a `.ts` or `.tsx` file under `src/` (a class string, or a part of a template string such as
// `button ${tone}`), or it belongs to a family the code builds from a template or a library adds on its own. The
// allowlist below only shrinks: an entry that no longer covers a class fails, so nobody forgets it.
// Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { literals, read, rulesOf, stripComments, webRoot } from './support.ts'

const srcFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()
const sheets = srcFiles.filter((file) => file.endsWith('.css'))
const codeFiles = srcFiles.filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))

/** Classes the code builds from a template or a library sets itself: a name the search cannot find as a whole word. */
const BUILT: { family: RegExp; why: string }[] = [
  {
    family: /^(avatar__photo|accountmenu__avatar|pauthor__photo|adminuser__avatar)--blank$/,
    why: '`${className}--blank` (Avatar)',
  },
  { family: /^accountmenu--/, why: '`accountmenu--${variant}` (AccountMenu)' },
  { family: /^quietnote--/, why: '`quietnote--${spacing}` and its sizes (QuietNote)' },
  { family: /^callout--/, why: '`${look}--${tone}` (Callout)' },
  { family: /^(idea|rule|story)row(__title|__meta)?$/, why: '`${look}row__*` (LinkRow)' },
  { family: /^cardgrid--(min|gap)-\d+$/, why: '`cardgrid--min-*` and `--gap-*` (CardGrid)' },
  { family: /^showmore--/, why: '`showmore--${align}` (ShowMore)' },
  { family: /^contents--/, why: '`contents--${name}` (OverviewContents)' },
  {
    family: /^(publication|settings|trash)__confirm(title)?$/,
    why: '`${look}__confirm*` (InlineConfirm)',
  },
  { family: /^sectiontitle--/, why: '`sectiontitle--${size}` (Section)' },
  { family: /^confirm--/, why: '`confirm--${variant}` (ConfirmDialog)' },
  { family: /^story--manuscript$/, why: '`story--${kind}` (the story shell)' },
  { family: /^ideas--/, why: '`ideas--${scope.kind}` (IdeasPage)' },
  { family: /^facts--/, why: '`facts--${look}` (FactList)' },
  { family: /^contentpub(__trigger)?--/, why: '`contentpub--${placement}` (ContentPublication)' },
  { family: /^aichangeprose__text--/, why: '`aichangeprose__text--${kind}` (ProseChange)' },
  { family: /^shelfcard--/, why: '`shelfcard--${frame}` (ShelfCard)' },
  {
    family: /^(reactEasyCrop_CropArea|is-editor-empty)$/,
    why: 'added by react-easy-crop and TipTap, not by our code',
  },
]

/** Every whole word in every string of the code, a template's `${...}` cutting its text into the words around it. */
function wordsIn(sources: string[]) {
  const words = new Set<string>()
  for (const source of sources) {
    for (const text of literals(stripComments(source))) {
      for (const word of text.replaceAll('\u0001', ' ').split(/\s+/)) words.add(word)
    }
  }
  return words
}

/** Every class a stylesheet's selectors name (attribute values are not classes). */
function classesIn(css: string) {
  const found = new Set<string>()
  for (const { selector } of rulesOf(css)) {
    for (const match of selector.replace(/\[[^\]]*\]/g, '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      found.add(match[1])
    }
  }
  return found
}

const unused = (css: string, words: Set<string>) =>
  [...classesIn(css)].filter((name) => !words.has(name))
const notBuilt = (names: string[]) =>
  names.filter((name) => !BUILT.some(({ family }) => family.test(name)))

const words = wordsIn(codeFiles.map((file) => read(file)))
const allUnused = [...new Set(sheets.flatMap((sheet) => unused(read(sheet), words)))]

test('every class in the stylesheets is written by some code, or is a built family', () => {
  assert.deepEqual(notBuilt(allUnused), [], 'delete the rule, or add the class to its component')
})

test('each built family still covers a class that nothing writes out whole', () => {
  const stale = BUILT.filter(({ family }) => !allUnused.some((name) => family.test(name)))
  assert.deepEqual(
    stale.map(({ why }) => why),
    [],
    'stale allowlist entry: remove it',
  )
})

test('self test: a class nobody writes is found, one in a class string or a template is not', () => {
  const css =
    '.used {} .tpl {} .alone {} .alone:hover {} @media (min-width: 40rem) { .gone > .used {} }'
  const code = ['<p className="used" />', 'const x = `tpl ${tone}`']
  assert.deepEqual(unused(css, wordsIn(code)), ['alone', 'gone'])
})

test('self test: a family built from a template is allowed only by its entry', () => {
  const css = '.quietnote--wide {} .quietnote {} .other--wide {}'
  const code = ['<p className={`quietnote quietnote--${size}`} />']
  assert.deepEqual(notBuilt(unused(css, wordsIn(code))), ['other--wide'])
})

test('self test: comments and attribute values are not classes or uses', () => {
  const css = "a[href$='.pdf'] {} .real {}"
  assert.deepEqual([...classesIn(css)], ['real'])
  assert.deepEqual(unused('.shown {}', wordsIn(['// className="shown"\nconst a = 1'])), ['shown'])
})
