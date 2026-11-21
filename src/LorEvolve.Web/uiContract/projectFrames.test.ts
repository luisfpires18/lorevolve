// Run with `node --test uiContract/projectFrames.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps the projects screens on the shared parts (#456): a panel is `Section` with `PageHeader`, a shelf is `CardGrid`
// of `ShelfCard`s, and the New project address is built once, in `projects/sections.ts`. The classes of the old project
// frames (`projects`, `projectbody`, `projectframe`, `storylist`, `shelf`) are gone, and so are the comic page editor's
// own. Every string literal counts, class strings built in template literals included. Catalogue:
// docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { elements, literals, read, webRoot } from './support.ts'

const codeFiles = readdirSync(join(webRoot, 'src'), { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts'))
  .map((file) => 'src/' + file.replaceAll('\\', '/'))
  .sort()

const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

// Every word of every string literal; the mark `literals()` puts for `${...}` is split off, so `projectframe--${x}`
// still counts.
const words = (source: string) =>
  literals(stripComments(source)).flatMap((value) =>
    value.replaceAll('\u0001', ' \u0001 ').split(/\s+/).filter(Boolean),
  )

// The files that draw a projects screen: its components, its pages, the comic page editor and the shelf cards.
const isProjectFile = (file: string) =>
  file.endsWith('.tsx') &&
  (/^src\/components\/(projects|projectEntities|stories|typeTemplates)\//.test(file) ||
    /^src\/components\/(Project|Cinema|Comic|Story|TypeTemplates|Outline|Season)[A-Za-z]*\.tsx$/.test(
      file,
    ) ||
    /^src\/pages\/(Project|Stor|CategoryShelf|GameEntit)[A-Za-z]*\.tsx$/.test(file))

const oldProjectClass = (word: string) =>
  word === 'projects' ||
  /^projects__/.test(word) ||
  /^projectframe(--|__|$)/.test(word) ||
  ['projectbody', 'projectmeta', 'storylist', 'shelf', 'shelf--wide'].includes(word) ||
  /^comic(page|art)(--|__|$)/.test(word)

const writesOldClass = (source: string) => words(source).some(oldProjectClass)

// The one place the New project address is built. The account route table names the path of its route, not a link.
const NEW_PROJECT = '/app/projects/new'
const NEW_PROJECT_FILES = ['src/projects/sections.ts', 'src/routes/accountRoutes.tsx']
const writesNewProject = (source: string) =>
  literals(stripComments(source)).some((value) => value.includes(NEW_PROJECT))

// A shelf card sits in a CardGrid, and only the two shelf pages draw one.
const SHELF_PAGES = ['src/pages/CategoryShelfPage.tsx', 'src/pages/StoriesPage.tsx']
const cardsIn = (source: string) =>
  (stripComments(source).match(/<ShelfCard(?=[\s>/])/g) ?? []).length
const cardsInGrids = (source: string) =>
  elements(stripComments(source), 'CardGrid').reduce((sum, grid) => sum + cardsIn(grid.body), 0)
const looseCards = (source: string) => cardsIn(source) - cardsInGrids(source)

test('the project guard catches an old frame class, template-built ones included', () => {
  assert.ok(writesOldClass('<section className="projects" data-testid="x">'))
  assert.ok(writesOldClass('<div className="projectbody">'))
  assert.ok(writesOldClass('<ul className="storylist">'))
  assert.ok(writesOldClass('<ul className={wide ? "shelf shelf--wide" : "shelf"}>'))
  assert.ok(
    writesOldClass('<div className={`projectframe ${story ? "projectframe--story" : ""}`}>'),
  )
  assert.ok(writesOldClass('<p className={`projects__lede ${x}`}>'))
  assert.ok(writesOldClass('<span className={`projectmeta ${x}`}>'))
  assert.ok(writesOldClass('<article className="comicpage__panel">'))
  assert.ok(writesOldClass('<span className={`imagefield comicart__${kind}`}>'))
  assert.ok(!writesOldClass('<Section testId="project-schema">'))
  assert.ok(!writesOldClass('<ShelfCard frame="book" className="shelfcard">'))
  assert.ok(!writesOldClass('<ul className="idealist">'))
  // A comment that names a class is not a use of it.
  assert.ok(!writesOldClass('// was <section className="projects">\nconst a = 1'))
  assert.ok(isProjectFile('src/components/ProjectOutline.tsx'))
  assert.ok(isProjectFile('src/pages/CategoryShelfPage.tsx'))
  assert.ok(!isProjectFile('src/components/lore/LoreCatalog.tsx'))
})

test('the project screens write none of the old project frame classes', () => {
  const found = codeFiles.filter(isProjectFile).filter((file) => writesOldClass(read(file)))
  assert.deepEqual(
    found,
    [],
    'a panel is Section, a shelf is CardGrid (docs/design/ui-components.md)',
  )
})

test('the New project address catches a hand-built copy, template strings included', () => {
  assert.ok(writesNewProject("to={'/app/projects/new?universeId=1'}"))
  assert.ok(writesNewProject('to={`/app/projects/new?universeId=${id}&kind=${kind}`}'))
  assert.ok(writesNewProject('navigate(`${base}/app/projects/new`)'))
  assert.ok(!writesNewProject('to={newProjectPath(universe.id, kinds[0])}'))
  assert.ok(!writesNewProject('// /app/projects/new\nconst a = 1'))
})

test('the New project address is built in projects/sections.ts only', () => {
  const found = codeFiles.filter((file) => writesNewProject(read(file)))
  assert.deepEqual(
    found.filter((file) => !NEW_PROJECT_FILES.includes(file)),
    [],
    'use newProjectPath (src/projects/sections.ts)',
  )
  assert.deepEqual(
    NEW_PROJECT_FILES.filter((file) => !found.includes(file)),
    [],
    'stale entry, remove it',
  )
})

test('the shelf guard catches a card outside a CardGrid', () => {
  assert.equal(looseCards('<ul className="x"><ShelfCard frame="book" /></ul>'), 1)
  assert.equal(looseCards('<CardGrid><ShelfCard frame="book" /></CardGrid><ShelfCard />'), 1)
  assert.equal(
    looseCards('<CardGrid min={15}>{rows.map((r) => <ShelfCard key={r} />)}</CardGrid>'),
    0,
  )
  assert.equal(looseCards('<CardGrid><ShelfCard frame="film" />\n</CardGrid>'), 0)
  assert.equal(cardsIn('// <ShelfCard />\nconst a = 1'), 0)
  assert.equal(cardsIn('<ShelfCards />'), 0)
})

test('a ShelfCard is drawn inside a CardGrid, in the two shelf pages only', () => {
  for (const file of codeFiles.filter((one) => one.endsWith('.tsx'))) {
    const source = read(file)
    if (file === 'src/components/ShelfCard.tsx') continue
    if (SHELF_PAGES.includes(file)) {
      assert.ok(cardsIn(source) > 0, `${file}: stale entry, it draws no ShelfCard`)
      assert.equal(looseCards(source), 0, `${file}: put every ShelfCard inside the CardGrid`)
    } else {
      assert.equal(cardsIn(source), 0, `${file}: a shelf card belongs to the two shelf pages`)
    }
  }
})
