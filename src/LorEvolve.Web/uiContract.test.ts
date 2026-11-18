// Run with `node --test uiContract.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps the UI on its shared parts. Each list below only shrinks: a task that fixes a file removes
// the file from the list in its own PR, and a stale entry fails so nobody forgets.
// Catalogue: docs/design/ui-components.md. Tracker: #248.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const webRoot = import.meta.dirname

// Classes kept with no rule on purpose, because code or an E2E spec reads them as a hook.
// Only shrinks. Each entry says who reads it.
const HOOK_ONLY = new Map<string, string>([
  ['entitycard__status', 'E2E text-direction.spec.ts reads it'],
  ['entry__head', 'E2E shell-layout and text-direction specs read it'],
  ['moment__player', 'E2E timeline and text-direction specs read it'],
])

// Classes used in a .tsx file with no rule in src/styles/, mapped to the Issue that removes them.
// Only shrinks. #248 means no child Issue removes it: owner decision at the end of the tracker.
const UNDEFINED_TODAY = new Map<string, string>([
  ['aichange', '#248'],
  ['aichanges', '#248'],
  ['aichanges__summary', '#248'],
  ['article__historytoggle', '#248'],
  ['artwork', '#248'],
  ['board', '#248'],
  ['board__layout', '#248'],
  ['boardcanvas__controls', '#248'],
  ['boardlist', '#248'],
  ['chapter__name', '#248'],
  ['checkbox', '#248'],
  ['chron', '#248'],
  ['chronologypage', '#248'],
  ['collab', '#248'],
  ['colourfield', '#248'],
  ['connect__url', '#248'],
  ['connectdrawer', '#248'],
  ['connectedapps', '#248'],
  ['connectedapps__controls', '#248'],
  ['consent__form', '#248'],
  ['contents__heading', '#248'],
  ['entitycard__tile', '#248'],
  ['entry__article', '#248'],
  ['entry__fieldimages', '#252'],
  ['era__body', '#248'],
  ['era__run', '#248'],
  ['eranav', '#248'],
  ['eras--reading', '#248'],
  ['family', '#248'],
  ['family__othername', '#248'],
  ['history__actions', '#248'],
  ['history__item', '#248'],
  ['history__line', '#248'],
  ['idea__preview', '#248'],
  ['ideapicker', '#248'],
  ['ideas__outcome', '#248'],
  ['integrity', '#248'],
  ['knowledge', '#248'],
  ['knowledge__list', '#248'],
  ['lore__loading', '#248'],
  ['lorecontext', '#248'],
  ['loretrigger', '#248'],
  ['manuscript__editor', '#248'],
  ['maps', '#248'],
  ['mapscreen', '#248'],
  ['masscreate', '#248'],
  ['months--reading', '#248'],
  ['muted', '#248'],
  ['namelist', '#248'],
  ['pauthor__worlds', '#248'],
  ['plore', '#248'],
  ['plotarc__name', '#248'],
  ['portal__workspace', '#248'],
  ['privatenote', '#248'],
  ['profile__publicname', '#248'],
  ['pstory', '#248'],
  ['pstory__head', '#248'],
  ['pstory__scene', '#248'],
  ['publication__form', '#248'],
  ['publish', '#248'],
  ['publish__status', '#248'],
  ['pworld', '#248'],
  ['pworld--loading', '#248'],
  ['pworld-hero__text', '#248'],
  ['quickcreate', '#248'],
  ['recovery__since', '#248'],
  ['relation__kind', '#248'],
  ['relation__menu', '#248'],
  ['relation__span', '#248'],
  ['relations__group', '#248'],
  ['relform__subject', '#248'],
  ['restore__summary', '#248'],
  ['reviewtrigger', '#248'],
  ['scene__refs--beats', '#248'],
  ['settings', '#248'],
  ['stories', '#248'],
  ['storylinks', '#248'],
  ['terms', '#248'],
  ['terms__new', '#248'],
  ['termselect', '#248'],
  ['token__note', '#248'],
  ['trash', '#248'],
  ['typegroups', '#248'],
  ['types', '#248'],
  ['types__trashed', '#248'],
  ['unisearch__excerpttext', '#248'],
])

