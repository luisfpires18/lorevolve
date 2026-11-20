// Run with `node --test uiContract/actions.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps Save, Cancel, New and Delete on their shared parts (#409): FormActions draws the footer,
// NewButton draws "New X" and "Add X". Each list below only shrinks, and a stale entry fails.
// Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classStrings, elements, read, tsxFiles } from './support.ts'

// Files that write `form__actions` by hand, with the reason. FormActions itself is the component.
const FORM_ACTIONS_ROWS = new Map<string, string>([
  ['src/components/FormActions.tsx', 'the component'],
  ['src/components/admin/PasswordSection.tsx', 'one secondary action, not a Save row'],
  ['src/components/admin/SignUpLink.tsx', 'two actions, neither is Save or Cancel'],
  ['src/components/CalendarEditor.tsx', 'SaveAction owns the save; Discard sits beside it'],
  ['src/components/ChronologyEditor.tsx', 'SaveAction owns the save; Discard sits beside it'],
  ['src/components/CinemaSagas.tsx', 'a row of New buttons'],
  ['src/components/worldLogic/MachineStates.tsx', 'a row of New buttons'],
  ['src/components/worldLogic/MachineTransitions.tsx', 'a row of New buttons'],
  ['src/components/worldLogic/TransitionDrawer.tsx', 'a row of New buttons'],
  ['src/components/projectEntities/OutlineAddButtons.tsx', 'a row of New buttons'],
  ['src/components/trash/BulkEraseConfirm.tsx', 'aria-disabled keeps focus (#255)'],
  ['src/components/trash/EraseConfirm.tsx', 'aria-disabled keeps focus (#255)'],
  ['src/components/trash/RestorePublicConfirm.tsx', 'aria-disabled keeps focus (#255)'],
  ['src/components/worldLogic/FindingDetail.tsx', 'two decisions with one busy state'],
  ['src/pages/ConnectAuthorizePage.tsx', 'Approve and Deny both submit a decision'],
])

// Files that read the shared Cancel or Close string themselves, because they cannot draw FormActions.
const SHARED_CANCEL_READERS = new Set([
  'src/components/FormActions.tsx',
  'src/components/CropperActions.tsx', // icons on both buttons, which FormActions cannot draw
  'src/components/trash/BulkEraseConfirm.tsx',
  'src/components/trash/EraseConfirm.tsx',
  'src/components/trash/RestorePublicConfirm.tsx',
  'src/components/lore/EntryFormBar.tsx',
  'src/components/lore/MassCreateBar.tsx',
])

// Files that import Plus on purpose: the New button, three that are not a New button, and two row
// menus whose "New" and "Add" items carry the Plus glyph.
const PLUS_IMPORTERS = new Set([
  'src/components/NewButton.tsx',
  'src/components/LoreFieldFilters.tsx',
  'src/components/ProjectEntitiesView.tsx',
  'src/components/worldLogic/MachineStateCard.tsx',
  'src/components/projects/ComicCollectionItem.tsx',
  'src/components/projects/SagaSection.tsx',
])

const writesFormActions = (source: string) =>
  classStrings(source).some((value) => /(^|\s)(rel)?form__actions(\s|$)/.test(value))
const readsSharedCancel = (source: string) =>
  /['"`]shell\.actions\.(cancel|close)['"`]/.test(source)
const importsPlus = (source: string) =>
  /import\s*\{[^}]*\bPlus\b[^}]*\}\s*from\s*'lucide-react'/.test(source)
