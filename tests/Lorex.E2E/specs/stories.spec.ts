import { expect, test, type Page } from '@playwright/test'
import { chooseFromMenu, openMenuFor } from './support/rowMenu'
import { acceptConfirm, confirmDialog } from './support/confirm'

/**
 * Stories, their chapters and their scenes, end to end. Each test registers its own account and builds
 * its own universe, so nothing depends on data another test left behind.
 *
 * The invariants under test throughout: a story is read in the order its author tells it - chapters in
 * their order, scenes in theirs inside each chapter or in Unchaptered - and where each scene happens in
 * the world is shown on the scene, written by the universe's own chronology, and never moves it. A scene
 * moved between chapters is the same scene, holding everything it held.
 */
const PASSWORD = 'Test-password-123!'

/** Mirrors the API enums. */
const Direction = { up: 0, down: 1 } as const

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('teller')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

/** Creates a universe through the UI and returns the id it was given. */
async function newUniverse(page: Page, name: string) {
  await page.goto('/app')
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

/** Before the Fall counts down, After the Fall counts up. */
async function seedTheFall(page: Page, universeId: string) {
  const response = await page.request.put(`/api/universes/${universeId}/chronology`, {
    data: {
      eras: [
        {
          id: null,
          name: 'Before the Fall',
          abbreviation: 'BF',
          direction: Direction.down,
          labelPosition: 0,
        },
        {
          id: null,
          name: 'After the Fall',
          abbreviation: 'AF',
          direction: Direction.up,
          labelPosition: 0,
        },
      ],
    },
  })
  expect(response.status()).toBe(200)
  return (await response.json()).eras as { id: string; name: string }[]
}

/** Writes entries straight through the API, for tests that are about using them. */
async function seedEntities(page: Page, universeId: string, names: string[]) {
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string }[]
  const character = types.find((type) => type.name === 'Character')!

  const ids: Record<string, string> = {}
  for (const name of names) {
    const created = await page.request.post(`/api/universes/${universeId}/entities`, {
      data: {
        entityTypeId: character.id,
        name,
        summary: null,
        canonStatus: 0,
        aliases: [],
        tags: [],
        fields: [],
      },
    })
    expect(created.status()).toBe(201)
    ids[name] = (await created.json()).id as string
  }
  return ids
}

interface SceneSeed {
  title: string
  summary?: string
  pov?: string
  entities?: string[]
  chronology?: { eraId: string | null; year: number; month: number | null; day: number | null }
  /** The chapter's id; left out for Unchaptered. */
  chapter?: string
}

async function seedScene(page: Page, universeId: string, storyId: string, scene: SceneSeed) {
  const created = await page.request.post(
    `/api/universes/${universeId}/stories/${storyId}/scenes`,
    {
      data: {
        title: scene.title,
        summary: scene.summary ?? null,
        notes: null,
        povEntityId: scene.pov ?? null,
        chronology: scene.chronology ?? null,
        entityIds: scene.entities ?? [],
        chapterId: scene.chapter ?? null,
      },
    },
  )
  expect(created.status()).toBe(201)
}

async function seedStory(page: Page, universeId: string, title: string, scenes: SceneSeed[]) {
  const story = await page.request.post(`/api/universes/${universeId}/stories`, {
    data: { title, premise: null, status: 0 },
  })
  expect(story.status()).toBe(201)
  const storyId = (await story.json()).id as string

  for (const scene of scenes) await seedScene(page, universeId, storyId, scene)

  return storyId
}

async function seedChapter(
  page: Page,
  universeId: string,
  storyId: string,
  title: string,
  summary: string | null = null,
) {
  const created = await page.request.post(
    `/api/universes/${universeId}/stories/${storyId}/chapters`,
    { data: { title, summary, notes: null } },
  )
  expect(created.status()).toBe(201)
  return (await created.json()).id as string
}

interface SceneInput {
  title: string
  summary?: string
  era?: string
  year?: string
  pov?: string
  lore?: string[]
}

/**
 * Writes one scene through the drawer, the way an author would: from the story's own "New scene", or
 * from a chapter's "Add scene" when `chapterTitle` names one.
 */
