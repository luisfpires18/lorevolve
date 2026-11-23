// Run with `node --test uiContract/fields.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps form fields on their shared parts (#415): Field for a label, hint, control, count and error
// (its textarea and select forms carry the classes), CheckField for one yes or no option, CharCount
// for a count against a limit, SegmentedField for a choice as a field, PercentField for a position,
// useFormSave for a save's refusal and useImagePick for an image's size check. Each list below only
// shrinks, and a stale entry fails. Catalogue: docs/design/ui-components.md.

import { register } from 'node:module'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classStrings, elements, read, tsxFiles, webRoot } from './support.ts'

// `en.ts` imports its parts without file extensions; this hook lets Node find the `.ts` file.
register(
  'data:text/javascript,' +
    encodeURIComponent(
      "export async function resolve(s, c, next) { try { return await next(s, c) } catch (e) { if (s.startsWith('.') && /ERR_(MODULE_NOT_FOUND|UNSUPPORTED_DIR_IMPORT)/.test(e.code)) return next(s + '.ts', c); throw e } }",
    ),
)

// Code files as well as components: a save's catch and an image check live in `.ts` hooks too.
const codeFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

// Class tokens split on spaces and on the mark `literals()` puts for `${...}`.
const tokens = (source: string) =>
  classStrings(source).flatMap((value) =>
    value.replaceAll('\u0001', ' \u0001').split(/\s+/).filter(Boolean),
  )
const hasToken = (source: string, names: string[]) =>
  tokens(source).some((token) => names.includes(token))

