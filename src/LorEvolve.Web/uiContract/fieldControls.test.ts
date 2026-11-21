// Run with `node --test uiContract/fieldControls.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps plain controls on the shared Field (#456): a select, text box or text area under a label is
// `<Field as="select">`, `<Field as="textarea">` or the input form (`name={null}` where the box had no name), and Field
// writes the `field__input` class. The files below still write it by hand, each for a reason Field would change: a
// custom control (colour, file, number, typed value, composite list and select, a hint between the control and its
// count), a bare select with an `aria-label` and no Field (a Field would add a wrapper and a label in a tight row), an
// input whose `name` differs from its id, or a control outside this stage. The list only shrinks, and a stale entry
// fails.
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

// A class string with the token: a plain class, a ternary branch or a template literal. The mark `literals()` puts
// for `${...}` is split off, so "field__input ${x}" still counts; a modifier alone (`field__input--title`) does not.
// Any string that starts with the token counts too, so a class kept in a constant (`const select = '...'`) does.
const writes = (source: string) =>
  classStrings(source).some((value) =>
    value.replaceAll('\u0001', ' \u0001').split(/\s+/).includes('field__input'),
  ) || /["'`]field__input(?=[\s"'`$])/.test(source)

test('the field control guard catches a hand-written control, template-built classes included', () => {
  assert.ok(writes('<input {...control} className="field__input" />'))
  assert.ok(writes('<select className="field__input field__input--select">{o}</select>'))
  assert.ok(writes('<textarea className={`field__input ${extra}`} />'))
  assert.ok(writes("<input className={wide ? 'field__input wide' : 'other'} />"))
  assert.ok(writes("export const select = 'field__input field__input--select'"))
  assert.ok(!writes('<Field as="select" controlClassName="idea__universe">{o}</Field>'))
  assert.ok(!writes('<Field name={null} controlClassName="field__input--title" />'))
  assert.ok(!writes('<input className="field__inputs" />'))
})

const STAYS: string[] = [
  'src/components/ChronologyPointFields.tsx',
  'src/components/CommentNewForm.tsx',
  'src/components/CommentThreadItem.tsx',
  'src/components/ConnectToAi.tsx',
  'src/components/EntityPicker.tsx',
  'src/components/FeedbackButton.tsx',
  'src/components/Field.tsx',
  'src/components/FieldInputs.tsx',
  'src/components/MapFormPicture.tsx',
  'src/components/MapPinForm.tsx',
  'src/components/PercentField.tsx',
  'src/components/PublicDetailsForm.tsx',
  'src/components/QuickCreateDialog.tsx',
  'src/components/RelationshipPeriodsField.tsx',
  'src/components/ScenePicks.tsx',
  'src/components/SearchField.tsx',
  'src/components/TypeDialogPlace.tsx',
  'src/components/TypeFromTemplateDrawer.tsx',
  'src/components/TypeGroupsField.tsx',
  'src/components/TypeGroupsPanel.tsx',
  'src/components/UniverseColourField.tsx',
  'src/components/ValidationTermSelect.tsx',
  'src/components/WorldRuleCheckSection.tsx',
  'src/components/aiChanges/EditChange.tsx',
  'src/components/aiChanges/MediaChange.tsx',
  'src/components/canon/CanonControls.tsx',
  'src/components/chronology/CalendarMonthRow.tsx',
  'src/components/chronology/ChronologyEraRow.tsx',
  'src/components/ideas/BoardCardInspector.tsx',
  'src/components/ideas/QuickCapture.tsx',
  'src/components/lore/EntryHeader.tsx',
  'src/components/lore/FieldFilterEditor.tsx',
  'src/components/lore/MassCreateRow.tsx',
  'src/components/lore/SectionFieldPlacer.tsx',
  'src/components/lore/TypeGroupRow.tsx',
  'src/components/maps/CalibrationFields.tsx',
  'src/components/progression/EraFieldRow.tsx',
  'src/components/progression/EraStories.tsx',
  'src/components/publishing/PublicAttributionField.tsx',
  'src/components/ruleValidation/NewTermForm.tsx',
  'src/components/ruleValidation/TermGroup.tsx',
  'src/components/timeline/MomentDating.tsx',
  'src/components/timeline/StoryLinks.tsx',
  'src/components/universes/CopyLink.tsx',
  'src/components/universes/InviteForm.tsx',
  'src/components/universes/RoleSelect.tsx',
  'src/components/worldLogic/Operand.tsx',
  'src/components/worldLogic/Related.tsx',
  'src/components/worldLogic/SystemDetails.tsx',
  'src/components/worldLogic/TransitionDrawer.tsx',
  'src/components/worldLogic/TypedValue.tsx',
  'src/components/worldRules/WorldRuleForm.tsx',
  'src/worldLogic/guardBuilderKeys.ts',
  'src/worldLogic/machineDrawerFields.tsx',
]

test('a plain control under a label is drawn by Field', () => {
  const found = codeFiles.filter((file) => writes(read(file)))
  assert.deepEqual(
    found.filter((file) => !STAYS.includes(file)),
    [],
    'use <Field as="select">, <Field as="textarea"> or the Field input form (name={null} keeps no name)',
  )
  assert.deepEqual(
    STAYS.filter((file) => !found.includes(file)),
    [],
    'stale allowlist entry, remove it',
  )
})
