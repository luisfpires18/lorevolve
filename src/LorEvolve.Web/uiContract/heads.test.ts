// Run with `node --test uiContract/heads.test.ts` (Node 22.18+ strips the types itself).
//
// Keeps the head of a screen, a panel, a document and an entry, a crumb, the routed views, a titled block and the tab's
// title on their shared parts (#412): PageHeader, Crumb, DocumentHead, EntryHead, ViewLinks, Section and
// useTitleDetail. Each list below only shrinks, and a stale entry fails. Catalogue: docs/design/ui-components.md.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classStrings, elements, read, tsxFiles } from './support.ts'

const tokens = (source: string) => classStrings(source).flatMap((value) => value.split(/\s+/))
const has = (source: string, names: string[]) =>
  tokens(source).some((token) => names.includes(token))

type Allowed = Set<string> | Map<string, string>

function check(found: string[], allowed: Allowed, say: string) {
  assert.deepEqual(
    found.filter((file) => !allowed.has(file)),
    [],
    say,
  )
  assert.deepEqual(
    [...allowed.keys()].filter((file) => !found.includes(file)),
    [],
    'stale allowlist entry: remove it',
  )
}

const withClass = (names: string[]) => tsxFiles.filter((file) => has(read(file), names))

// The one `h1` of a screen is PageHeader's (a variable tag, so it never spells `<h1`), DocumentHead's or EntryHead's.
const H1_OWNERS = new Map<string, string>([
  ['src/components/DocumentHead.tsx', 'the shared part: a document editor or reader'],
  ['src/components/EntryHead.tsx', 'the shared part: an entry page'],
  ['src/components/ArticleView.tsx', "the author's own article headings, from stored content"],
  ['src/components/AuthLayout.tsx', 'auth pages: a brand panel layout, out of #412 scope'],
  ['src/components/PortalMissing.tsx', 'public portal: its own tokens and tab title (ADR 0038)'],
  ['src/components/portal/PublicAuthor.tsx', 'public portal (ADR 0038)'],
  ['src/components/portal/PublicLore.tsx', 'public portal (ADR 0038)'],
  ['src/components/portal/PublicStory.tsx', 'public portal (ADR 0038)'],
  ['src/components/portal/World.tsx', 'public portal (ADR 0038)'],
  ['src/pages/ExplorePage.tsx', 'public portal (ADR 0038)'],
])

// Classes of the hand-made heads, crumbs and blocks the shared parts replaced. `entry__head` is EntryHead's own.
const HEAD_CLASSES = [
  'projects__head',
  'projects__headtext',
  'projects__crumb',
  'idea__head',
  'rule__head',
  'entry__head',
  'home__heading',
  'home__title',
  'profile__title',
  'lore__path',
  'entry__crumbs',
  'story__crumbs',
  'aichange__back',
]
const SECTION_CLASSES = ['settings__section', 'publish__section', 'adminsection', 'profile__public']
const HEADING_CLASSES = [
  'settings__heading',
  'publish__heading',
  'profile__subtitle',
  'aichangeitem__title',
  'rail__heading',
  'relations__reading',
  'familydetails__heading',
  'family__setupheading',
  'mapscreen__pinsheading',
  'storygroup__title',
]

// The tab's title has one owner per screen: a shell, or a route that owns its own. Each with its reason.
const TITLE_OWNERS = new Map<string, string>([
  ['src/components/WorkspaceLayout.tsx', 'the account shell'],
  ['src/pages/UniverseWorkspace.tsx', "the universe's shell"],
  ['src/pages/AdminWorkspace.tsx', "Admin's own shell"],
  ['src/pages/ProjectPage.tsx', 'one project at the account level owns its route'],
  ['src/components/projects/NewProject.tsx', 'a new project owns its route'],
  ['src/pages/InvitationPage.tsx', 'auth pages are out of #412 scope'],
  ['src/pages/ConnectAuthorizePage.tsx', 'auth pages are out of #412 scope'],
  ['src/components/PortalMissing.tsx', 'public portal: its own title (ADR 0038)'],
  ['src/components/portal/PublicAuthor.tsx', 'public portal (ADR 0038)'],
  ['src/components/portal/PublicLore.tsx', 'public portal (ADR 0038)'],
  ['src/components/portal/PublicStory.tsx', 'public portal (ADR 0038)'],
  ['src/components/portal/World.tsx', 'public portal (ADR 0038)'],
  ['src/pages/ExplorePage.tsx', 'public portal (ADR 0038)'],
])
// Named so that nobody adds a hook back: these screens hand the shell a name instead, or have none.
const NO_TITLE_HOOK = [
  'src/pages/ProjectsDirectory.tsx',
  'src/pages/ProjectsPage.tsx',
  'src/pages/StoriesPage.tsx',
  'src/pages/CategoryShelfPage.tsx',
  'src/pages/GameEntitiesPage.tsx',
  'src/pages/GameEntityPage.tsx',
  'src/pages/LoginPage.tsx',
  'src/pages/RegisterPage.tsx',
  'src/pages/ForgotPasswordPage.tsx',
  'src/pages/ResetPasswordPage.tsx',
]

