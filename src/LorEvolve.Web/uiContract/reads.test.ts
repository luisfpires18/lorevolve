// Run with `node --test uiContract/reads.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps reads and saves on the shared hooks (#456). A record editor's read, recovery copy and save are one hook: a file
// that calls both useLocalDraft and useFormSave builds a record editor by hand. Only `ideas/useRecordEditor.ts` does;
// the hooks already on useDraftedEditor (`ideas/useIdeaDraft.ts`, the board's draft step) call neither. A read is
// `useAsyncRead` (I38): a component or hook file that makes its own AbortController is a hand-written read. A project
// node is saved through `projectEntities/useNodeEdit.ts` (I39). The lists below only shrink, and a stale entry fails.
// Catalogue: docs/design/ui-components.md.

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

// The shared read hooks are where an AbortController belongs.
const READ_HOMES = new Set([
  'src/lib/useAsyncRead.ts',
  'src/lib/useLoadedList.ts',
  'src/lib/useReadOnOpen.ts',
])

// Hand-written reads not moved yet: the I41 files, the public portal and auth pages #456 does not touch, and reads no
// stage of #456 has reached. Only shrinks.
const HAND_READS = new Set([
  'src/aiChanges/useAiChangeReads.ts',
  'src/chronology/useChronologyEditorState.ts',
  'src/components/CommentsDrawer.tsx',
  'src/components/ContentPublication.tsx',
  'src/components/EraRelations.tsx',
  'src/components/IdeaBoardPicker.tsx',
  'src/components/IdeaReferencePicker.tsx',
  'src/components/KnowledgeView.tsx',
  'src/components/LoreFieldFilters.tsx',
  'src/components/MomentPick.tsx',
  'src/components/NameLinker.tsx',
  'src/components/ProjectEntitiesView.tsx',
  'src/components/ProjectEntityFields.tsx',
  'src/components/PublicAuthorSection.tsx',
  'src/components/PublicNameForm.tsx',
  'src/components/RelationshipTypeManager.tsx',
  'src/components/SystemMachineTry.tsx',
  'src/components/lore/PrivateNoteDrawer.tsx',
  'src/ideas/useRecordEditor.ts',
  'src/lore/useEntityArticle.ts',
  'src/lore/useEntitySearch.ts',
  'src/lore/useEntryLoad.ts',
  'src/lore/useLoreContextLinks.ts',
  'src/lore/useQuickCreate.ts',
  'src/lore/useRevisionHistory.ts',
  'src/lore/useTypesGames.ts',
  'src/mcp/useConnectionRequest.ts',
  'src/pages/InvitationPage.tsx',
  'src/pages/ProfilePage.tsx',
  'src/pages/PublicAuthorPage.tsx',
  'src/pages/PublicLorePage.tsx',
  'src/pages/PublicStoryPage.tsx',
  'src/pages/PublicWorldPage.tsx',
  'src/pages/RegisterPage.tsx',
  'src/pages/UniverseOverview.tsx',
  'src/portal/usePublicPages.ts',
  'src/portal/useWorkspaceLink.ts',
  'src/progression/useEraStoryChoices.ts',
  'src/progression/useProgressionState.ts',
  'src/projectEntities/useProjectEntriesRead.ts',
  'src/projectEntities/useProjectOutline.ts',
  'src/projectEntities/useProjectSchema.ts',
  'src/publishing/usePublishReads.ts',
  'src/search/useUniverseSearchFetch.ts',
  'src/stories/useManuscriptLoad.ts',
  'src/stories/useStoryLoad.ts',
  'src/suggestions/useSuggestionReads.ts',
  'src/trash/useTrashReads.ts',
  'src/universes/useUniverseSettingsState.ts',
  'src/universes/useWorkspaceReads.ts',
  'src/worldLogic/useGuardDrawerEffects.ts',
  'src/worldLogic/useMachinePanelState.ts',
])

// A component (`components/`, `pages/`) or a hook (`use*.ts`, `use*.tsx`).
const componentOrHook = (file: string) =>
  /^src\/(components|pages)\//.test(file) || /\/use[A-Z][^/]*\.tsx?$/.test(file)

const handRead = (source: string) => /\bnew\s+AbortController\s*\(/.test(code(source))

test('the read guard catches an AbortController made by hand, however it is written', () => {
  assert.ok(handRead('const controller = new AbortController()'))
  assert.ok(handRead('const c = new  AbortController ( )'))
  assert.ok(handRead('useEffect(() => {\n  const c =\n    new AbortController()\n})'))
  assert.ok(!handRead('// new AbortController() lives in useAsyncRead\nexport const x = 1'))
  assert.ok(!handRead('/** a new AbortController() per read */\nexport const x = 1'))
  assert.ok(!handRead('const { load } = useAsyncRead(read)'))
  assert.ok(!handRead('function read(signal: AbortSignal) {}'))
  assert.ok(componentOrHook('src/components/projectEntities/NodeEditor.tsx'))
  assert.ok(componentOrHook('src/pages/ProjectsPage.tsx'))
  assert.ok(componentOrHook('src/stories/useStoryScenes.ts'))
  assert.ok(!componentOrHook('src/aiChanges/aiChangeActions.ts'))
  assert.ok(!componentOrHook('src/lore/mentionSearch.ts'))
})

test('a read in a component or hook is useAsyncRead, not a hand-made AbortController', () => {
  const found = sourceFiles.filter(
    (file) => componentOrHook(file) && !READ_HOMES.has(file) && handRead(read(file)),
  )
  assert.deepEqual(
    found.filter((file) => !HAND_READS.has(file)),
    [],
    'read through lib/useAsyncRead (or useLoadedList for a list changed from the screen)',
  )
  assert.deepEqual(
    [...HAND_READS].filter((file) => !found.includes(file)),
    [],
    'stale allowlist entry: remove it',
  )
})

// A call, not the definition in `projectEntities/structure.ts`.
const savesNode = (source: string) => /(?<!function\s+)\bsaveNode\s*\(/.test(code(source))

test('the node save guard catches a saveNode call, however it is written', () => {
  assert.ok(savesNode('await saveNode(projectId, node.id, body)'))
  assert.ok(savesNode('saveNode (\n  projectId,\n)'))
  assert.ok(savesNode('void api.saveNode(projectId, id, body)'))
  assert.ok(!savesNode('export function saveNode(projectId: string) {}'))
  assert.ok(!savesNode('// saveNode( is called by useNodeEdit\nexport const x = 1'))
  assert.ok(!savesNode("import { saveNode } from './structure'"))
})

test('a project node is saved only through useNodeEdit', () => {
  assert.deepEqual(
    sourceFiles.filter((file) => savesNode(read(file))),
    ['src/projectEntities/useNodeEdit.ts'],
    'save the node through projectEntities/useNodeEdit',
  )
})