async function addScene(page: Page, input: SceneInput, chapterTitle?: string) {
  if (chapterTitle) {
    await chapter(page, chapterTitle).getByTestId('chapter-new-scene').click()
  } else {
    await page.getByTestId('new-scene').click()
  }

  const form = page.getByTestId('scene-form')
  await expect(form).toBeVisible()

  await page.getByTestId('scene-title-input').fill(input.title)
  if (input.summary) await page.getByTestId('scene-summary-input').fill(input.summary)
  if (input.era) await page.getByTestId('scene-eraId').selectOption({ label: input.era })
  if (input.year) await page.getByTestId('scene-year').fill(input.year)

  if (input.pov) {
    const pov = page.getByTestId('scene-pov-field')
    await pov.getByTestId('picker-input').fill(input.pov)
    await pov.getByTestId(`picker-option-${input.pov}`).click()
  }

  for (const name of input.lore ?? []) {
    const lore = page.getByTestId('scene-lore-field')
    await lore.getByTestId('participant-input').fill(name)
    await lore.getByTestId(`participant-option-${name}`).click()
  }

  await page.getByTestId('save-scene').click()
  await expect(form).toHaveCount(0)
}

/** Writes one chapter through the drawer. */
async function addChapter(page: Page, title: string, summary?: string) {
  await page.getByTestId('new-chapter').click()
  const form = page.getByTestId('chapter-form')
  await expect(form).toBeVisible()

  await page.getByTestId('chapter-title-input').fill(title)
  if (summary) await page.getByTestId('chapter-summary-input').fill(summary)

  await page.getByTestId('save-chapter').click()
  await expect(form).toHaveCount(0)
  await expect(chapter(page, title)).toBeVisible()
}

function scene(page: Page, title: string) {
  return page.locator(`[data-testid="scene"][data-title="${title}"]`)
}

function chapter(page: Page, title: string) {
  return page.locator(`[data-testid="chapter"][data-title="${title}"]`)
}

/** The scene titles, top to bottom, as the page lists them. */
function sceneOrder(page: Page) {
  return page
    .getByTestId('scene')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-title') ?? ''))
}

/**
 * The story's structure as the page draws it, one line per group: "Unchaptered | a | b" while Unchaptered
 * is shown, then "Chapter 1: Arrival | c" for each chapter, top to bottom.
 */
function structure(page: Page) {
  return page.getByTestId('story-page').evaluate((root) => {
    const titles = (group: Element) =>
      [...group.querySelectorAll('[data-testid="scene"]')].map(
        (node) => node.getAttribute('data-title') ?? '',
      )
    const lines: string[] = []

    const unchaptered = root.querySelector('[data-testid="unchaptered"]')
    if (unchaptered) lines.push(['Unchaptered', ...titles(unchaptered)].join(' | '))

    for (const group of root.querySelectorAll('[data-testid="chapter"]')) {
      const heading = group.querySelector('[data-testid="chapter-heading"]')?.textContent ?? ''
      lines.push([heading, ...titles(group)].join(' | '))
    }

    return lines
  })
}

/**
 * Uses a control and waits for its write to be saved, not only redrawn. The page announces the result
 * once the save has landed, which is also when it will take the next move.
 */
async function saveAndAnnounce(
  page: Page,
  route: string,
  action: () => Promise<void>,
  announcement: string,
) {
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().endsWith(route) && response.request().method() === 'PUT',
    ),
    action(),
  ])
  await expect(page.getByTestId('story-announcer')).toHaveText(announcement)
}

function moveAndSave(page: Page, action: () => Promise<void>, announcement: string) {
  return saveAndAnnounce(page, '/scenes/order', action, announcement)
}

/** "Move to…" on one scene, then the named container. */
async function moveSceneTo(page: Page, title: string, target: string, announcement: string) {
  await saveAndAnnounce(
    page,
    '/position',
    async () => {
      await openMenuFor(scene(page, title), 'scene-move-to-option')
      await scene(page, title)
        .locator(`[data-testid="scene-move-to-option"][data-target="${target}"]`)
        .click()
    },
    announcement,
  )
}

/** What the element holding the focus is, and which scene and chapter it belongs to. */
function focused(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement
    return {
      control: element?.getAttribute('data-testid') ?? null,
      scene: element?.closest('[data-testid="scene"]')?.getAttribute('data-title') ?? null,
      chapter: element?.closest('[data-testid="chapter"]')?.getAttribute('data-title') ?? null,
    }
  })
}