const handTitle = (source: string) => /\b(useDocumentTitle|useWholeTitle)\(/.test(source)
const handDetail = (source: string) => /\buseTitleDetail\(/.test(source)

test('each guard catches the hand-written form', () => {
  assert.ok(has('<h2 className="projects__head sectionrule">', HEAD_CLASSES))
  assert.ok(has('<nav className={`entry__crumbs ${x}`}>', HEAD_CLASSES))
  assert.ok(!has('<PageHeader level={2} size="panel" title="x" />', HEAD_CLASSES))
  assert.ok(has('<section className="settings__section danger">', SECTION_CLASSES))
  assert.ok(!has('<Section title="x" />', SECTION_CLASSES))
  assert.ok(has('<nav className="views ideatabs">', ['views']))
  assert.ok(!has('<ViewLinks label="x" items={[]} />', ['views']))
  assert.ok(handTitle('useDocumentTitle(heading)'))
  assert.ok(handTitle('useWholeTitle(null)'))
  assert.ok(!handTitle('useTitleDetail(game?.name ?? null)'))
  assert.ok(handDetail('useTitleDetail(name)'))
  const bad = '<PageHeader title="x" />'
  assert.ok(elements(bad, 'PageHeader').some(({ tag }) => !/\blevel=/.test(tag)))
  assert.ok(
    !elements('<PageHeader level={2} title="x" />', 'PageHeader').some(
      ({ tag }) => !/\blevel=/.test(tag),
    ),
  )
  assert.ok(/<h1/.test('<h1 className="x">'))
})

test('the one h1 of a screen is in a shared head; the others are listed with their reason', () => {
  check(
    tsxFiles.filter((file) => /<h1/.test(read(file))),
    H1_OWNERS,
    'use PageHeader, DocumentHead or EntryHead (docs/design/ui-components.md)',
  )
})

test('no hand-made head or crumb outside the shared parts', () => {
  check(
    withClass(HEAD_CLASSES),
    new Map([['src/components/EntryHead.tsx', 'the shared part']]),
    'use PageHeader, Crumb, DocumentHead or EntryHead',
  )
})

test('routed views are ViewLinks', () => {
  check(
    withClass(['views']),
    new Map([['src/components/ViewLinks.tsx', 'the shared part']]),
    'use ViewLinks',
  )
})

test('a titled block is Section and its heading is SectionTitle', () => {
  check(withClass(SECTION_CLASSES), new Set(), 'use Section')
  const onHeading = tsxFiles.filter((file) =>
    [1, 2, 3, 4, 5, 6].some((level) =>
      elements(read(file), `h${level}`).some(({ tag }) =>
        has(`className="${/className="([^"]*)"/.exec(tag)?.[1] ?? ''}"`, HEADING_CLASSES),
      ),
    ),
  )
  check(onHeading, new Set(), 'use SectionTitle')
  check(
    withClass(['sectiontitle', 'sectiontitle--label']),
    new Map([['src/components/lore/EntryArticleView.tsx', 'a figcaption, not a heading']]),
    'use SectionTitle',
  )
})

test('the tab title has one owner per screen', () => {
  check(
    tsxFiles.filter((file) => handTitle(read(file))),
    TITLE_OWNERS,
    'the shell owns the title; hand it a name with useTitleDetail (src/lib/useTitleDetail.ts)',
  )
  assert.deepEqual(
    NO_TITLE_HOOK.filter((file) => handTitle(read(file))),
    [],
    'this screen must not set the title',
  )
  check(
    tsxFiles.filter((file) => handDetail(read(file))),
    new Map([
      ['src/pages/ProjectsPage.tsx', "a section's own list (Game Entities) names that section"],
      ['src/projects/gameGate.tsx', 'the game name, once read'],
    ]),
    'only a screen that reads a name the shell cannot hands one up',
  )
})

test('a head inside a project says its level', () => {
  const scope = tsxFiles.filter(
    (file) =>
      (file.startsWith('src/components/projects/') && !file.endsWith('/NewProject.tsx')) ||
      file.startsWith('src/components/projectEntities/') ||
      [
        'src/components/ProjectEntitiesView.tsx',
        'src/components/ProjectSchema.tsx',
        'src/components/ProjectOutline.tsx',
      ].includes(file),
  )
  const missing = scope.filter((file) =>
    elements(read(file), 'PageHeader').some(({ tag }) => !/\blevel=/.test(tag)),
  )
  assert.deepEqual(missing, [], 'a PageHeader inside a project passes level (it is not the h1)')
})

test("a document's way back is a Crumb, and a head of actions alone is PageHeader without a title", () => {
  const head = read('src/components/DocumentHead.tsx')
  assert.ok(/<Crumb\s[^>]*\bback\b/.test(head), 'DocumentHead draws its way back with Crumb back')
  assert.ok(!/<Link\s/.test(head), 'no hand-made back link in DocumentHead')
  assert.deepEqual(
    tsxFiles.filter((file) => /\bschema__actions\b/.test(read(file))),
    [],
    'a row of head actions is PageHeader with no title',
  )
})
