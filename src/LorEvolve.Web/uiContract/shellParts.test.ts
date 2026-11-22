// Run with `node --test uiContract/shellParts.test.ts` (Node 22.18+ strips the types itself).
//
// The shell's shared parts (#456 stage 13): the publication menu markup, the workspace bar, the manage rows, the thin
// folds (EntityTile, RelationPreview) and keeping a list's highlight in view. Each list below only shrinks: a stale
// entry fails so nobody forgets. Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { braceBody, classStrings, read, webRoot } from './support.ts'

const srcFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()
const tsFiles = srcFiles.filter((file) => /\.tsx?$/.test(file))
const cssFiles = srcFiles.filter((file) => file.endsWith('.css'))

const tokens = (source: string) =>
  classStrings(source).flatMap((value) => value.replaceAll('\u0001', ' ').split(/\s+/))

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

// I30. The publication menu's markup: ContentPublication and its panel. A story part's is ContentPublication's `part` (stage 11b).
const PUBLICATION_MENU = [
  'contentpub__panel',
  'contentpub__trigger',
  'contentpub__context',
  'contentpub__heading',
]
const writesPublicationMenu = (source: string) =>
  tokens(source).some((token) => PUBLICATION_MENU.includes(token))

test('the publication menu is drawn by ContentPublication and its panel only', () => {
  assert.ok(writesPublicationMenu('<div className="contentpub__panel">'))
  assert.ok(writesPublicationMenu('<p className={`contentpub__heading ${extra}`}>'))
  assert.ok(writesPublicationMenu("<span className={open ? 'contentpub__trigger' : ''}>"))
  assert.ok(!writesPublicationMenu('<div className="contentpub__panelish">'))
  only(
    tsFiles,
    writesPublicationMenu,
    ['src/components/ContentPublication.tsx', 'src/components/ContentPublicationPanel.tsx'],
    'use ContentPublication or ContentPublicationPanel',
  )
})

// I31. The workspace bar of My workspace and Admin.
const writesWorkspaceBar = (source: string) =>
  tokens(source).some((token) => token === 'workspacebar' || token.startsWith('workspacebar__'))

test('the workspace bar is WorkspaceBar', () => {
  assert.ok(writesWorkspaceBar('<header className="workspacebar">'))
  assert.ok(writesWorkspaceBar('<a className={`workspacebar__link ${current}`}>'))
  assert.ok(!writesWorkspaceBar('<Bar testIdPrefix="workspacebar" />'))
  assert.ok(!writesWorkspaceBar('<header className="portal__bar">'))
  only(tsFiles, writesWorkspaceBar, ['src/components/WorkspaceBar.tsx'], 'use WorkspaceBar')
})

// I32. The manage rows: the old row classes are gone from markup and styles alike.
const OLD_ROWS = /\b(collab__row|connectedapps__row)\b/
const writesOldRow = (source: string) => tokens(source).some((token) => OLD_ROWS.test(token))

test('a settings row of a managed thing is ManageRow', () => {
  assert.ok(writesOldRow('<li className="collab__row">'))
  assert.ok(writesOldRow('<li className={`connectedapps__row ${extra}`}>'))
  assert.ok(writesOldRow("<li className={on ? 'collab__row collab__row--highlight' : ''}>"))
  assert.ok(!writesOldRow('<li className="managerow managerow--flush">'))
  only(tsFiles, writesOldRow, [], 'use ManageRow')
  only(cssFiles, (css) => OLD_ROWS.test(css), [], 'style .managerow instead')
})

// I32. The manage rows and their small forms save through useFormSave: no function sets its own busy flag and clears
// its own error.
const MANAGE_FILES = [
  'src/components/ConnectedApps.tsx',
  'src/components/FeedbackButton.tsx',
  'src/components/PublicNameForm.tsx',
  ...tsFiles.filter((file) => file.startsWith('src/components/universes/')),
]
const BUSY_ON = /\bset(?:Busy|IsSaving|Sending|Stopping)\(true\)/
const ERROR_OFF = /\bsetErrors?\((?:null|\{\})\)/

/** A function body (or arrow block) that both raises a busy flag and clears an error by hand. */
function savesByHand(source: string) {
  for (const m of source.matchAll(/(?:function\s+\w+\s*\([^)]*\)|=>)\s*(?::\s*[^{]+)?\{/g)) {
    const body = braceBody(source, m.index + m[0].length - 1)
    if (BUSY_ON.test(body) && ERROR_OFF.test(body)) return true
  }
  return false
}

test('the manage rows and their forms save through useFormSave', () => {
  assert.ok(savesByHand('async function go() {\n  setBusy(true)\n  setError(null)\n}'))
  assert.ok(savesByHand('const go = async () => {\n  setIsSaving(true)\n  setErrors({})\n}'))
  assert.ok(
    !savesByHand('function go() {\n  setBusy(true)\n}\nfunction other() {\n  setError(null)\n}'),
  )
  assert.ok(!savesByHand('await save(async () => {\n  await work()\n})'))
  only(MANAGE_FILES, savesByHand, [], 'save with useFormSave from lib/useFormSave.ts')
})

// I33. The "reads as" sentence and the blank tile each have one home.
const writesReads = (source: string) => tokens(source).includes('relform__reads')
const writesBlankTile = (source: string) => tokens(source).includes('tile--blank')

test('the reads-as sentence is RelationPreview and the blank tile is EntityTile', () => {
  assert.ok(writesReads('<p className="relform__reads">'))
  assert.ok(writesReads('<p className={`relform__reads ${extra}`}>'))
  assert.ok(!writesReads('<p className="relform__grid">'))
  assert.ok(writesBlankTile('<span className="tile tile--blank trash__tile">'))
  assert.ok(writesBlankTile('<span className={`${classes} tile--blank`}>'))
  assert.ok(!writesBlankTile('<span className="tile">'))
  only(
    tsFiles,
    writesReads,
    ['src/components/relationships/RelationPreview.tsx'],
    'use RelationPreview',
  )
  only(tsFiles, writesBlankTile, ['src/components/EntityTile.tsx'], 'use EntityTile with icon')
})

// I45. A highlighted option or row is kept in view by useKeepListInView. The others scroll for other reasons.
const SCROLLS_ELSEWHERE = [
  'src/components/ConnectedApps.tsx', // arriving at #connected-apps
  'src/components/ManuscriptWriter.tsx', // the editor's own transaction, not the DOM call
  'src/components/SceneForm.tsx', // a beat brought to the centre
  'src/lib/useArrivalMark.ts', // an arrival mark
  'src/stories/useManuscriptState.ts', // an editor focus option
]
const scrollsIntoView = (source: string) => /\bscrollIntoView\b/.test(source)

test('a list keeps its highlight in view with useKeepListInView', () => {
  assert.ok(scrollsIntoView('row.current?.scrollIntoView({ block: "nearest" })'))
  assert.ok(!scrollsIntoView('useKeepListInView(list, isOpen, count)'))
  only(
    tsFiles,
    scrollsIntoView,
    ['src/components/entityPickerList.ts', ...SCROLLS_ELSEWHERE],
    'use useKeepListInView from components/entityPickerList.ts',
  )
})
