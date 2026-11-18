// Run with `node --test uiContract/wording.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps the words of actions in one place (#409): Cancel and Close live in `shell.actions`, and a
// busy label ends in an ellipsis. Both dictionaries are loaded for real. Catalogue: docs/design/ui-components.md.

import { register } from 'node:module'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { read, tsxFiles } from './support.ts'

// `en.ts` imports its parts without file extensions; this hook lets Node find the `.ts` file.
register(
  'data:text/javascript,' +
    encodeURIComponent(
      "export async function resolve(s, c, next) { try { return await next(s, c) } catch (e) { if (s.startsWith('.') && /ERR_(MODULE_NOT_FOUND|UNSUPPORTED_DIR_IMPORT)/.test(e.code)) return next(s + '.ts', c); throw e } }",
    ),
)

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
const enText = flatten(en)
const ptText = flatten(pt)

// Keys that say Cancel or Close for a reason of their own: the confirm dialog,
// two hand-written dialogs and the rail's close control. Only shrinks.
const CLOSE_TEXT_KEPT = new Set([
  'shell.confirm.cancel',
  'places.memberDetails.close',
  'universe.imageViewer.close',
  'workspace.rail.close',
])
const SHARED = new Set(['shell.actions.cancel', 'shell.actions.close'])

const strayActionWords = (text: Map<string, string>, words: string[]) =>
  [...text].filter(([key, value]) => words.includes(value) && !SHARED.has(key)).map(([key]) => key)

// Every key passed to a busyLabel prop: each t('...') between the braces.
const busyKeys = (source: string) => {
  const keys: string[] = []
  for (const m of source.matchAll(/busyLabel=\{/g)) {
    let depth = 0
    let i = m.index + m[0].length - 1
    const start = i
    for (; i < source.length; i++) {
      if (source[i] === '{') depth++
      else if (source[i] === '}' && --depth === 0) break
    }
    for (const k of source.slice(start, i).matchAll(/\bt\(\s*['`]([^'`]+)['`]/g)) keys.push(k[1])
  }
  return [...new Set(keys)]
}
const lackEllipsis = (keys: string[], texts: Map<string, string>[]) =>
  keys.filter((key) => texts.some((text) => !(text.get(key) ?? '').endsWith('…')))

test('the guards fail on a bad snippet', () => {
  const bad = new Map([
    ['a.cancel', 'Cancel'],
    ['shell.actions.cancel', 'Cancel'],
  ])
  assert.deepEqual(strayActionWords(bad, ['Cancel']), ['a.cancel'])
  assert.deepEqual(busyKeys(`<Button busyLabel={t('a.saving')}>x</Button>`), ['a.saving'])
  assert.deepEqual(
    lackEllipsis(
      ['a.saving', 'a.sending'],
      [
        new Map([
          ['a.saving', 'Saving'],
          ['a.sending', 'Sending…'],
        ]),
      ],
    ),
    ['a.saving'],
  )
})

test('Cancel and Close are written once per language, in shell.actions', () => {
  const stray = (text: Map<string, string>, words: string[]) =>
    strayActionWords(text, words).filter((key) => !CLOSE_TEXT_KEPT.has(key))
  assert.deepEqual(stray(enText, ['Cancel', 'Close']), [], 'Use shell.actions.cancel or .close')
  assert.deepEqual(stray(ptText, ['Cancelar', 'Fechar']), [], 'Use shell.actions.cancel or .close')
  assert.deepEqual(
    [...CLOSE_TEXT_KEPT].filter((key) => !enText.has(key)),
    [],
    'No longer a key: remove it from CLOSE_TEXT_KEPT',
  )
})

test('a busy label ends in an ellipsis, in both languages', () => {
  const keys = tsxFiles.flatMap((file) => busyKeys(read(file)))
  assert.ok(keys.length > 50, 'the guard should see the busy labels')
  assert.deepEqual(lackEllipsis(keys, [enText, ptText]), [], 'A busy label ends in …')
})
