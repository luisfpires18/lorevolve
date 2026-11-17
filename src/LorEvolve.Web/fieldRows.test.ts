// Run with `node --test fieldRows.test.ts` (Node 22.18+ strips the types itself).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fieldRows, valuesFromDetail } from './src/projectEntities/fieldRows.ts'
import {
  FieldKind,
  type FieldValue,
  type ProjectEntityDetail,
  type ProjectEntityType,
  type ProjectField,
} from './src/projectEntities/types.ts'

const field = (id: string, kind: number): ProjectField => ({
  id,
  name: id,
  kind: kind as ProjectField['kind'],
  isRequired: false,
  displayOrder: 0,
  options: [],
  imageShape: null,
})

const type = (
  id: string,
  fields: ProjectField[],
  inherited: ProjectField[] = [],
): ProjectEntityType => ({
  id,
  name: id,
  description: null,
  icon: null,
  accentColor: null,
  parentId: null,
  displayOrder: 0,
  entryCount: 0,
  fields,
  inheritedFields: inherited,
})

const value = (id: string, kind: number, more: Partial<FieldValue> = {}): FieldValue => ({
  fieldDefinitionId: id,
  name: id,
  kind: kind as FieldValue['kind'],
  text: null,
  number: null,
  boolean: null,
  date: null,
  optionIds: [],
  optionValues: [],
  referencedEntityId: null,
  referencedEntityName: null,
  referencedEntityIsTrashed: false,
  eraId: null,
  ...more,
})

const detail = (
  fields: FieldValue[],
  fieldImages: ProjectEntityDetail['fieldImages'] = [],
): ProjectEntityDetail => ({
  id: 'e',
  name: 'e',
  summary: null,
  entityTypeId: 'unit',
  entityTypeName: 'unit',
  fields,
  fieldImages,
  version: 1,
  canonEntityId: null,
})

const picture = { fieldId: 'pic' } as ProjectEntityDetail['fieldImages'][number]

test('rows follow the type: own fields, then inherited, empty ones kept', () => {
  const unit = type(
    'unit',
    [field('b', FieldKind.Number), field('a', FieldKind.ShortText)],
    [field('c', FieldKind.Boolean)],
  )
  const rows = fieldRows(unit, detail([value('a', FieldKind.ShortText, { text: 'x' })]))
  assert.deepEqual(
    rows.map((row) => [row.id, row.value?.text ?? null]),
    [
      ['b', null],
      ['a', 'x'],
      ['c', null],
    ],
  )
})

test('an Image field takes its picture from fieldImages', () => {
  const rows = fieldRows(type('unit', [field('pic', FieldKind.Image)]), detail([], [picture]))
  assert.equal(rows[0].image, picture)
})

test('no type falls back to the stored values in API order', () => {
  const rows = fieldRows(
    null,
    detail([value('z', FieldKind.ShortText), value('y', FieldKind.Number)]),
  )
  assert.deepEqual(
    rows.map((row) => row.id),
    ['z', 'y'],
  )
})

test('two types give their own rows for the same entry', () => {
  const stored = detail([value('hp', FieldKind.Number, { number: 3 })])
  assert.deepEqual(
    fieldRows(type('unit', [field('hp', FieldKind.Number)]), stored).map((row) => row.id),
    ['hp'],
  )
  assert.deepEqual(
    fieldRows(type('building', [field('floors', FieldKind.Number)]), stored).map((row) => row.id),
    ['floors'],
  )
})

test('valuesFromDetail copies each kind and skips pictures and empty fields', () => {
  const fields = [
    field('t', FieldKind.ShortText),
    field('n', FieldKind.Number),
    field('s', FieldKind.Select),
    field('pic', FieldKind.Image),
    field('empty', FieldKind.Date),
  ]
  const values = valuesFromDetail(
    detail([
      value('t', FieldKind.ShortText, { text: 'hi' }),
      value('n', FieldKind.Number, { number: 5, eraId: 'era' }),
      value('s', FieldKind.Select, { optionIds: ['o1'] }),
      value('pic', FieldKind.Image),
    ]),
    fields,
  )
  assert.deepEqual(Object.keys(values), ['t', 'n', 's'])
  assert.equal(values.t.text, 'hi')
  assert.equal(values.n.number, 5)
  assert.equal(values.n.eraId, 'era')
  assert.deepEqual(values.s.optionIds, ['o1'])
  assert.equal(values.t.optionIds, null)
})