const ALERT = /\brole=(?:\{[^}]*)?["']alert["']/
const SEGMENTS = ['SegmentedControl', 'CanonStatusPicker']
const PERCENT = /<span aria-hidden="true">%<\/span>/
const FIELD_ERRORS_COUNT = /Object\.keys\(\s*[\w.]+\.fieldErrors\s*\)\.length/
const SIZE_CHECK = /file\.size\s*>\s*IMAGE_MAX_BYTES/
const KIND_LIST = /FieldKind\.\w+,\s*label:/

// A tag with role="alert" and no class, or with `field__error`: a loose error.
const looseAlerts = (source: string) =>
  ['p', 'span', 'div'].some((name) =>
    elements(source, name).some(
      ({ tag }) =>
        ALERT.test(tag) && (!/[cC]lassName\s*=/.test(tag) || hasToken(tag, ['field__error'])),
    ),
  )
// A textarea or select styled as a field that lacks its form's class.
const bareControls = (source: string) =>
  (['textarea', 'select'] as const).some((name) =>
    elements(source, name).some(({ tag }) => {
      const own = tokens(tag)
      return (
        own.includes('field__input') &&
        !own.includes(`field__input--${name === 'select' ? 'select' : 'area'}`)
      )
    }),
  )
const checkLabels = (source: string) =>
  elements(source, 'label').some(({ tag }) => hasToken(tag, ['check', 'checkbox']))
const spreadSegments = (source: string) =>
  SEGMENTS.some((name) => elements(source, name).some(({ tag }) => /\{\s*\.\.\.\w+\s*\}/.test(tag)))
// `used` passed to t(), tn() or tx(): a count's words.
const usedArgument = (source: string) => /\bt[nx]?\(\s*[^,()]+,\s*\{[^}]*\bused:/.test(source)

const found = (files: string[], match: (source: string) => boolean) =>
  files.filter((file) => match(read(file)))

function check(files: string[], allowed: string[], say: string) {
  assert.deepEqual(
    files.filter((file) => !allowed.includes(file)),
    [],
    say,
  )
  assert.deepEqual(
    allowed.filter((file) => !files.includes(file)),
    [],
    'stale allowlist entry: remove it',
  )
}

const c = (file: string) => `src/components/${file}.tsx`
const s = (file: string) => `src/${file}`

test('the field guards catch a hand-made field, template-built classes included', () => {
  assert.ok(looseAlerts('<p role="alert">{message}</p>'))
  assert.ok(looseAlerts('<span role="alert">{error}</span>'))
  assert.ok(looseAlerts('error={<span role="alert">{why}</span>}'))
  assert.ok(looseAlerts('<p className={`field__error ${extra}`} role="alert">{x}</p>'))
  assert.ok(!looseAlerts('<p className="form__message" role="alert">{message}</p>'))
  assert.ok(!looseAlerts('<FormMessage testId="x">{message}</FormMessage>'))
  assert.ok(!looseAlerts('<p className={`notice ${tone}`} role="alert">{x}</p>'))

  assert.ok(bareControls('<textarea className="field__input" value={v} />'))
  assert.ok(bareControls('<textarea className={`field__input ${extra}`} value={v} />'))
  assert.ok(bareControls('<select {...control} className="field__input">{o}</select>'))
  assert.ok(!bareControls('<textarea className="field__input field__input--area" />'))
  assert.ok(!bareControls('<select className={`field__input field__input--select ${x}`} />'))
  assert.ok(!bareControls('<select className={select} />'))

  assert.ok(checkLabels('<label className="check"><input type="checkbox" /></label>'))
  assert.ok(checkLabels('<label className={`checkbox ${x}`}>'))
  assert.ok(!checkLabels('<label className="checklist">'))

  assert.ok(spreadSegments('<SegmentedControl {...control} options={o} />'))
  assert.ok(spreadSegments('<CanonStatusPicker {...group} value={v} />'))
  assert.ok(!spreadSegments('<SegmentedControl label={l} options={o} />'))

  assert.ok(usedArgument("t('x.count', { used: count(n), max })"))
  assert.ok(usedArgument('t(key, {\n  used: format(used),\n})'))
  assert.ok(!usedArgument('count={{ used: draft.body.length, max }}'))
  assert.ok(!usedArgument('const unused = 1'))
  assert.ok(PERCENT.test('<span aria-hidden="true">%</span>'))
  assert.ok(FIELD_ERRORS_COUNT.test('Object.keys(error.fieldErrors).length === 0'))
  assert.ok(!FIELD_ERRORS_COUNT.test('Object.keys(fieldErrors).length'))
  assert.ok(SIZE_CHECK.test('if (file.size > IMAGE_MAX_BYTES) {'))
  assert.ok(!SIZE_CHECK.test('if (file.size > MAP_IMAGE_MAX_BYTES) {'))
  assert.ok(KIND_LIST.test('{ kind: FieldKind.Number, label: () => t(k) }'))
})

test('a field error is drawn by Field, CheckField or CharCount', () => {
  check(
    found(tsxFiles, (source) => hasToken(source, ['field__error'])),
    [
      c('CharCount'),
      c('CheckField'),
      c('Field'),
      // Class d: the name block's own error, linked by id; an era row's inline error; a guard block's problems.
      c('lore/EntryHeader'),
      c('progression/EraFieldRow'),
      c('worldLogic/Block'),
    ],
    'draw the error through Field error, CheckField error or CharCount',
  )
})

test('an alert is a Field error with announce, a form__message or a state part', () => {
  check(
    found(tsxFiles, looseAlerts),
    [c('Field'), c('EditConflict'), c('worldLogic/Block')],
    'pass the error to Field with announce, or use <FormMessage>',
  )
})

test('a textarea or select styled as a field carries its form class', () => {
  check(found(tsxFiles, bareControls), [], 'use Field as="textarea" or as="select"')
})

test('the textarea and select rules live in 005-forms.css only', () => {
  const styles = readdirSync(join(webRoot, 'src/styles')).filter((file) => file.endsWith('.css'))
  const whole = /(^|,|\})\s*\.field__input--(area|select)\s*(,|\{)/m
  const holders = styles.filter((file) =>
    whole.test(readFileSync(join(webRoot, 'src/styles', file), 'utf8')),
  )
  assert.deepEqual(
    holders,
    ['005-forms.css'],
    'keep the --area and --select rules in 005-forms.css',
  )
  assert.ok(whole.test('.field__input--area {'))
  assert.ok(!whole.test('.masscreate__default .field__input--select {'))
})

test('one yes or no option is CheckField', () => {
  check(
    found(tsxFiles, checkLabels),
    [
      c('CheckField'),
      c('FieldInputs'),
      // Options of one fieldset, a box per list row, a toggle in a row, a filter bar, radios.
      c('lore/EntryCopyPanel'),
      c('ProgressionItemForm'),
      c('PublicDetailsForm'),
      c('FamilyTreeTypes'),
      c('NameLinker'),
      c('WorldRuleCheckSection'),
    ],
    'use CheckField',
  )
})

test('a count against a limit is CharCount', () => {
  check(
    found(tsxFiles, usedArgument),
    [
      c('CharCount'),
      // Storage use and a group's use, not a character count.
      c('admin/UserDetail'),
      c('StorageUsage'),
      c('lore/TypeGroupRow'),
    ],
    'use Field count or CharCount',
  )
})

test('a choice as a field is SegmentedField or CanonStatusPicker field', () => {
  check(
    found(tsxFiles, spreadSegments),
    [c('SegmentedField'), c('CanonStatusPicker')],
    'use SegmentedField, or CanonStatusPicker field',
  )
})

test('a position in percent is PercentField', () => {
  check(
    found(tsxFiles, (source) => PERCENT.test(source)),
    [c('PercentField')],
    'use PercentField',
  )
})

test("a save's refusal goes through useFormSave", () => {
  check(
    found(codeFiles, (source) => FIELD_ERRORS_COUNT.test(source)),
    [
      s('lib/useFormSave.ts'),
      // Auth is left as it is; publishing shows the refused fields as a list, not a form.
      s('pages/RegisterPage.tsx'),
      s('publishing/publishActions.ts'),
      // Another shape: one errors object, the form's own line beside the two fields.
      s('components/universes/InviteForm.tsx'),
    ],
    'use useFormSave',
  )
})

test("an image's size check is useImagePick", () => {
  check(
    found(codeFiles, (source) => SIZE_CHECK.test(source)),
    [
      s('lib/useImagePick.ts'),
      // Several files with one list message.
      s('lore/useAppearanceImages.ts'),
    ],
    'use useImagePick',
  )
})

test('no hand-made required mark, kind list or project value field is back', () => {
  assert.deepEqual(
    found(tsxFiles, (source) => source.includes("' *'")),
    [],
    'use Field requiredMark',
  )
  assert.deepEqual(
    found(codeFiles, (source) => source.includes('entityTypes.input.requiredLabel')),
    [],
    'use Field requiredMark',
  )
  assert.deepEqual(
    found(codeFiles, (source) => KIND_LIST.test(source)).filter(
      (file) => file !== s('lore/fieldKinds.ts'),
    ),
    [],
    'use FIELD_KIND_LABELS',
  )
  assert.deepEqual(
    found(codeFiles, (source) => /\bValueField\b/.test(source)),
    [],
    'use FieldInput',
  )
})

type Tree = { [key: string]: string | Tree }
const en = (await import('../src/i18n/en.ts')).default as Tree
const pt = (await import('../src/i18n/pt-PT.ts')).default as Tree

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') out.set(prefix + key, value)
    else for (const [k, v] of flatten(value, prefix + key + '.')) out.set(k, v)
  }
  return out
}

const EXAMPLE = /\be\.g\.|for example|por exemplo|\bex\.:/i

test('a placeholder never shows an example value', () => {
  assert.ok(EXAMPLE.test('e.g. Coronation') && EXAMPLE.test('ex.: Coroação'))
  assert.ok(!EXAMPLE.test('Insert an event kind'))
  for (const [language, tree] of [
    ['en', en],
    ['pt-PT', pt],
  ] as const) {
    const text = flatten(tree)
    const examples = [...text].filter(
      ([key, value]) => /placeholder/i.test(key) && EXAMPLE.test(value),
    )
    assert.deepEqual(examples, [], `${language}: a placeholder says what to write, not an example`)
    for (const key of [
      'canon.terms.placeholderEventKind',
      'canon.terms.placeholderMethod',
      'entity.privateNote.placeholder',
    ]) {
      assert.match(text.get(key) ?? '', language === 'en' ? /^Insert / : /^Insira /, key)
    }
  }
})