const makesThings = (source: string) =>
  elements(source, 'Button').some(({ body }) => {
    const key = /\bt\(\s*['`]([^'`]+)['`]/.exec(body)?.[1]
    return !!key && /^(new|add)/i.test(key.split('.').at(-1)!)
  })
const BAD_DELETE_TONE = /tone="(?!danger(-quiet)?")[a-z-]+"/
const deleteButtonWithWrongTone = (source: string) =>
  elements(source, 'Button').some(({ tag, body }) => {
    const key = /\bt\(\s*['`]([^'`]+)['`]/.exec(body)?.[1]
    if (!key || !/^delete/i.test(key.split('.').at(-1)!)) return false
    return BAD_DELETE_TONE.test(tag) || !/tone="danger/.test(tag)
  })

// Files with a plain `Button` labelled "New ..." or "Add ...", with the reason it is no New button.
const PLAIN_NEW_BUTTONS = new Map<string, string>([
  ['src/components/lore/LoreContextMentioned.tsx', 'Add links an existing entry, nothing is made'],
  ['src/components/lore/MassCreatePaste.tsx', 'adds typed text to a list before anything is saved'],
  ['src/components/projects/SagasUnassigned.tsx', 'puts an existing production in a phase'],
])

const filesWhere = (check: (source: string) => boolean) =>
  tsxFiles.filter((file) => check(read(file)))

function onlyAllowed(found: string[], allowed: Set<string> | Map<string, string>) {
  const names = [...(allowed.keys?.() ?? allowed)]
  assert.deepEqual(
    found.filter((file) => !names.includes(file)),
    [],
    'New offender: use the shared part, see docs/design/ui-components.md',
  )
  assert.deepEqual(
    names.filter((file) => !found.includes(file)),
    [],
    'No longer an exception: remove it from the list',
  )
}

test('the guards fail on a bad snippet', () => {
  assert.equal(writesFormActions('<div className="form__actions">'), true)
  assert.equal(writesFormActions('<div className={`relform__actions ${x}`}>'), true)
  assert.equal(writesFormActions('<div className="form__actionsbar">'), false)
  assert.equal(readsSharedCancel("t('shell.actions.cancel')"), true)
  assert.equal(readsSharedCancel("t('shell.actions.save')"), false)
  assert.equal(importsPlus("import { Plus, X } from 'lucide-react'"), true)
  assert.equal(importsPlus("import { ImagePlus } from 'lucide-react'"), false)
  assert.equal(makesThings(`<Button onClick={x}>{t('a.newVolume')}</Button>`), true)
  assert.equal(makesThings(`<Button onClick={x}>{t('a.addSection')}</Button>`), true)
  assert.equal(makesThings(`<NewButton onClick={x}>{t('a.newVolume')}</NewButton>`), false)
  assert.equal(makesThings(`<Button onClick={x}>{t('a.save')}</Button>`), false)
  assert.equal(
    deleteButtonWithWrongTone(`<Button tone="secondary" onClick={x}>{t('a.deleteIt')}</Button>`),
    true,
  )
  assert.equal(deleteButtonWithWrongTone(`<Button onClick={x}>{t('a.deleteIt')}</Button>`), true)
  assert.equal(
    deleteButtonWithWrongTone(`<Button tone="danger-quiet" onClick={x}>{t('a.deleteIt')}</Button>`),
    false,
  )
})

test('no hand-written form__actions row outside FormActions and the listed exceptions', () => {
  onlyAllowed(filesWhere(writesFormActions), FORM_ACTIONS_ROWS)
})

test('the shared Cancel and Close strings are read by FormActions and the listed files only', () => {
  onlyAllowed(filesWhere(readsSharedCancel), SHARED_CANCEL_READERS)
})

test('Plus is imported only by NewButton and the listed files', () => {
  onlyAllowed(filesWhere(importsPlus), PLUS_IMPORTERS)
})

test('a Button labelled New or Add is a NewButton, except the listed files', () => {
  onlyAllowed(filesWhere(makesThings), PLAIN_NEW_BUTTONS)
})

test('a Delete button is danger or danger-quiet', () => {
  assert.deepEqual(
    filesWhere(deleteButtonWithWrongTone),
    [],
    'Delete is tone="danger" (footer, confirm) or "danger-quiet" (row, opener)',
  )
})