// Files that write their own <dialog>. The five that stay: Drawer and four that are not drawers.
const DIALOG_FILES = [
  'src/components/ConfirmDialog.tsx',
  'src/components/Drawer.tsx',
  'src/components/FamilyMemberDetails.tsx',
  'src/components/ImageCropDialog.tsx',
  'src/components/ImageViewer.tsx',
]

// Font sizes written as a literal in src/styles/ instead of a --text-* token. Only goes down:
// lower it when a screen's sizes move to tokens.
const MAX_LITERAL_FONT_SIZES = 200

const tsxFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.tsx'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

const read = (file: string) => readFileSync(join(webRoot, file), 'utf8')
const stylesheet = readdirSync(join(webRoot, 'src/styles'))
  .filter((file) => file.endsWith('.css'))
  .sort()
  .map((file) => read('src/styles/' + file))
  .join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '')

const definedClasses = new Set(
  [...stylesheet.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1]),
)

// className="a b" and the default-parameter form className = 'a b'. Template literals and {...} are skipped.
const usedClasses = new Map<string, Set<string>>()
for (const file of tsxFiles) {
  for (const match of read(file).matchAll(/className\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    for (const name of (match[1] ?? match[2]).split(/\s+/).filter(Boolean)) {
      if (!usedClasses.has(name)) usedClasses.set(name, new Set())
      usedClasses.get(name)!.add(file)
    }
  }
}

const filesWith = (pattern: RegExp) => tsxFiles.filter((file) => pattern.test(read(file)))

test('styles.css imports every file in src/styles/ once, in order', () => {
  const imported = [...read('src/styles.css').matchAll(/^@import '\.\/styles\/(.+)';$/gm)].map(
    (match) => match[1],
  )
  const onDisk = readdirSync(join(webRoot, 'src/styles'))
    .filter((file) => file.endsWith('.css'))
    .sort()
  assert.deepEqual(imported, onDisk, 'a part left out of styles.css never reaches the page')
})

test('every class a component uses has a rule in src/styles/', () => {
  const missing = [...usedClasses]
    .filter(
      ([name]) => !definedClasses.has(name) && !HOOK_ONLY.has(name) && !UNDEFINED_TODAY.has(name),
    )
    .map(([name, files]) => `.${name} (${[...files].sort().join(', ')})`)
  assert.deepEqual(
    missing,
    [],
    'Add a rule to src/styles/, or reuse a class from docs/design/ui-components.md',
  )

  const stale = [...HOOK_ONLY.keys(), ...UNDEFINED_TODAY.keys()].filter(
    (name) => definedClasses.has(name) || !usedClasses.has(name),
  )
  assert.deepEqual(stale, [], 'Now defined or unused: remove it from the list')
})

test('no new hand-written <dialog>', () => {
  const found = filesWith(/<dialog/)
  assert.deepEqual(
    found.filter((file) => !DIALOG_FILES.includes(file)),
    [],
    'Use the shared drawer or ConfirmHost instead of a new <dialog>',
  )
  assert.deepEqual(
    DIALOG_FILES.filter((file) => !found.includes(file)),
    [],
    'No longer writes a <dialog>: remove it from DIALOG_FILES',
  )
})

test('no native prompt, alert or confirm', () => {
  const files = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.test.ts'))
    .sort()
    .map((file) => 'src/' + file.replaceAll('\\', '/'))
  assert.deepEqual(
    files.filter((file) => /\bwindow\.(prompt|alert|confirm)\s*\(/.test(read(file))),
    [],
    'Use confirmAction or a Drawer form instead of a browser dialog',
  )
})

test('no field is written as label > span.field__label', () => {
  assert.deepEqual(
    filesWith(/<span[^>]*field__label/),
    [],
    'Use Field (label, hint, control, error) instead of a span label',
  )
})

test('field__label appears only in Field.tsx', () => {
  assert.deepEqual(
    filesWith(/field__label/).filter((file) => file !== 'src/components/Field.tsx'),
    [],
    'Use Field (label, hint, control, error)',
  )
})

test('Field renders label, hint, control, error in that order', () => {
  const source = readFileSync(join(webRoot, 'src/components/Field.tsx'), 'utf8')
  const render = source.slice(source.lastIndexOf('return ('))
  const at = ['{labelNode}', 'field__hint', '{control}', 'field__error'].map((part) =>
    render.indexOf(part),
  )
  assert.ok(
    at.every((index) => index >= 0),
    'Field.tsx must render all four parts in one return',
  )
  assert.deepEqual(
    at,
    [...at].sort((a, b) => a - b),
    'Field order must stay label, hint, control, error',
  )
  assert.equal(source.includes('<span className="field__label"'), false)
  // The group form hands its control the group role, the label join and the hint and error join.
  assert.match(
    source,
    /role: 'group',\s*'aria-labelledby': labelId,\s*'aria-describedby': describedBy/,
  )
})

// Folders whose .tsx files still write a raw .button or .iconbutton class: the conversion to Button and
// IconButton (#408) goes folder by folder, and each commit removes its entry. A listed folder with no raw
// use left fails, so the list cannot go stale. Temporary: the last conversion commit deletes it.
const RAW_BUTTON_PENDING = new Set<string>([
  'src/components/trash',
  'src/components/universes',
  'src/components/relationships',
  'src/components/publishing',
  'src/components/admin',
  'src/components/aiChanges',
  'src/components/familyTree',
  'src/components/backups',
  'src/components/canon',
  'src/components/ruleValidation',
  'src/components/knowledge',
  'src/components/suggestions',
  'src/components/worldRules',
  'src/components/search',
  'src/pages',
  'src/routes',
  'src/auth',
])

// Every quoted class string in a file: className="..." or any prop ending in className/ClassName
// (triggerClassName counts), and each literal inside className={...}.
function classStrings(source: string): string[] {
  const found: string[] = []
  for (const m of source.matchAll(/[A-Za-z]*[cC]lassName\s*=\s*(["'])((?:(?!\1)[^\n])*)\1/g)) {
    found.push(m[2])
  }
  for (const m of source.matchAll(/className=\{([^}]*)\}/g)) {
    for (const q of m[1].matchAll(/(["'`])((?:(?!\1)[^\n])*)\1/g)) found.push(q[2])
  }
  return found
}

const RAW_BUTTON_CLASS = /(^|\s)(icon)?button(\s|$)/
const rawButtonFiles = tsxFiles
  .filter((file) => !['src/components/Button.tsx', 'src/components/IconButton.tsx'].includes(file))
  .filter((file) => classStrings(read(file)).some((value) => RAW_BUTTON_CLASS.test(value)))
const folderOf = (file: string) => file.slice(0, file.lastIndexOf('/'))

test('no raw .button or .iconbutton class outside Button and IconButton', () => {
  assert.deepEqual(
    rawButtonFiles.filter((file) => !RAW_BUTTON_PENDING.has(folderOf(file))),
    [],
    'Use Button or IconButton from components/, see docs/design/ui-components.md',
  )
})

test('RAW_BUTTON_PENDING lists only folders that still have a raw button class', () => {
  const live = new Set(rawButtonFiles.map(folderOf))
  assert.deepEqual(
    [...RAW_BUTTON_PENDING].filter((folder) => !live.has(folder)),
    [],
    'Remove the folder from RAW_BUTTON_PENDING',
  )
})

test('literal font sizes in src/styles/ do not grow', () => {
  let count = 0
  for (const match of stylesheet.matchAll(/(?<![-\w])font-size\s*:\s*([^;}]+)/g)) {
    const value = match[1].trim()
    if (/\d/.test(value) && !value.startsWith('var(')) count++
  }
  assert.ok(
    count <= MAX_LITERAL_FONT_SIZES,
    `${count} literal font sizes, limit ${MAX_LITERAL_FONT_SIZES}: use a --text-* token`,
  )
  assert.equal(count, MAX_LITERAL_FONT_SIZES, 'Fewer than the limit: lower MAX_LITERAL_FONT_SIZES')
})
