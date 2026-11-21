// Run with `node --test uiContract/projectParts.test.ts` (Node 22.18+ strips the types itself).
//
// The projects pages are built from Lore, Types and shared parts (#456, owner rule of 2026-11-20): no new project
// component, and the field rows and delete questions go through the shared ones. Each list below only shrinks: a stale
// entry fails so nobody forgets. Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { classStrings, read, webRoot } from './support.ts'

const srcFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .filter((file) => /\.tsx?$/.test(file))
  .sort()

const PROJECT_FOLDERS = /^src\/components\/(projects|projectEntities|stories|typeTemplates)\//
const ROUTES = 'src/routes/universeProjectRoutes.tsx'

const SCREENS = 'src/screens.ts'

function resolve(base: string) {
  return [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`].find(
    (each) => /\.tsx?$/.test(each) && existsSync(join(webRoot, each)),
  )
}

// `screens.ts` is the lazy page barrel: an import from it reaches only the pages it names, not every page.
const screenOf = new Map(
  [
    ...read(SCREENS).matchAll(
      /export const (\w+) = lazyWithPreload\(\(\) => import\('\.\/([^']+)'\)\)/g,
    ),
  ].map((m) => [m[1], resolve(`src/${m[2]}`)]),
)

/** The files one source imports, statically or lazily, resolved to paths under `src/`. */
function importsOf(file: string): string[] {
  const found: string[] = []
  const source = read(file)
  for (const m of source.matchAll(/(?:from|import)\s*\(?\s*'(\.{1,2}\/[^']+)'/g)) {
    const hit = resolve(join(dirname(file), m[1]).replaceAll('\\', '/'))
    if (hit && hit !== SCREENS) found.push(hit)
  }
  for (const m of source.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[./]+screens'/g)) {
    for (const name of m[1].split(',')) {
      const page = screenOf.get(name.trim().split(/\s+/)[0])
      if (page) found.push(page)
    }
  }
  return found
}

function reach(roots: string[], skip: Set<string>): Set<string> {
  const seen = new Set<string>()
  const queue = [...roots]
  while (queue.length > 0) {
    const file = queue.pop()!
    if (seen.has(file) || skip.has(file)) continue
    seen.add(file)
    queue.push(...importsOf(file))
  }
  return seen
}

/**
 * Components under the project folders, and every other component the app reaches only through the project screens:
 * the pages the project routes render (account routes render some of them too) and what those pages import.
 */
function projectComponents(): string[] {
  const pages = new Set([
    ROUTES,
    ...importsOf(ROUTES).filter((file) => file.startsWith('src/pages/')),
  ])
  const everywhereElse = reach(['src/main.tsx'], pages)
  const onlyProjects = [...reach([...pages], new Set())].filter((file) => !everywhereElse.has(file))
  return srcFiles.filter(
    (file) =>
      file.startsWith('src/components/') &&
      file.endsWith('.tsx') &&
      // The Lore-owned parts the manuscript alone opens (LoreContext*, LorePreview) count as Lore.
      !file.startsWith('src/components/lore/') &&
      (PROJECT_FOLDERS.test(file) || onlyProjects.includes(file)),
  )
}

// The project components today. A new one is refused (extend a Lore, Types or shared part instead); a deleted one is
// taken off. Stage 10a took off TemplateFields, SchemaTypeFields and FieldForm; stage 10b ProjectCard, Production and
// SagasUnassigned; stage 11a OutlineItem, ArcSection, ChapterSection, FoldToggle, LoreReference and LoreReorderHandle; stage 11b
// SceneBeatsField and StoryPartPublication.
const PROJECT_COMPONENTS: string[] = [
  'src/components/ChapterForm.tsx',
  'src/components/ChapterPages.tsx',
  'src/components/CinemaSagas.tsx',
  'src/components/ComicCollections.tsx',
  'src/components/ComicPageEditor.tsx',
  'src/components/ContainerName.tsx',
  'src/components/CoverDrawer.tsx',
  'src/components/LoreContext.tsx',
  'src/components/ManuscriptEditor.tsx',
  'src/components/ManuscriptHistory.tsx',
  'src/components/ManuscriptPanel.tsx',
  'src/components/ManuscriptParts.tsx',
  'src/components/ManuscriptWriter.tsx',
  'src/components/MentionProse.tsx',
  'src/components/MentionSuggestions.tsx',
  'src/components/NameLinker.tsx',
  'src/components/NameSummaryDrawer.tsx',
  'src/components/PickOneDrawer.tsx',
  'src/components/PlotArcForm.tsx',
  'src/components/ProjectEntitiesView.tsx',
  'src/components/ProjectEntityDetailView.tsx',
  'src/components/ProjectEntityFields.tsx',
  'src/components/ProjectEntries.tsx',
  'src/components/ProjectEntryForm.tsx',
  'src/components/ProjectOutline.tsx',
  'src/components/ProjectScript.tsx',
  'src/components/ProjectSeasons.tsx',
  'src/components/ProjectShell.tsx',
  'src/components/SceneCard.tsx',
  'src/components/SceneContext.tsx',
  'src/components/SceneForm.tsx',
  'src/components/ShelfCard.tsx',
  'src/components/StoryForm.tsx',
  'src/components/StoryRedirect.tsx',
  'src/components/projectEntities/EntryPictures.tsx',
  'src/components/projectEntities/EpisodeForm.tsx',
  'src/components/projectEntities/NodeEditor.tsx',
  'src/components/projectEntities/OutlineBranch.tsx',
  'src/components/projectEntities/PagePanels.tsx',
  'src/components/projectEntities/PageRow.tsx',
  'src/components/projectEntities/PanelForm.tsx',
  'src/components/projectEntities/PanelLore.tsx',
  'src/components/projectEntities/ProjectEntriesFilters.tsx',
  'src/components/projectEntities/ProjectEntryList.tsx',
  'src/components/projectEntities/SchemaHead.tsx',
  'src/components/projectEntities/SchemaTypeItem.tsx',
  'src/components/projectEntities/ScriptEditor.tsx',
  'src/components/projectEntities/ScriptPart.tsx',
  'src/components/projectEntities/ScriptPartFields.tsx',
  'src/components/projectEntities/SeasonEpisodes.tsx',
  'src/components/projectEntities/SeasonItem.tsx',
  'src/components/projects/ComicCollectionItem.tsx',
  'src/components/projects/NewProject.tsx',
  'src/components/projects/ProjectBody.tsx',
  'src/components/projects/SagaSection.tsx',
  'src/components/stories/ManuscriptBody.tsx',
  'src/components/stories/ManuscriptHead.tsx',
  'src/components/stories/ManuscriptNotices.tsx',
  'src/components/stories/ManuscriptRevision.tsx',
  'src/components/stories/ManuscriptTools.tsx',
  'src/components/stories/SceneFormFields.tsx',
  'src/components/stories/StoryBar.tsx',
  'src/components/stories/StoryChapterSections.tsx',
  'src/components/stories/StoryForms.tsx',
  'src/components/stories/StoryHeader.tsx',
  'src/components/stories/StorySceneCards.tsx',
  'src/components/stories/StoryScenes.tsx',
  'src/components/typeTemplates/TemplateRow.tsx',
]

test('no new project component: the frozen list only shrinks', () => {
  const found = projectComponents()
  assert.deepEqual(
    found.filter((file) => !PROJECT_COMPONENTS.includes(file)),
    [],
    'a new project component: reuse a Lore, Types or shared part, or give one a prop',
  )
  assert.deepEqual(
    PROJECT_COMPONENTS.filter((file) => !found.includes(file)),
    [],
    'stale entry: remove it',
  )
})

const projectFiles = () => [
  ...projectComponents(),
  ...srcFiles.filter((file) =>
    /^src\/(projectEntities|projects|stories|typeTemplates)\//.test(file),
  ),
]

const tokens = (source: string) =>
  classStrings(source).flatMap((value) => value.replaceAll('\u0001', ' ').split(/\s+/))

const writesFieldRow = (source: string) =>
  tokens(source).some((token) => token === 'fieldlist__row' || token === 'fieldlist__inherited')

test('project field rows are Lore’s TypeFieldRow and InheritedFields', () => {
  assert.ok(writesFieldRow('<li className="fieldlist__row">'))
  assert.ok(writesFieldRow('<li className={`fieldlist__row ${extra}`}>'))
  assert.ok(writesFieldRow("<div className={open ? 'fieldlist__inherited' : ''}>"))
  assert.ok(!writesFieldRow('<ul className="fieldlist">'))
  assert.ok(!writesFieldRow('<li className="fieldlist__rows">'))
  assert.deepEqual(
    projectFiles().filter((file) => writesFieldRow(read(file))),
    [],
    'list a field with TypeFieldRow, inherited ones with InheritedFields, a named row with TypeRow',
  )
})

const writesProjectCard = (source: string) =>
  tokens(source).some((token) => token.startsWith('projectcard') || token === 'projectform--inline')

// The project card is gone (#456 P2): no file draws one again. That only TypeRow writes `types__row` is cards.test.ts's.
test('project rows are Lore’s TypeRow, not a project card', () => {
  assert.ok(writesProjectCard('<li className="projectcard">'))
  assert.ok(writesProjectCard('<ol className="projectcardlist">'))
  assert.ok(writesProjectCard('<div className={`projectcard__${part}`}>'))
  assert.ok(writesProjectCard("<form className={busy ? 'form projectform--inline' : 'form'}>"))
  assert.ok(!writesProjectCard('<li className="types__row">'))
  assert.deepEqual(
    srcFiles.filter((file) => writesProjectCard(read(file))),
    [],
    'draw a project row with TypeRow and TypeRowActions',
  )
})

const asksDestructiveByHand = (source: string) => /variant:\s*'destructive'/.test(source)

test('a project delete asks through confirmDelete', () => {
  assert.ok(asksDestructiveByHand("confirmAction({ title, confirmLabel, variant: 'destructive' })"))
  assert.ok(!asksDestructiveByHand('confirmDelete({ title, confirmLabel }, work, run)'))
  assert.deepEqual(
    srcFiles
      .filter((file) =>
        /^src\/components\/(projects|projectEntities|typeTemplates)\/|^src\/components\/(CinemaSagas|TypeTemplates)\.tsx$/.test(
          file,
        ),
      )
      .filter((file) => asksDestructiveByHand(read(file))),
    [],
    'use confirmDelete from lib/confirm.ts',
  )
})

const writesStoryOutline = (source: string) =>
  tokens(source).some(
    (token) =>
      /^scenes?(__|--|$)/.test(token) ||
      token.startsWith('chapter__') ||
      token.startsWith('foldtoggle') ||
      token.startsWith('lorechip'),
  )

// A story's arcs, chapters and scenes, a project's outline and the comic collections are TypeRows in a types list, their
// facts a FactList and their lore EntityRows (#456 P7): no project file draws the old outline parts again.
test('the story outline is TypeRow, FactList and EntityRow', () => {
  assert.ok(writesStoryOutline('<ol className="scenes">'))
  assert.ok(writesStoryOutline('<li className="scene">'))
  assert.ok(writesStoryOutline('<p className="scene__summary prose">'))
  assert.ok(writesStoryOutline('<div className={`scene__refs scene__refs--${kind}`}>'))
  assert.ok(writesStoryOutline('<span className={`chapter__${part}`}>'))
  assert.ok(writesStoryOutline("<button className={open ? 'foldtoggle' : 'foldtoggle'}>"))
  assert.ok(writesStoryOutline('<a className={`lorechip ${extra}`}>'))
  assert.ok(writesStoryOutline('<span className="lorechip__note">'))
  assert.ok(!writesStoryOutline('<ul className="types__list">'))
  assert.ok(!writesStoryOutline('<li className="relation">'))
  assert.ok(!writesStoryOutline('<p className="scenery">'))
  assert.ok(!writesStoryOutline('<div className="chapterlist">'))
  assert.deepEqual(
    projectFiles().filter((file) => writesStoryOutline(read(file))),
    [],
    'draw an outline row with TypeRow and TypeRowActions, its facts with FactList, its lore with EntityRow',
  )
})

const writesStoryPage = (source: string) =>
  tokens(source).some(
    (token) =>
      token.startsWith('story__') ||
      token.startsWith('storygroup') ||
      token.startsWith('msoutline') ||
      token.startsWith('partpub'),
  )

// A story's page, its manuscript and a script part are a Lore entry's layout (`entry__layout`, `entry__main`,
// `entry__rail`), head and tools; a part's publication is ContentPublication's (#456 P8): no project file draws the old
// story page parts again.
test('the story page and the manuscript are on a Lore entry layout', () => {
  assert.ok(writesStoryPage('<div className="story__bar">'))
  assert.ok(writesStoryPage('<section className={`story__scenes ${extra}`}>'))
  assert.ok(writesStoryPage("<header className={open ? 'storygroup__head' : ''}>"))
  assert.ok(writesStoryPage('<nav className={`msoutline msoutline--${state}`}>'))
  assert.ok(writesStoryPage('<div className="contentpub partpub">'))
  assert.ok(!writesStoryPage('<article className={`story story--${view}`}>'))
  assert.ok(!writesStoryPage('<div className="entry__layout">'))
  assert.ok(!writesStoryPage('<ol className="history__list">'))
  assert.ok(!writesStoryPage('<li className="storyrow">'))
  assert.deepEqual(
    projectFiles().filter((file) => writesStoryPage(read(file))),
    [],
    'lay a story page or a manuscript out with entry__layout, EntryHead and EntryTools; publish a part with ContentPublication',
  )
})
