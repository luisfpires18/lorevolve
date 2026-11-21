// Run with `node --test uiContract/drawers.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps drawers and editors on their shared parts (#416): useSaveShortcut for Ctrl or Cmd + S, Drawer
// for the focus and the save lock, Drawer's own footer (Save and Cancel, or Close) and message line, useDrawerGuard for a hand-made dialog, StaleChoice for a save
// refused as stale, useDiscardGuard for an inline form's guard, useLoadedList for a list read with
// changes, NameSummaryDrawer and PickOneDrawer for the two shared drawer forms, and a confirm before
// every delete. Each list below only shrinks, and a stale entry fails. Catalogue:
// docs/design/ui-components.md.

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classStrings, elements, read, webRoot } from './support.ts'

// Code files as well as components: shortcuts, guards and deletes live in `.ts` hooks too.
const codeFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts') && !file.includes('.test.'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

const filesMatching = (check: (source: string) => boolean) =>
  codeFiles.filter((file) => check(read(file)))

/** Every listed file must still match: a list that names a file no longer needing it is stale. */
function onlyIn(found: string[], allowed: string[], what: string) {
  assert.deepEqual(
    found.filter((file) => !allowed.includes(file)),
    [],
    `${what}: use the shared part`,
  )
  assert.deepEqual(
    allowed.filter((file) => !found.includes(file)),
    [],
    `${what}: no longer needed here, remove it from the list`,
  )
}

// Class tokens split on spaces and on the mark `literals()` puts for `${...}`.
const tokens = (source: string) =>
  classStrings(source).flatMap((value) =>
    value.replaceAll('\u0001', ' \u0001').split(/\s+/).filter(Boolean),
  )

// 1. The save shortcut is read once.
const SHORTCUT =
  /(ctrlKey|metaKey)[\s\S]{0,160}?\bkey(?:\.toLowerCase\(\))?\s*[!=]==?\s*['"`]s['"`]/i
const readsShortcut = (source: string) => SHORTCUT.test(source)

// 2. A drawer's focus: an effect whose only statement focuses something, on open.
const FOCUS_ONLY_EFFECT =
  /useEffect\(\(\) => \{\s*(?:\/\/[^\n]*\s*)*(?:[\w.]+|document\.getElementById\([^)]*\))\?\.focus\(\)\s*\},\s*\[[^\]]*\]\)/