/** Whether the page can be scrolled sideways, which no screen in Lorex may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

test.describe('stories', () => {
  test('an author tells a story out of chronological order and the page keeps the telling', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Winter Reach '))
    await seedTheFall(page, universeId)
    await seedEntities(page, universeId, ['Arlen', 'White Tower', 'Council of Nine'])

    // Reached from the universe's own sidebar, where nothing has been told yet.
    await page.goto(`/app/universes/${universeId}`)
    await page.getByTestId('workspace-stories').click()
    await page.waitForURL(/\/stories$/)
    await expect(page.getByTestId('stories-empty')).toContainText('No stories yet.')

    await page.getByTestId('new-story').click()
    await page.getByTestId('story-title-input').fill('The Long Winter')
    await page.getByTestId('story-premise-input').fill('A siege, told from its last day back.')
    await page.getByTestId('story-status-drafting').click()
    await page.getByTestId('save-story').click()

    await page.waitForURL(/\/stories\/[0-9a-f-]+$/)
    const storyUrl = page.url()
    await expect(page.getByTestId('story-title')).toHaveText('The Long Winter')
    await expect(page.getByTestId('story-status')).toHaveText('Drafting')
    await expect(page.getByTestId('scenes-empty')).toContainText('No scenes yet.')

    // Told as aftermath, battle, childhood. Lived as childhood, battle, aftermath.
    await addScene(page, {
      title: 'Aftermath',
      summary: 'The gate stands open.',
      era: 'After the Fall (AF)',
      year: '30',
      pov: 'Arlen',
      lore: ['White Tower', 'Council of Nine'],
    })
    await addScene(page, {
      title: 'The Battle',
      era: 'After the Fall (AF)',
      year: '2',
      lore: ['Arlen'],
    })
    await addScene(page, { title: 'Childhood', era: 'Before the Fall (BF)', year: '40' })

    const told = ['Aftermath', 'The Battle', 'Childhood']
    await expect.poll(() => sceneOrder(page)).toEqual(told)

    // A story with no chapters is one plain list: no Unchaptered heading, no chapter to move to.
    await expect(page.getByTestId('unchaptered')).toHaveCount(0)
    await openMenuFor(scene(page, 'Aftermath'), 'scene-edit')
    await expect(scene(page, 'Aftermath').getByTestId('scene-move-to-option')).toHaveCount(0)
    await page.keyboard.press('Escape')

    // Every date is written by the universe's chronology, and none of them moved anything.
    await expect(scene(page, 'Aftermath').getByTestId('scene-when')).toHaveText('AF 30')
    await expect(scene(page, 'The Battle').getByTestId('scene-when')).toHaveText('AF 2')
    await expect(scene(page, 'Childhood').getByTestId('scene-when')).toHaveText('BF 40')
    await expect(scene(page, 'Aftermath').getByTestId('scene-pov')).toContainText('Arlen')
    await expect(scene(page, 'Aftermath').getByTestId('scene-lore')).toContainText('White Tower')
    await expect(scene(page, 'Aftermath').getByTestId('scene-lore')).toContainText(
      'Council of Nine',
    )

    await page.reload()
    await expect.poll(() => sceneOrder(page)).toEqual(told)

    // Childhood moves to the front of the telling, and stays there.
    await moveAndSave(
      page,
      () => chooseFromMenu(scene(page, 'Childhood'), 'scene-move-up'),
      '“Childhood” is now scene 2 of 3.',
    )
    await moveAndSave(
      page,
      () => chooseFromMenu(scene(page, 'Childhood'), 'scene-move-up'),
      '“Childhood” is now scene 1 of 3.',
    )
    await expect.poll(() => sceneOrder(page)).toEqual(['Childhood', 'Aftermath', 'The Battle'])

    await page.reload()
    await expect.poll(() => sceneOrder(page)).toEqual(['Childhood', 'Aftermath', 'The Battle'])

    // A linked entry is the entry's own page, not a copy of it.
    await scene(page, 'Aftermath')
      .getByTestId('scene-lore')
      .getByRole('link', { name: 'White Tower' })
      .click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await expect(page.getByText('White Tower').first()).toBeVisible()

    await page.goto(storyUrl)
    await scene(page, 'Aftermath').getByTestId('scene-pov').getByRole('link').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await expect(page.getByText('Arlen').first()).toBeVisible()

    // Edited in place: still the second scene told.
    await page.goto(storyUrl)
    await chooseFromMenu(scene(page, 'Aftermath'), 'scene-edit')
    await page.getByTestId('scene-title-input').fill('Aftermath at the Gate')
    await page.getByTestId('scene-notes-input').fill('Open on the silence.')
    await page.getByTestId('save-scene').click()
    await expect(page.getByTestId('scene-form')).toHaveCount(0)
    await expect
      .poll(() => sceneOrder(page))
      .toEqual(['Childhood', 'Aftermath at the Gate', 'The Battle'])

    // Deleted: the rest keep their order, and the entry it linked is still in the world.
    await chooseFromMenu(scene(page, 'The Battle'), 'scene-delete')
    await acceptConfirm(page)
    await expect.poll(() => sceneOrder(page)).toEqual(['Childhood', 'Aftermath at the Gate'])

    await page.getByTestId('workspace-stories').click()
    await page.waitForURL(/\/stories$/)
    const row = page.locator('[data-testid="story-row"][data-title="The Long Winter"]')
    await expect(row.getByTestId('story-scene-count')).toHaveText('2 scenes')
  })

  test('an author groups a story into chapters, moves scenes between them, and loses nothing', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Chapter Reach '))
    await seedEntities(page, universeId, ['Arlen', 'White Tower'])

    await page.goto(`/app/universes/${universeId}/stories`)
    await page.getByTestId('new-story').click()
    await page.getByTestId('story-title-input').fill('The Ashen Road')
    await page.getByTestId('save-story').click()
    await page.waitForURL(/\/stories\/[0-9a-f-]+$/)

    // Two chapters, numbered by where they sit and titled as written.
    await addChapter(page, 'Arrival', 'They reach the gate.')
    await addChapter(page, 'Ashes')
    await expect(chapter(page, 'Arrival').getByTestId('chapter-heading')).toHaveText(
      'Chapter 1: Arrival',
    )
    await expect(chapter(page, 'Ashes').getByTestId('chapter-heading')).toHaveText(
      'Chapter 2: Ashes',
    )
    await expect(chapter(page, 'Arrival').getByTestId('chapter-summary')).toHaveText(
      'They reach the gate.',
    )
    await expect(chapter(page, 'Ashes').getByTestId('chapter-empty')).toBeVisible()

    // Unchaptered appears only once it holds a scene.
    await expect(page.getByTestId('unchaptered')).toHaveCount(0)
    await addScene(page, { title: 'Loose thread', pov: 'Arlen', lore: ['White Tower'] })
    await expect(page.getByTestId('unchaptered')).toBeVisible()

    // "Add scene" on a chapter starts the scene in that chapter.
    await chapter(page, 'Arrival').getByTestId('chapter-new-scene').click()
    await expect(page.getByTestId('scene-chapter-select').locator('option:checked')).toHaveText(
      'Chapter 1: Arrival',
    )
    await page.getByTestId('cancel-scene').click()

    await addScene(page, { title: 'At the gate', pov: 'Arlen', lore: ['White Tower'] }, 'Arrival')
    await addScene(page, { title: 'Inside the walls' }, 'Arrival')
    await addScene(page, { title: 'Embers' }, 'Ashes')

    await expect
      .poll(() => structure(page))
      .toEqual([
        'Unchaptered | Loose thread',
        'Chapter 1: Arrival | At the gate | Inside the walls',
        'Chapter 2: Ashes | Embers',
      ])

    // Between chapters, without opening a form.
    await moveSceneTo(
      page,
      'Inside the walls',
      'Chapter 2: Ashes',
      '“Inside the walls” moved to Chapter 2: Ashes, scene 2 of 2.',
    )
    await expect
      .poll(() => structure(page))
      .toEqual([
        'Unchaptered | Loose thread',
        'Chapter 1: Arrival | At the gate',
        'Chapter 2: Ashes | Embers | Inside the walls',
      ])

    // Out to Unchaptered.
    await moveSceneTo(page, 'Embers', 'Unchaptered', '“Embers” moved to Unchaptered, scene 2 of 2.')
    await expect
      .poll(() => structure(page))
      .toEqual([
        'Unchaptered | Loose thread | Embers',
        'Chapter 1: Arrival | At the gate',
        'Chapter 2: Ashes | Inside the walls',
      ])

    // The chapters swap places, and renumber themselves.
    await saveAndAnnounce(
      page,
      '/chapters/order',
      () => chooseFromMenu(chapter(page, 'Ashes'), 'chapter-move-up'),
      '“Ashes” is now chapter 1 of 2.',
    )
    await expect
      .poll(() => structure(page))
      .toEqual([
        'Unchaptered | Loose thread | Embers',
        'Chapter 1: Ashes | Inside the walls',
        'Chapter 2: Arrival | At the gate',
      ])

    // Back into a chapter, then reordered inside it.
    await moveSceneTo(
      page,
      'Embers',
      'Chapter 1: Ashes',
      '“Embers” moved to Chapter 1: Ashes, scene 2 of 2.',
    )
    await moveAndSave(
      page,
      () => chooseFromMenu(scene(page, 'Embers'), 'scene-move-up'),
      '“Embers” is now scene 1 of 2 in Chapter 1: Ashes.',
    )

    // And from the scene's own form: another chapter puts it last there.
    await chooseFromMenu(scene(page, 'Loose thread'), 'scene-edit')
    await page.getByTestId('scene-chapter-select').selectOption({ label: 'Chapter 2: Arrival' })
    await page.getByTestId('save-scene').click()
    await expect(page.getByTestId('scene-form')).toHaveCount(0)

    const arranged = [
      'Chapter 1: Ashes | Embers | Inside the walls',
      'Chapter 2: Arrival | At the gate | Loose thread',
    ]
    await expect.poll(() => structure(page)).toEqual(arranged)

    await page.reload()
    await expect.poll(() => structure(page)).toEqual(arranged)
    await expect(page.getByTestId('story-chapter-count')).toHaveText('2 chapters')

    // Deleting a chapter says plainly what happens to its scenes, and does exactly that.
    await chooseFromMenu(chapter(page, 'Arrival'), 'chapter-delete')
    await expect(confirmDialog(page)).toContainText('The chapter will be removed.')
    await expect(confirmDialog(page)).not.toContainText(/scenes will be deleted/i)
    await acceptConfirm(page, 'Its 2 scenes will be moved to Unchaptered.')
    await expect
      .poll(() => structure(page))
      .toEqual([
        'Unchaptered | At the gate | Loose thread',
        'Chapter 1: Ashes | Embers | Inside the walls',
      ])

    await page.reload()
    await expect
      .poll(() => structure(page))
      .toEqual([
        'Unchaptered | At the gate | Loose thread',
        'Chapter 1: Ashes | Embers | Inside the walls',
      ])

    // The scenes that moved twice still hold their point of view and their lore, as real links.
    for (const title of ['At the gate', 'Loose thread']) {
      await expect(scene(page, title).getByTestId('scene-pov')).toContainText('Arlen')
      await expect(
        scene(page, title).getByTestId('scene-lore').getByRole('link', { name: 'White Tower' }),
      ).toBeVisible()
    }

    await scene(page, 'At the gate').getByTestId('scene-pov').getByRole('link').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await expect(page.getByText('Arlen').first()).toBeVisible()

    await page.getByTestId('workspace-stories').click()
    await page.waitForURL(/\/stories$/)
    const row = page.locator('[data-testid="story-row"][data-title="The Ashen Road"]')
    await expect(row.getByTestId('story-scene-count')).toHaveText('4 scenes')
  })

  test('a story is a row to open: the whole row leads in, named by its title, and Back returns to the list', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Rows '))
    const created = await page.request.post(`/api/universes/${universeId}/stories`, {
      data: { title: 'ظل المنارة 7', premise: 'A keeper waits for a ship.', status: 1 },
    })
    expect(created.status()).toBe(201)
    const storyId = (await created.json()).id as string

    await page.goto(`/app/universes/${universeId}/stories`)
    const row = page.getByTestId('story-row')
    // One link per row, named by the title alone - the status and the premise are read around it.
    await expect(row.getByRole('link')).toHaveCount(1)
    await expect(row.getByRole('link')).toHaveAccessibleName('ظل المنارة 7')

    // A press anywhere on the row - here, near its far corner, well away from the title - opens the story.
    const box = (await row.boundingBox())!
    await row.click({ position: { x: box.width - 12, y: box.height - 12 } })
    await page.waitForURL(new RegExp(`/stories/${storyId}$`))
    await expect(page.getByTestId('story-title')).toHaveText('ظل المنارة 7')
    await expect(page.getByTestId('story-view-scenes')).toHaveAttribute('aria-current', 'page')

    await page.goBack()
    await page.waitForURL(/\/stories$/)
    await expect(page.getByTestId('story-row')).toHaveCount(1)
  })

  test('scenes are reordered from the keyboard alone, and the focus follows the scene', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Key Reach '))
    const storyId = await seedStory(page, universeId, 'Three scenes', [
      { title: 'A' },
      { title: 'B' },
      { title: 'C' },
    ])

    await page.goto(`/app/universes/${universeId}/stories/${storyId}`)
    await expect.poll(() => sceneOrder(page)).toEqual(['A', 'B', 'C'])

    // The scene's menu is named with the scene; the moves are in it, and only the ones that can be made.
    const menu = scene(page, 'C').getByRole('button', { name: 'More actions for C' })
    await menu.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => focused(page)).toMatchObject({ control: 'scene-edit', scene: 'C' })
    await expect(scene(page, 'C').getByTestId('scene-move-down')).toHaveCount(0)
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => focused(page)).toMatchObject({ control: 'scene-move-up', scene: 'C' })

    await moveAndSave(page, () => page.keyboard.press('Enter'), '“C” is now scene 2 of 3.')
    await expect.poll(() => sceneOrder(page)).toEqual(['A', 'C', 'B'])
    // The focus follows the scene: back on its menu, wherever the scene now is.
    await expect.poll(() => focused(page)).toMatchObject({ control: 'scene-actions', scene: 'C' })

    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await moveAndSave(page, () => page.keyboard.press('Enter'), '“C” is now scene 1 of 3.')
    await expect.poll(() => sceneOrder(page)).toEqual(['C', 'A', 'B'])
    await expect.poll(() => focused(page)).toMatchObject({ control: 'scene-actions', scene: 'C' })

    // At the top, "Move up" is not offered: the move after Edit scene is "Move down".
    await page.keyboard.press('Enter')
    await expect(scene(page, 'C').getByTestId('scene-move-up')).toHaveCount(0)
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => focused(page)).toMatchObject({ control: 'scene-move-down', scene: 'C' })
    await moveAndSave(page, () => page.keyboard.press('Space'), '“C” is now scene 2 of 3.')
    await expect.poll(() => sceneOrder(page)).toEqual(['A', 'C', 'B'])

    await page.reload()
    await expect.poll(() => sceneOrder(page)).toEqual(['A', 'C', 'B'])
  })

  test('chapters and their scenes are rearranged from the keyboard alone', async ({ page }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Chapter Keys '))
    const storyId = await seedStory(page, universeId, 'Three chapters', [])
    const one = await seedChapter(page, universeId, storyId, 'One')
    const two = await seedChapter(page, universeId, storyId, 'Two')
    await seedChapter(page, universeId, storyId, 'Three')
    await seedScene(page, universeId, storyId, { title: 'a', chapter: one })
    await seedScene(page, universeId, storyId, { title: 'b', chapter: one })
    await seedScene(page, universeId, storyId, { title: 'c', chapter: two })

    await page.goto(`/app/universes/${universeId}/stories/${storyId}`)
    await expect
      .poll(() => structure(page))
      .toEqual(['Chapter 1: One | a | b', 'Chapter 2: Two | c', 'Chapter 3: Three'])

    // A chapter's menu is named with the chapter's heading.
    const menu = chapter(page, 'Three').getByRole('button', {
      name: 'More actions for Chapter 3: Three',
    })
    await menu.focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await expect
      .poll(() => focused(page))
      .toMatchObject({ control: 'chapter-move-up', chapter: 'Three' })

    await saveAndAnnounce(
      page,
      '/chapters/order',
      () => page.keyboard.press('Enter'),
      '“Three” is now chapter 2 of 3.',
    )
    await expect
      .poll(() => focused(page))
      .toMatchObject({ control: 'chapter-actions', chapter: 'Three' })

    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await saveAndAnnounce(
      page,
      '/chapters/order',
      () => page.keyboard.press('Enter'),
      '“Three” is now chapter 1 of 3.',
    )
    await expect
      .poll(() => focused(page))
      .toMatchObject({ control: 'chapter-actions', chapter: 'Three' })
    await page.keyboard.press('Enter')
    await expect(chapter(page, 'Three').getByTestId('chapter-move-up')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect
      .poll(() => focused(page))
      .toMatchObject({ control: 'chapter-actions', chapter: 'Three' })

    // Inside a chapter, a scene's move stays inside it.
    await scene(page, 'b').getByTestId('scene-actions').focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => focused(page)).toMatchObject({ control: 'scene-move-up', scene: 'b' })
    await moveAndSave(
      page,
      () => page.keyboard.press('Enter'),
      '“b” is now scene 1 of 2 in Chapter 2: One.',
    )
    await expect.poll(() => focused(page)).toMatchObject({ control: 'scene-actions', scene: 'b' })

    // Every other chapter is a "Move to" choice in the scene's menu. Escape puts the focus back on the menu, and a
    // choice moves the scene, the focus following it to its new chapter.
    const cMenu = scene(page, 'c').getByTestId('scene-actions')
    await cMenu.focus()
    await page.keyboard.press('Enter')
    const options = scene(page, 'c').getByTestId('scene-move-to-option')
    await expect(options).toHaveText([
      'Move to Unchaptered',
      'Move to Chapter 1: Three',
      'Move to Chapter 2: One',
    ])
    await page.keyboard.press('Escape')
    await expect(options).toHaveCount(0)
    await expect.poll(() => focused(page)).toMatchObject({ control: 'scene-actions', scene: 'c' })

    await page.keyboard.press('Enter')
    await page.keyboard.press('End')
    await page.keyboard.press('ArrowUp')
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.textContent))
      .toBe('Move to Chapter 2: One')
    await saveAndAnnounce(
      page,
      '/position',
      () => page.keyboard.press('Enter'),
      '“c” moved to Chapter 2: One, scene 3 of 3.',
    )
    await expect.poll(() => focused(page)).toMatchObject({ control: 'scene-actions', scene: 'c' })

    const moved = ['Chapter 1: Three', 'Chapter 2: One | b | a | c', 'Chapter 3: Two']
    await expect.poll(() => structure(page)).toEqual(moved)

    await page.reload()
    await expect.poll(() => structure(page)).toEqual(moved)
  })

  test('an entry thrown in the Trash stays on its scene, named but not linked', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Trash Reach '))
    const ids = await seedEntities(page, universeId, ['Arlen', 'White Tower'])
    const storyId = await seedStory(page, universeId, 'Held', [
      { title: 'The Council', pov: ids.Arlen, entities: [ids.Arlen, ids['White Tower']] },
    ])

    const trashed = await page.request.delete(`/api/universes/${universeId}/entities/${ids.Arlen}`)
    expect(trashed.status()).toBe(204)

    await page.goto(`/app/universes/${universeId}/stories/${storyId}`)
    const council = scene(page, 'The Council')

    await expect(council.getByTestId('scene-pov')).toContainText('Arlen')
    await expect(council.getByTestId('scene-pov').getByRole('link')).toHaveCount(0)
    await expect(
      council.getByTestId('scene-lore').getByTestId('lore-reference-trashed'),
    ).toHaveText(/Arlen.*\(in Trash\)/)
    await expect(
      council.getByTestId('scene-lore').getByRole('link', { name: 'White Tower' }),
    ).toBeVisible()

    // Saving the scene keeps what it holds.
    await chooseFromMenu(council, 'scene-edit')
    await page.getByTestId('scene-title-input').fill('The Council, again')
    await page.getByTestId('save-scene').click()
    await expect(page.getByTestId('scene-form')).toHaveCount(0)
    await expect(scene(page, 'The Council, again').getByTestId('scene-pov')).toContainText('Arlen')
  })

  test('the story screens stay usable from a phone to a wide desktop, light and dark', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Wide Reach '))
    const eras = await seedTheFall(page, universeId)
    const ids = await seedEntities(page, universeId, [
      'Arlen of the Long Northern Watch',
      'The White Tower at the Edge of the Known Sea',
      'Council of Nine',
      'East Gate',
      'Mira',
    ])
    const lore = Object.values(ids)
    const storyId = await seedStory(
      page,
      universeId,
      'A story whose title runs on for rather longer than any title reasonably should',
      [
        {
          title: 'The first scene, with a title long enough to wrap onto a second line somewhere',
          summary: 'A summary that also runs on, so the reading measure has something to hold.',
          pov: ids['Arlen of the Long Northern Watch'],
          entities: lore,
          chronology: { eraId: eras[1].id, year: 1200, month: 11, day: 30 },
        },
      ],
    )
    const long = await seedChapter(
      page,
      universeId,
      storyId,
      'A chapter whose title also runs on past where any sensible heading would stop',
      'Its summary runs on as well, long enough to wrap on a phone and hold a measure on a desktop.',
    )
    const short = await seedChapter(page, universeId, storyId, 'Ashes')
    await seedScene(page, universeId, storyId, {
      title: 'Second',
      entities: lore.slice(0, 2),
      chapter: long,
    })
    await seedScene(page, universeId, storyId, { title: 'Third', chapter: short })

    for (const [width, colorScheme] of [
      [390, 'dark'],
      [768, 'light'],
      [1440, 'dark'],
      [1920, 'light'],
    ] as const) {
      // Layout boxes come back in fractional pixels; a hair over the edge is rounding, not overflow.
      const edge = width + 1

      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width, height: 900 })

      // Where the sections fold away behind the toggle, Stories is still one of them.
      await page.goto(`/app/universes/${universeId}`)
      await expect(page.getByTestId('workspace-name')).toBeAttached()
      const toggle = page.getByTestId('workspace-nav-toggle')
      if (await toggle.isVisible()) await toggle.click()
      await page.getByTestId('workspace-stories').click()
      await page.waitForURL(/\/stories$/)
      await expect(page.getByTestId('story-row')).toHaveCount(1)
      expect(await scrollsSideways(page), `stories at ${width}px`).toBe(false)

      await page.goto(`/app/universes/${universeId}/stories/${storyId}`)
      await expect(page.getByTestId('scene')).toHaveCount(3)
      await expect(page.getByTestId('chapter')).toHaveCount(2)
      expect(await scrollsSideways(page), `story at ${width}px`).toBe(false)

      if (colorScheme === 'dark') {
        const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
        expect(ground, `dark ground at ${width}px`).toBe('rgb(21, 22, 23)')
      }

      // A scene shows Write and its menu, not a row of tools: the rest waits in the menu. Both, and every linked
      // entry, are on screen rather than pushed off its edge.
      const first = page.getByTestId('scene').first()
      await expect(first.getByTestId('scene-delete')).toHaveCount(0)
      await expect(first.getByTestId('scene-edit')).toHaveCount(0)
      for (const control of ['scene-write', 'scene-actions']) {
        const box = await first.getByTestId(control).boundingBox()
        expect(box, `${control} at ${width}px`).not.toBeNull()
        expect(box!.x + box!.width, `${control} at ${width}px`).toBeLessThanOrEqual(edge)
      }
      for (const chip of await first.getByTestId('lore-reference').all()) {
        const box = await chip.boundingBox()
        expect(box!.x + box!.width, `lore chip at ${width}px`).toBeLessThanOrEqual(edge)
      }

      // A chapter's heading, Add scene and its menu fit too.
      const heading = page.getByTestId('chapter').first()
      for (const control of ['chapter-heading', 'chapter-new-scene', 'chapter-actions']) {
        const box = await heading.getByTestId(control).boundingBox()
        expect(box, `${control} at ${width}px`).not.toBeNull()
        expect(box!.x + box!.width, `${control} at ${width}px`).toBeLessThanOrEqual(edge)
      }

      // A scene's menu, with its "Move to" choices, opens inside the screen.
      const second = scene(page, 'Second')
      await openMenuFor(second, 'scene-move-to-option')
      const panel = second.locator('.actionmenu__panel')
      await expect(panel).toBeVisible()
      const panelBox = await panel.boundingBox()
      expect(panelBox!.x, `move menu at ${width}px`).toBeGreaterThanOrEqual(-1)
      expect(panelBox!.x + panelBox!.width, `move menu at ${width}px`).toBeLessThanOrEqual(edge)
      expect(await scrollsSideways(page), `move menu at ${width}px`).toBe(false)
      await page.keyboard.press('Escape')
      await expect(panel).toHaveCount(0)

      // The drawers keep a form's measure on a wide screen and fold their rows on a narrow one.
      await chooseFromMenu(first, 'scene-edit')
      const form = page.getByTestId('scene-form')
      await expect(form).toBeVisible()
      const formBox = await form.boundingBox()
      expect(formBox!.width, `scene form at ${width}px`).toBeLessThanOrEqual(
        Math.min(width, 560) + 1,
      )

      // Polled: the drawer slides in, and a box read mid-slide sits off to the right of where it lands.
      const chapterSelect = page.getByTestId('scene-chapter-select')
      await expect
        .poll(
          async () => {
            const box = await chapterSelect.boundingBox()
            return box ? box.x + box.width : Number.POSITIVE_INFINITY
          },
          { message: `chapter select at ${width}px` },
        )
        .toBeLessThanOrEqual(edge)

      const era = page.getByTestId('scene-eraId')
      await era.scrollIntoViewIfNeeded()
      const eraBox = await era.boundingBox()
      expect(eraBox!.x + eraBox!.width, `era select at ${width}px`).toBeLessThanOrEqual(edge)

      const picker = page.getByTestId('scene-lore-field').getByTestId('participant-input')
      await picker.scrollIntoViewIfNeeded()
      await expect(picker).toBeVisible()
      expect(await scrollsSideways(page), `scene form at ${width}px`).toBe(false)

      await page.getByTestId('cancel-scene').click()
      await expect(form).toHaveCount(0)

      await chooseFromMenu(heading, 'chapter-edit')
      const chapterForm = page.getByTestId('chapter-form')
      await expect(chapterForm).toBeVisible()
      const chapterFormBox = await chapterForm.boundingBox()
      expect(chapterFormBox!.width, `chapter form at ${width}px`).toBeLessThanOrEqual(
        Math.min(width, 560) + 1,
      )
      expect(await scrollsSideways(page), `chapter form at ${width}px`).toBe(false)
      await page.getByTestId('cancel-chapter').click()
      await expect(chapterForm).toHaveCount(0)
    }
  })
})
