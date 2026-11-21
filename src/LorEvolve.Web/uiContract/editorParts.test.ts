// Run with `node --test uiContract/editorParts.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps the editor and record list parts shared (#456, stage 12): EditorHead (in DocumentHead.tsx) draws a record's head
// with its menu, SaveBar (in SaveAction.tsx) every explicit-save bar, EditorNotices the recovered draft with the conflict, the Record* parts the
// Ideas and Boards lists, and UNASSIGNED is said once. Each list below only shrinks, and a stale entry fails.
// Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { classStrings, read, tsxFiles, webRoot } from './support.ts'

const sourceFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

const BAR = /(^|\s)(manuscript__bar|recovery__warning)(\s|$)/

const headWithMenu = (source: string) =>
  /<DocumentHead\b/.test(source) && /<(ActionMenu|RowMenu)\b/.test(source)
const writesBar = (source: string) => classStrings(source).some((value) => BAR.test(value))
const noticesByHand = (source: string) =>
  /<RecoveredDraft\b/.test(source) && /<ConflictBar\b/.test(source)
const conflictByHand = (source: string) => /<ConflictBar\b/.test(source)
const unassignedCount = (source: string) => source.match(/export const UNASSIGNED\b/g)?.length ?? 0

// Files that write the bar or warning class by hand, with the reason. SaveBar is the part.
const HAND_BARS = new Map<string, string>([
  ['src/components/SaveAction.tsx', 'the part: SaveBar'],
  ['src/components/lore/ArticleEditing.tsx', 'the article has no save bar, only the warning'],
])

// Files that draw a ConflictBar outside EditorNotices, with the reason. Machine, World rule and the script part had
// ConflictBar with FormMessage by hand and now use EditorNotices; these two were not in the stage 12 list.
const HAND_CONFLICTS = new Map<string, string>([
  ['src/components/EditorNotices.tsx', 'the part'],
  [
    'src/components/worldLogic/SystemDetails.tsx',
    'System editor: no recovery copy and no wrapper div, not in the I27 list',
  ],
  [
    'src/components/worldLogic/GuardBuilderDrawer.tsx',
    'a small conflict inside the guard drawer, with no failure line',
  ],
])

// The twins the Record* parts replaced, by role: their names must not come back.
const GONE = [
  'src/components/EditorSaveBar.tsx',
  'src/components/IdeaBoardPicker.tsx',
  'src/components/IdeaReferencePicker.tsx',
  'src/components/ideas/BoardHead.tsx',
  'src/components/worldRules/WorldRuleHead.tsx',
  'src/components/ideas/IdeaSaveBar.tsx',
  'src/components/ideas/BoardSaveBar.tsx',
  'src/components/worldLogic/MachineSaveBar.tsx',
  'src/components/projectEntities/ScriptPartBar.tsx',
  'src/components/stories/ManuscriptSaveBar.tsx',
  'src/components/projectEntities/ScriptPartHead.tsx',
  'src/components/ideas/IdeaNotices.tsx',
  'src/components/ideas/BoardNotices.tsx',
  'src/components/worldLogic/MachineNotices.tsx',
  'src/components/projectEntities/ScriptPartNotices.tsx',
  'src/components/ideas/IdeaUnavailable.tsx',
  'src/components/ideas/BoardUnavailable.tsx',
  'src/components/ideas/IdeasControls.tsx',
  'src/components/ideas/BoardsControls.tsx',
  'src/components/ideas/IdeaRow.tsx',
  'src/components/ideas/BoardsListRows.tsx',
  'src/components/ideas/IdeasEmpty.tsx',
  'src/components/ideas/BoardsEmpty.tsx',
  'src/components/IdeasBrowser.tsx',
  'src/components/IdeaBoardsBrowser.tsx',
  'src/pages/IdeaBoardsPage.tsx',
  'src/ideas/useIdeasState.ts',
  'src/ideas/useBoardsState.ts',
  'src/ideas/useIdeasFilters.ts',
  'src/ideas/useBoardsFilters.ts',
  'src/ideas/useIdeasRead.ts',
  'src/ideas/useBoardsRead.ts',
  'src/ideas/useIdeasActions.tsx',
  'src/ideas/useBoardsActions.tsx',
]

function onlyAllowed(found: string[], allowed: string[]) {
  assert.deepEqual(
    found.filter((file) => !allowed.includes(file)),
    [],
    'New offender: use the shared part, see docs/design/ui-components.md',
  )
  assert.deepEqual(
    allowed.filter((file) => !found.includes(file)),
    [],
    'No longer an exception: remove it from the list',
  )
}

test('the guards fail on a bad snippet', () => {
  assert.equal(
    headWithMenu('<DocumentHead back={b} title={x} actions={<ActionMenu label="m" />} />'),
    true,
  )
  assert.equal(headWithMenu('<DocumentHead title={x} actions={<RowMenu label="m" />} />'), true)
  assert.equal(headWithMenu('<DocumentHead testIdPrefix="idea" />'), false)
  assert.equal(writesBar('<div className="manuscript__bar idea__bar">'), true)
  assert.equal(writesBar('<div className={`manuscript__bar ${look}`}>'), true)
  assert.equal(writesBar("<p className={on ? 'recovery__warning' : 'x'}>"), true)
  assert.equal(writesBar('<div className="manuscript__barline">'), false)
  assert.equal(noticesByHand('<RecoveredDraft what={w} />\n<ConflictBar text={t} />'), true)
  assert.equal(noticesByHand('<RecoveredDraft what={w} />'), false)
  assert.equal(conflictByHand('<FormMessage>{f}</FormMessage>\n<ConflictBar text={t} />'), true)
  assert.equal(conflictByHand('<EditorNotices conflict={c} />'), false)
  assert.equal(unassignedCount("export const UNASSIGNED = 'unassigned'"), 1)
})

test('only DocumentHead draws a document head with its actions menu', () => {
  onlyAllowed(
    tsxFiles.filter((file) => headWithMenu(read(file))),
    [],
  )
})

test('only SaveBar writes the save bar and the no recovery copy warning', () => {
  onlyAllowed(
    tsxFiles.filter((file) => writesBar(read(file))),
    [...HAND_BARS.keys()],
  )
})

test('only EditorNotices draws the recovered draft with the conflict', () => {
  onlyAllowed(
    tsxFiles.filter((file) => noticesByHand(read(file))),
    ['src/components/EditorNotices.tsx'],
  )
})

test('only EditorNotices draws the conflict bar, apart from the listed files', () => {
  onlyAllowed(
    tsxFiles.filter((file) => conflictByHand(read(file))),
    [...HAND_CONFLICTS.keys()],
  )
})

test('the Idea and Board twins of the Record parts stay gone', () => {
  assert.deepEqual(
    GONE.filter((file) => existsSync(join(webRoot, file))),
    [],
    'Use the shared part (EditorHead, SaveBar, SearchPickDrawer, EditorNotices, components/ideas/Record*)',
  )
})

test('UNASSIGNED is exported once', () => {
  const found = sourceFiles.filter((file) => unassignedCount(read(file)) > 0)
  assert.deepEqual(found, ['src/ideas/useRecordList.tsx'])
  assert.equal(unassignedCount(read(found[0])), 1)
})
