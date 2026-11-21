// Run with `node --test uiContract/reads.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps a record editor's read, recovery copy and save on one hook (#456): a file that calls both useLocalDraft and
// useFormSave builds a record editor by hand. Only `ideas/useRecordEditor.ts` does; the hooks already on
// useDraftedEditor (`ideas/useIdeaDraft.ts`, the board's draft step) call neither. The list below only shrinks, and a
// stale entry fails. Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { read, webRoot } from './support.ts'

const RECORD_EDITORS = new Set(['src/ideas/useRecordEditor.ts'])

const sourceFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.test.ts'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

// Comments mention the hooks without calling them.
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

const handEditor = (source: string) => {
  const body = code(source)
  return (
    /\buseLocalDraft\s*(<[^>]*>)?\s*\(/.test(body) && /\buseFormSave\s*(<[^>]*>)?\s*\(/.test(body)
  )
}

test('the record editor guard catches a file calling both hooks, however the calls are written', () => {
  assert.ok(handEditor('const d = useLocalDraft(scope)\nconst f = useFormSave({ failed })'))
  assert.ok(
    handEditor('const f = useFormSave ({\n  failed,\n})\nconst d = useLocalDraft(\n  scope,\n)'),
  )
  assert.ok(handEditor('const d = useLocalDraft<Fields>(scope); const f = useFormSave({})'))
  assert.ok(!handEditor('const d = useLocalDraft(scope)\nconst f = useAsyncRead(read)'))
  assert.ok(!handEditor("import { useFormSave } from '../lib/useFormSave'\nuseLocalDraft(scope)"))
  assert.ok(!handEditor('// useLocalDraft( and useFormSave( are its parts\nexport const x = 1'))
  assert.ok(
    !handEditor('/** useLocalDraft(scope) with useFormSave(options) */\nexport const x = 1'),
  )
})

test('a record editor with a recovery copy and a save is built on useRecordEditor', () => {
  const found = sourceFiles.filter((file) => handEditor(read(file)))
  assert.deepEqual(
    found.filter((file) => !RECORD_EDITORS.has(file)),
    [],
    'build the editor on ideas/useRecordEditor',
  )
  assert.deepEqual(
    [...RECORD_EDITORS].filter((file) => !found.includes(file)),
    [],
    'stale allowlist entry: remove it',
  )
})
