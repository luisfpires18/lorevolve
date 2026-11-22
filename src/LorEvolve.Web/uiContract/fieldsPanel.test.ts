// Run with `node --test uiContract/fieldsPanel.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps a type's fields panel on its shared parts (#456): the frame, the list and the plain panel of a project type or a
// template are components/lore/FieldsPanel.tsx, and the type save payload is typeInput. Each list below only shrinks:
// a stale entry fails so nobody forgets.
// Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { classStrings, read, tsxFiles, webRoot } from './support.ts'

const tsFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .filter((file) => /\.tsx?$/.test(file))
  .sort()

const PANEL = 'src/components/lore/FieldsPanel.tsx'

const writesFrame = (source: string) =>
  classStrings(source)
    .flatMap((value) => value.split(/\s+/))
    .includes('types__fields')
const rendersRow = (source: string) => /<TypeFieldRow\b/.test(source)
const rendersDrawer = (source: string) => /<FieldDialog\b/.test(source)
const buildsPayload = (source: string) =>
  /\b(?:createProjectType|saveProjectType|createTypeTemplate|saveTypeTemplate)\([^()]*\{/.test(
    source,
  )

/** The files a check finds must be exactly the allowed ones: a new one is an offender, a missing one is stale. */
function only(files: string[], check: (source: string) => boolean, allowed: string[], why: string) {
  const found = files.filter((file) => check(read(file)))
  assert.deepEqual(
    found.filter((file) => !allowed.includes(file)),
    [],
    `${why} (docs/design/ui-components.md)`,
  )
  assert.deepEqual(
    allowed.filter((file) => !found.includes(file)),
    [],
    'stale allowlist entry: remove it',
  )
}

test('the guards fail on a bad snippet and pass a good one', () => {
  assert.equal(writesFrame('<div className="types__fields">'), true)
  assert.equal(writesFrame('<FieldsPanel testId={id}>'), false)
  assert.equal(rendersRow('<TypeFieldRow field={field} />'), true)
  assert.equal(rendersRow('<FieldList fields={fields} />'), false)
  assert.equal(rendersDrawer('<FieldDialog field={null} />'), true)
  assert.equal(rendersDrawer('<PlainFieldsPanel id={id} />'), false)
  assert.equal(buildsPayload('createProjectType(id, { name })'), true)
  assert.equal(buildsPayload('saveTypeTemplate(a, b, typeInput(values, editing))'), false)
})

test("a type's fields panel is FieldsPanel and its list is FieldList", () => {
  only(tsxFiles, writesFrame, [PANEL], 'use FieldsPanel')
  only(tsxFiles, rendersRow, [PANEL], 'a list of fields is FieldList')
})

test("a project or template field drawer is PlainFieldsPanel's", () => {
  only(
    tsxFiles,
    rendersDrawer,
    [PANEL, 'src/components/TypeFields.tsx'],
    'use PlainFieldsPanel; the Lore editor is TypeFields',
  )
})

test("a project type's or template's save payload is typeInput", () => {
  only(tsFiles, buildsPayload, [], 'build the payload with typeInput')
})