const ownsDrawerFocus = (source: string) =>
  /<Drawer[\s>]/.test(source) &&
  (/\buseReturnFocus\(/.test(source) || FOCUS_ONLY_EFFECT.test(source))

// 3. A drawer that submits passes `busy`.
const unlockedDrawers = (source: string) =>
  elements(source, 'Drawer').filter(({ tag }) => /\bonSubmit=/.test(tag) && !/\bbusy=/.test(tag))

// 3b. A drawer's footer is Drawer's own: `actions` as an object, or absent for Close.
const handFooter = (source: string) =>
  elements(source, 'Drawer').some(({ tag }) =>
    /\bactions=\{\(\w*\) => \(?\s*<FormActions\b/.test(tag),
  )

// 4. A hand-made dialog routes Escape and cancel through the guard.
const handDialog = (source: string) => /<dialog[\s>]/.test(source)
const inlineCancel = (source: string) =>
  elements(source, 'dialog').some(({ tag }) => /\bonCancel=\{\(/.test(tag))

// 5. One conflict bar.
const OLD_CONFLICT = ['manuscript__conflicttext', 'manuscript__conflictactions']
const hasToken = (source: string, test: (token: string) => boolean) => tokens(source).some(test)

// 9. A delete asks first: a call with a confirm in the 20 lines above it.
const DESTROY =
  /(?<![.\w])(?:delete[A-Z]\w*|revokeInvitation|removeEntityImage|removeFieldImage|removeProfileImage|removePicture)\(/
function unaskedDeletes(source: string) {
  const lines = source.split('\n')
  return lines.flatMap((line, at) => {
    if (!DESTROY.test(line)) return []
    if (/^\s*(?:import|export)\b/.test(line) || /\bfunction\s+\w+\(/.test(line)) return []
    if (/^\s*(?:delete[A-Z]\w*|remove\w*|revokeInvitation),?$/.test(line)) return []
    const above = lines.slice(Math.max(0, at - 20), at + 1).join('\n')
    // A field delete handed to `PlainFieldsPanel` as `remove`: the panel asks through `confirmDelete` first.
    if (/^\s*remove=\{\(\w+\) => delete\w*Field\(/.test(line) && /<PlainFieldsPanel\b/.test(above))
      return []
    return /\bconfirm\w*\(/.test(above) ? [] : [`${at + 1}: ${line.trim()}`]
  })
}

test('the drawer guards fail on a bad snippet and pass a good one', () => {
  assert.ok(readsShortcut("if ((event.ctrlKey || event.metaKey) && event.key === 's')"))
  assert.ok(
    readsShortcut("if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's')"),
  )
  assert.ok(!readsShortcut("if (event.key === 'Enter' && (event.ctrlKey || event.metaKey))"))

  assert.ok(ownsDrawerFocus('useReturnFocus()\n<Drawer title={x}>'))
  assert.ok(ownsDrawerFocus('useEffect(() => {\n  title.current?.focus()\n}, [])\n<Drawer\n'))
  assert.ok(
    ownsDrawerFocus("useEffect(() => {\n  document.getElementById('a')?.focus()\n}, [])\n<Drawer>"),
  )
  assert.ok(!ownsDrawerFocus('<Drawer initialFocus={title}>'))
  assert.ok(!ownsDrawerFocus('useEffect(() => {\n  title.current?.focus()\n}, [])\n<div>'))

  assert.equal(unlockedDrawers('<Drawer onSubmit={save} title={t}>x</Drawer>').length, 1)
  assert.equal(unlockedDrawers('<Drawer onSubmit={save} busy={saving}>x</Drawer>').length, 0)

  assert.ok(handFooter('<Drawer testId="x" actions={(close) => <FormActions onCancel={close} />}>'))
  assert.ok(!handFooter('<Drawer testId="x" closeTestId="x-close">'))
  assert.ok(!handFooter('<Drawer testId="x" actions={{ submitLabel: \'Save\' }}>'))

  assert.ok(inlineCancel('<dialog onCancel={(event) => event.preventDefault()}>'))
  assert.ok(!inlineCancel('<dialog onCancel={dialogProps.onCancel}>'))

  assert.ok(
    hasToken('<div className={`${x} manuscript__conflictactions`} />', (token) =>
      OLD_CONFLICT.includes(token),
    ),
  )
  assert.ok(
    !hasToken('<div className="conflictbar__actions" />', (token) => OLD_CONFLICT.includes(token)),
  )

  assert.equal(unaskedDeletes('onClick={() => run(deleteSeason(id))}').length, 1)
  assert.equal(unaskedDeletes('await removeProfileImage()').length, 1)
  assert.equal(unaskedDeletes('{say.deleteEpisode()}').length, 0)
  assert.equal(
    unaskedDeletes('if (await confirmAction(ask)) {\n  run(() => deleteSeason(id))\n}').length,
    0,
  )
  assert.equal(unaskedDeletes("import { deleteSeason } from './api'").length, 0)
  const handed = '  remove={(fieldId) => deleteProjectField(id, fieldId)}'
  assert.equal(unaskedDeletes(`<PlainFieldsPanel\n${handed}`).length, 0)
  assert.equal(unaskedDeletes(`<Other\n${handed}`).length, 1)
  assert.equal(unaskedDeletes('export function deleteSeason(id: string) {').length, 0)
})

test('Ctrl or Cmd + S is read only by useSaveShortcut', () => {
  onlyIn(filesMatching(readsShortcut), ['src/lib/useSaveShortcut.ts'], 'A save shortcut')
})

test('a drawer leaves its focus to Drawer', () => {
  assert.deepEqual(filesMatching(ownsDrawerFocus), [], 'Pass initialFocus; Drawer returns focus')
  onlyIn(
    filesMatching((source) => /\buseReturnFocus\(/.test(source)),
    [
      'src/components/Drawer.tsx',
      'src/components/ImageCropDialog.tsx',
      'src/components/ImageViewer.tsx',
      'src/lib/returnFocus.ts',
    ],
    'useReturnFocus',
  )
  assert.deepEqual(
    filesMatching((source) => /\buseDrawerFocus\b/.test(source)),
    [],
  )
})

test('a drawer that submits locks while it saves', () => {
  // These apply their change locally and save nothing over the network.
  const LOCAL = [
    'src/components/LoreEditor.tsx',
    'src/components/worldLogic/BindingDrawer.tsx',
    'src/components/worldLogic/StateDrawer.tsx',
    'src/components/worldLogic/TransitionDrawer.tsx',
  ]
  onlyIn(
    filesMatching((source) => unlockedDrawers(source).length > 0),
    LOCAL,
    'A submitting Drawer without busy',
  )
})

test("a drawer's footer is Drawer's own", () => {
  const HAND_FOOTERS = [
    // Its message takes the focus after a refused save.
    'src/components/QuickCreateDialog.tsx',
    // The drawer is busy for panels too, the submit only for its own save.
    'src/components/projectEntities/NodeEditor.tsx',
  ]
  onlyIn(filesMatching(handFooter), HAND_FOOTERS, 'A Drawer footer written by hand')
})

test('a hand-made dialog uses useDrawerGuard', () => {
  const SHELLS = ['src/components/Drawer.tsx', 'src/components/ConfirmDialog.tsx']
  const hand = filesMatching(handDialog).filter(
    (file) => file.endsWith('.tsx') && !SHELLS.includes(file),
  )
  assert.ok(hand.length >= 3, 'the guard should see the hand dialogs')
  assert.deepEqual(
    hand.filter((file) => !/\buseDrawerGuard\(/.test(read(file))),
    [],
    'Spread useDrawerGuard dialogProps on the dialog',
  )
  assert.deepEqual(filesMatching(inlineCancel), [], 'onCancel comes from useDrawerGuard')
})

test('a save refused as stale is StaleChoice', () => {
  assert.deepEqual(
    filesMatching((source) => hasToken(source, (token) => OLD_CONFLICT.includes(token))),
    [],
  )
  onlyIn(
    filesMatching((source) => hasToken(source, (token) => token.startsWith('stalechoice'))),
    ['src/components/StaleChoice.tsx'],
    'stalechoice classes',
  )
  // The manuscript's conflict is EditConflict's own box (#456 stage 11b): nothing wraps it in a second one.
  assert.deepEqual(
    filesMatching((source) => hasToken(source, (token) => token === 'manuscript__conflict')),
    [],
  )
})

test('an inline form guards through useDiscardGuard', () => {
  onlyIn(
    filesMatching((source) => /\bconfirmDiscard\(/.test(source)),
    [
      'src/lib/confirm.ts',
      'src/lib/drawerGuard.ts',
      'src/lib/useDiscardGuard.ts',
      // An editor's own Discard button.
      'src/lore/useArticleEditing.ts',
      'src/worldLogic/guardDrawerActions.ts',
      'src/worldLogic/systemEditorActions.ts',
    ],
    'confirmDiscard',
  )
  onlyIn(
    filesMatching((source) => /\buseLeaveGuard\(/.test(source)),
    [
      'src/lib/leaveGuard.ts',
      'src/lib/drawerGuard.ts',
      'src/lib/useDiscardGuard.ts',
      'src/lib/useDraftedEditor.ts',
      // Editors with a save bar or a recovery copy.
      'src/components/projectEntities/ScriptPart.tsx',
      'src/components/SystemMachinePanel.tsx',
      'src/components/WorldRuleEditor.tsx',
      'src/lore/useEntityArticle.ts',
      'src/lore/useEntryForm.ts',
      'src/lore/useMassCreate.ts',
      'src/stories/useManuscriptRecovery.ts',
    ],
    'useLeaveGuard',
  )
})

test('a list read with changes is useLoadedList', () => {
  onlyIn(
    filesMatching((source) => /\bfunction failing\(|\bfunction run\(work/.test(source)),
    ['src/lib/useLoadedList.ts', 'src/projectEntities/useProjectEntriesRead.ts'],
    'A failing or run helper',
  )
})

test('the Cinema and Comic drawers are the shared drawer forms', () => {
  for (const name of ['GroupDrawer', 'CollectionDrawer', 'AddDrawer', 'EntryDrawer']) {
    assert.ok(
      !existsSync(join(webRoot, `src/components/projects/${name}.tsx`)),
      `${name} is NameSummaryDrawer or PickOneDrawer`,
    )
  }
})

test('every delete asks first', () => {
  // `trashActions.tsx` and `universeSettingsActions.ts` ask inline (#255); the three picture controls
  // only bind the call, which `lib/usePictureFraming.ts` asks before making.
  const ASKED_ELSEWHERE = [
    'src/components/EntityImageField.tsx',
    'src/components/FieldImageInput.tsx',
    'src/components/UniverseArtworkField.tsx',
    'src/trash/trashActions.tsx',
    'src/universes/universeSettingsActions.ts',
  ]
  onlyIn(
    filesMatching((source) => unaskedDeletes(source).length > 0),
    ASKED_ELSEWHERE,
    'A delete with no confirm above it',
  )
})
