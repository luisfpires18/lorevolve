// Run with `node --test uiContract.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps the UI on its shared parts. Each list below only shrinks: a task that fixes a file removes
// the file from the list in its own PR, and a stale entry fails so nobody forgets.
// Catalogue: docs/design/ui-components.md. Tracker: #248.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { classStrings, filesWith, read, tsxFiles, webRoot } from './uiContract/support.ts'

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
  ['boardlist', '#248'],
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
  ['namelist', '#248'],
  ['pauthor__worlds', '#248'],
  ['plore', '#248'],
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
const MAX_LITERAL_FONT_SIZES = 194

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
  // The error is drawn after the control unless `errorAbove` asks for it before.
  assert.ok(source.includes('className="field__error"'), 'Field.tsx must draw the error')
  const at = [
    '{labelNode}',
    'field__hint',
    '{control}',
    '{props.errorAbove ? null : errorNode}',
  ].map((part) => render.indexOf(part))
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

const RAW_BUTTON_CLASS = /(^|\s)(icon)?button(\s|$)/
const isRawButton = (source: string) =>
  classStrings(source).some((value) => RAW_BUTTON_CLASS.test(value))

const rawButtonFiles = tsxFiles
  .filter((file) => !['src/components/Button.tsx', 'src/components/IconButton.tsx'].includes(file))
  .filter((file) => isRawButton(read(file)))

test('the raw button guard sees every way a class can be written', () => {
  for (const raw of [
    'className="button button--secondary"',
    "className={'iconbutton'}",
    'className={`button ${tone}`}',
    'className={`${extra} iconbutton`}',
    'className={`button button--sm ${extra}`}',
    "className={busy ? 'button' : 'quiet'}",
    'className={`row ${wide ? "button" : ""}`}',
    "triggerClassName={'button'}",
    'triggerClassName={`button ${extra}`}',
    'className={`a\n  button\n  ${b}`}',
  ]) {
    assert.equal(isRawButton(`<x ${raw} />`), true, raw)
  }
  for (const fine of [
    'className="buttonrow"',
    'className={`button--${tone}`}',
    'className={buttonClass(tone)}',
    'className="feedbackbutton__thanks"',
  ]) {
    assert.equal(isRawButton(`<x ${fine} />`), false, fine)
  }
})

test('no raw .button or .iconbutton class outside Button and IconButton', () => {
  assert.deepEqual(
    rawButtonFiles,
    [],
    'Use Button or IconButton from components/, see docs/design/ui-components.md',
  )
})

// The only files that may call buttonClass() or iconButtonClass(): each draws something that is not
// a <button> or a Link, so it cannot render Button. Fixed, not a list that shrinks.
const BUTTON_CLASS_CALLERS = new Map<string, string>([
  [
    'src/components/ActionMenu.tsx',
    'its trigger can be an avatar or a pill, so it keeps its own button',
  ],
  ['src/components/LoreFieldFilters.tsx', 'an ActionMenu trigger styled as a button'],
  ['src/components/ProjectEntitiesView.tsx', 'an ActionMenu trigger styled as a button'],
  ['src/components/lore/TypeLevelMenus.tsx', 'an ActionMenu trigger styled as a button'],
  ['src/components/EntityImageField.tsx', 'a label that opens the file input'],
  ['src/components/FieldImageRow.tsx', 'a label that opens the file input'],
  ['src/components/ProfileAvatar.tsx', 'a label that opens the file input'],
  ['src/components/UniverseArtworkField.tsx', 'a label that opens the file input'],
  ['src/components/lore/AppearanceGallery.tsx', 'a label that opens the file input'],
])

test('buttonClass() and iconButtonClass() are called only where a component cannot go', () => {
  const callers = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
    .map((file) => 'src/' + file.replaceAll('\\', '/'))
    .filter((file) => /\.tsx?$/.test(file))
    .filter(
      (file) => !/^src\/(lib\/buttonClass\.ts|components\/(Button|IconButton)\.tsx)$/.test(file),
    )
    .filter((file) => /\b(buttonClass|iconButtonClass)\(/.test(read(file)))
    .sort()
  assert.deepEqual(
    callers,
    [...BUTTON_CLASS_CALLERS.keys()].sort(),
    'Draw a button with Button or IconButton; only a file input label or ActionMenu trigger takes the class helper',
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
