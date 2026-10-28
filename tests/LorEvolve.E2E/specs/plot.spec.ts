import { expect, test, type Page } from '@playwright/test'
import { chooseFromMenu, openMenuFor } from './support/rowMenu'
import { acceptConfirm, confirmDialog } from './support/confirm'

/**
 * A story's plot, end to end: arcs, the beats in each, and what they point at. Each test registers its own account
 * and builds its own universe, so nothing depends on data another test left behind.
 *
 * The invariants under test throughout: arcs and beats keep the order their author sets, which is neither the order
 * scenes are told in nor their chapters; a beat's scenes and lore are references, so a scene moved to another chapter
 * is still the beat's scene, and deleting a beat or an arc deletes no scene and no lore.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('planner')
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
  // The starter lore types this spec builds on: a new universe starts empty otherwise.
  await page.getByTestId('universe-starter-types').check()
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
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

async function seedStory(page: Page, universeId: string, title: string) {
  const story = await page.request.post(`/api/universes/${universeId}/stories`, {
    data: { title, premise: null, status: 0 },
  })
  expect(story.status()).toBe(201)
  return (await story.json()).id as string
}

async function seedChapter(page: Page, universeId: string, storyId: string, title: string) {
  const created = await page.request.post(
    `/api/universes/${universeId}/stories/${storyId}/chapters`,
    { data: { title, summary: null, notes: null } },
  )
  expect(created.status()).toBe(201)
  return (await created.json()).id as string
}

async function seedScene(
  page: Page,
  universeId: string,
  storyId: string,
  title: string,
  chapterId: string | null = null,
) {
  const created = await page.request.post(
    `/api/universes/${universeId}/stories/${storyId}/scenes`,
    {
      data: {
        title,
        summary: null,
        notes: null,
        povEntityId: null,
        chronology: null,
        entityIds: [],
        chapterId,
      },
    },
  )
  expect(created.status()).toBe(201)
  return (await created.json()).id as string
}

async function seedArc(
  page: Page,
  universeId: string,
  storyId: string,
  title: string,
  description: string | null = null,
) {
  const created = await page.request.post(
    `/api/universes/${universeId}/stories/${storyId}/plot-arcs`,
    { data: { title, description, notes: null } },
  )
  expect(created.status()).toBe(201)
  return (await created.json()).id as string
}

async function seedBeat(
  page: Page,
  universeId: string,
  storyId: string,
  arcId: string,
  title: string,
  sceneIds: string[] = [],
  entityIds: string[] = [],
) {
  const created = await page.request.post(
    `/api/universes/${universeId}/stories/${storyId}/plot-arcs/${arcId}/beats`,
    { data: { title, description: null, notes: null, sceneIds, entityIds } },
  )
  expect(created.status()).toBe(201)
  return (await created.json()).id as string
}

function arc(page: Page, title: string) {
  return page.locator(`[data-testid="plot-arc"][data-title="${title}"]`)
}

function beat(page: Page, title: string) {
  return page.locator(`[data-testid="plot-beat"][data-title="${title}"]`)
}

function scene(page: Page, title: string) {
  return page.locator(`[data-testid="scene"][data-title="${title}"]`)
}

function beatScene(page: Page, beatTitle: string, sceneTitle: string) {
  return beat(page, beatTitle).locator(
    `[data-testid="plot-beat-scene"][data-title="${sceneTitle}"]`,
  )
}

/** Writes one arc through the drawer. */
async function addArc(page: Page, title: string, description?: string) {
  await page.getByTestId('new-plot-arc').click()
  const form = page.getByTestId('plot-arc-form')
  await expect(form).toBeVisible()

  await page.getByTestId('plot-arc-title-input').fill(title)
  if (description) await page.getByTestId('plot-arc-description-input').fill(description)

  await page.getByTestId('save-plot-arc').click()
  await expect(form).toHaveCount(0)
  await expect(arc(page, title)).toBeVisible()
}

interface BeatInput {
  title: string
  description?: string
  scenes?: string[]
  lore?: string[]
}

/** Writes one beat through the drawer, from its arc's own "Add beat", choosing scenes and lore the way an author would. */
async function addBeat(page: Page, arcTitle: string, input: BeatInput) {
  await arc(page, arcTitle).getByTestId('plot-arc-new-beat').click()
  const form = page.getByTestId('plot-beat-form')
  await expect(form).toBeVisible()

  await page.getByTestId('plot-beat-title-input').fill(input.title)
  if (input.description) {
    await page.getByTestId('plot-beat-description-input').fill(input.description)
  }

  const picker = page.getByTestId('scene-picker')
  for (const title of input.scenes ?? []) {
    await picker.getByTestId('scene-picker-filter').fill(title)
    await picker.locator(`[data-testid="scene-picker-option"][data-title="${title}"]`).check()
  }
  if (input.scenes?.length) await picker.getByTestId('scene-picker-filter').fill('')

  for (const name of input.lore ?? []) {
    const lore = page.getByTestId('plot-beat-lore-field')
    await lore.getByTestId('participant-input').fill(name)
    await lore.getByTestId(`participant-option-${name}`).click()
  }

  await page.getByTestId('save-plot-beat').click()
  await expect(form).toHaveCount(0)
  await expect(beat(page, input.title)).toBeVisible()
}

/** The plot as the page draws it, one line per arc: "Arc 1: Fall of the King | a | b". */
function plotStructure(page: Page) {
  return page
    .getByTestId('plot')
    .evaluate((root) =>
      [...root.querySelectorAll('[data-testid="plot-arc"]')].map((group) =>
        [
          group.querySelector('[data-testid="plot-arc-heading"]')?.textContent ?? '',
          ...[...group.querySelectorAll('[data-testid="plot-beat"]')].map(
            (node) => node.getAttribute('data-title') ?? '',
          ),
        ].join(' | '),
      ),
    )
}

/** The titles of the scenes one beat links, in the order it lists them. */
function beatScenes(page: Page, beatTitle: string) {
  return beat(page, beatTitle)
    .getByTestId('plot-beat-scene')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-title') ?? ''))
}

/** The scene titles, top to bottom, as the Scenes view lists them. */
function sceneOrder(page: Page) {
  return page
    .getByTestId('scene')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-title') ?? ''))
}

/**
 * Uses a control and waits for its write to be saved, not only redrawn. The page announces the result once the
 * save has landed, which is also when it will take the next move.
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

/** What the element holding the focus is, and which arc and beat it belongs to. */
function focused(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement
    return {
      control: element?.getAttribute('data-testid') ?? null,
      arc: element?.closest('[data-testid="plot-arc"]')?.getAttribute('data-title') ?? null,
      beat: element?.closest('[data-testid="plot-beat"]')?.getAttribute('data-title') ?? null,
    }
  })
}

/** Whether the page can be scrolled sideways, which no screen in LorEvolve may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

test.describe('plot', () => {
  test('an author plans arcs of beats across chapters, and moving or deleting keeps every scene and entry', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Plot Reach '))
    const lore = await seedEntities(page, universeId, ['Arlen', 'White Tower'])
    const storyId = await seedStory(page, universeId, 'The Fall of Varn')
    const ashes = await seedChapter(page, universeId, storyId, 'Ashes')
    const arrival = await seedChapter(page, universeId, storyId, 'Arrival')
    await seedScene(page, universeId, storyId, 'The Council', ashes)
    await seedScene(page, universeId, storyId, 'The Siege', arrival)
    await seedScene(page, universeId, storyId, 'Escape')

    const storyUrl = `/app/universes/${universeId}/stories/${storyId}`

    // The plot is a view of the story, reached from the story itself, and it starts empty.
    await page.goto(storyUrl)
    await page.getByTestId('story-view-plot').click()
    await page.waitForURL(/\/plot$/)
    await expect(page.getByTestId('story-view-plot')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('story-title')).toHaveText('The Fall of Varn')
    await expect(page.getByTestId('plot-empty')).toContainText('No arcs yet.')

    // Two arcs, numbered by where they sit.
    await addArc(page, 'Fall of the King', 'The throne is lost.')
    await addArc(page, "Mira's Betrayal")
    await expect(arc(page, 'Fall of the King').getByTestId('plot-arc-description')).toHaveText(
      'The throne is lost.',
    )
    await expect(arc(page, "Mira's Betrayal").getByTestId('plot-arc-empty')).toHaveText(
      'No beats yet.',
    )
    await expect
      .poll(() => plotStructure(page))
      .toEqual(['Arc 1: Fall of the King', "Arc 2: Mira's Betrayal"])

    // The arcs swap places and renumber themselves.
    await saveAndAnnounce(
      page,
      '/plot-arcs/order',
      () => chooseFromMenu(arc(page, "Mira's Betrayal"), 'plot-arc-move-up'),
      "“Mira's Betrayal” is now arc 1 of 2.",
    )
    await expect
      .poll(() => plotStructure(page))
      .toEqual(["Arc 1: Mira's Betrayal", 'Arc 2: Fall of the King'])

    // Beats, one linked to scenes in two different chapters and to two entries.
    await addBeat(page, 'Fall of the King', { title: 'Capital is breached' })
    await addBeat(page, 'Fall of the King', {
      title: 'Learns of the conspiracy',
      scenes: ['The Siege', 'The Council'],
      lore: ['Arlen', 'White Tower'],
    })
    await addBeat(page, 'Fall of the King', { title: 'Accepts exile' })
    await addBeat(page, "Mira's Betrayal", {
      title: 'Reveals the gate route',
      scenes: ['The Siege'],
    })

    // A beat moves up inside its arc, and only there.
    await saveAndAnnounce(
      page,
      '/beats/order',
      () => chooseFromMenu(beat(page, 'Learns of the conspiracy'), 'plot-beat-move-up'),
      '“Learns of the conspiracy” is now beat 1 of 3 in Arc 2: Fall of the King.',
    )

    const planned = [
      "Arc 1: Mira's Betrayal | Reveals the gate route",
      'Arc 2: Fall of the King | Learns of the conspiracy | Capital is breached | Accepts exile',
    ]
    await expect.poll(() => plotStructure(page)).toEqual(planned)

    // Its scenes read in the story's order, each with its chapter; its lore links to the entries.
    await expect
      .poll(() => beatScenes(page, 'Learns of the conspiracy'))
      .toEqual(['The Council', 'The Siege'])
    await expect(beatScene(page, 'Learns of the conspiracy', 'The Council')).toContainText(
      'Chapter 1',
    )
    await expect(beatScene(page, 'Learns of the conspiracy', 'The Siege')).toContainText(
      'Chapter 2',
    )
    const learnsLore = beat(page, 'Learns of the conspiracy').getByTestId('plot-beat-lore')
    await expect(learnsLore.getByRole('link', { name: 'Arlen' })).toBeVisible()
    await expect(learnsLore.getByRole('link', { name: 'White Tower' })).toBeVisible()

    await page.reload()
    await expect.poll(() => plotStructure(page)).toEqual(planned)
    await expect
      .poll(() => beatScenes(page, 'Learns of the conspiracy'))
      .toEqual(['The Council', 'The Siege'])

    // On the Scenes view a scene shows the beats that point at it, read from the beats.
    await page.getByTestId('story-view-scenes').click()
    await page.waitForURL(new RegExp(`/stories/${storyId}$`))
    await expect(
      scene(page, 'The Siege').getByRole('link', {
        name: 'Fall of the King: Learns of the conspiracy',
      }),
    ).toBeVisible()
    await expect(
      scene(page, 'The Siege').getByRole('link', {
        name: "Mira's Betrayal: Reveals the gate route",
      }),
    ).toBeVisible()
    await expect(scene(page, 'Escape').getByTestId('scene-plot')).toHaveCount(0)

    // The Council moves to another chapter. It is the same scene, so the beat still names it.
    await saveAndAnnounce(
      page,
      '/position',
      async () => {
        await openMenuFor(scene(page, 'The Council'), 'scene-move-to-option')
        await scene(page, 'The Council')
          .locator('[data-testid="scene-move-to-option"][data-target="Chapter 2: Arrival"]')
          .click()
      },
      '“The Council” moved to Chapter 2: Arrival, scene 2 of 2.',
    )

    await page.getByTestId('story-view-plot').click()
    await page.waitForURL(/\/plot$/)
    await expect(beatScene(page, 'Learns of the conspiracy', 'The Council')).toContainText(
      'Chapter 2',
    )
    await page.reload()
    await expect
      .poll(() => beatScenes(page, 'Learns of the conspiracy'))
      .toEqual(['The Siege', 'The Council'])
    await expect.poll(() => plotStructure(page)).toEqual(planned)

    // A beat's scene opens that scene on the Scenes view, and the scene's beat leads back.
    await beatScene(page, 'Learns of the conspiracy', 'The Council').click()
    await page.waitForURL(new RegExp(`/stories/${storyId}#scene-[0-9a-f-]+$`))
    await expect(scene(page, 'The Council')).toBeInViewport()

    await scene(page, 'The Council')
      .getByRole('link', { name: 'Fall of the King: Learns of the conspiracy' })
      .click()
    await page.waitForURL(/\/plot#beat-[0-9a-f-]+$/)
    await expect(beat(page, 'Learns of the conspiracy')).toBeInViewport()

    // A beat's lore opens the entry itself.
    await learnsLore.getByRole('link', { name: 'White Tower' }).click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await expect(page.getByText('White Tower').first()).toBeVisible()

    // Deleting a beat says what stays, and takes nothing else.
    await page.goto(`${storyUrl}/plot`)
    await chooseFromMenu(beat(page, 'Learns of the conspiracy'), 'plot-beat-delete')
    await acceptConfirm(page, 'Its linked scenes and lore stay.')
    await expect
      .poll(() => plotStructure(page))
      .toEqual([
        "Arc 1: Mira's Betrayal | Reveals the gate route",
        'Arc 2: Fall of the King | Capital is breached | Accepts exile',
      ])

    for (const id of Object.values(lore)) {
      expect((await page.request.get(`/api/universes/${universeId}/entities/${id}`)).status()).toBe(
        200,
      )
    }

    await page.getByTestId('story-view-scenes').click()
    await expect.poll(() => sceneOrder(page)).toEqual(['Escape', 'The Siege', 'The Council'])
    await expect(scene(page, 'The Council').getByTestId('scene-plot')).toHaveCount(0)

    // Deleting an arc says it takes its beats and no scene, chapter or lore - and does exactly that.
    await page.getByTestId('story-view-plot').click()
    await chooseFromMenu(arc(page, "Mira's Betrayal"), 'plot-arc-delete')
    await expect(confirmDialog(page)).toContainText('Its 1 beat will go with it.')
    await expect(confirmDialog(page)).toContainText('No scene, chapter or lore is deleted.')
    await acceptConfirm(page, 'restore the arc from the Trash')
    await expect
      .poll(() => plotStructure(page))
      .toEqual(['Arc 1: Fall of the King | Capital is breached | Accepts exile'])

    await page.reload()
    await expect
      .poll(() => plotStructure(page))
      .toEqual(['Arc 1: Fall of the King | Capital is breached | Accepts exile'])

    await page.getByTestId('story-view-scenes').click()
    await expect.poll(() => sceneOrder(page)).toEqual(['Escape', 'The Siege', 'The Council'])
    await expect(page.getByTestId('chapter')).toHaveCount(2)
    await expect(page.getByTestId('scene-plot')).toHaveCount(0)
  })

  test('an empty plot and an arc with no beats say so, and a beat needs no scene', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Empty Plot '))
    const storyId = await seedStory(page, universeId, 'Not yet written')

    await page.goto(`/app/universes/${universeId}/stories/${storyId}/plot`)
    await expect(page.getByTestId('plot-empty')).toContainText('No arcs yet.')

    await page.getByTestId('plot-empty').getByTestId('new-plot-arc').click()
    await page.getByTestId('plot-arc-title-input').fill('Search for the Crown')
    await page.getByTestId('save-plot-arc').click()
    await expect(page.getByTestId('plot-arc-form')).toHaveCount(0)

    await expect(page.getByTestId('plot-empty')).toHaveCount(0)
    await expect(arc(page, 'Search for the Crown').getByTestId('plot-arc-heading')).toHaveText(
      'Arc 1: Search for the Crown',
    )
    await expect(arc(page, 'Search for the Crown').getByTestId('plot-arc-empty')).toHaveText(
      'No beats yet.',
    )

    // A story with no scenes yet still takes a beat: planned work, not placed.
    await arc(page, 'Search for the Crown').getByTestId('plot-arc-new-beat').click()
    await expect(page.getByTestId('scene-picker')).toContainText('This story has no scenes yet.')
    await page.getByTestId('plot-beat-title-input').fill('Hears the rumour')
    await page.getByTestId('save-plot-beat').click()
    await expect(page.getByTestId('plot-beat-form')).toHaveCount(0)

    await expect(arc(page, 'Search for the Crown').getByTestId('plot-arc-empty')).toHaveCount(0)
    await expect(beat(page, 'Hears the rumour').getByTestId('plot-beat-scenes')).toHaveCount(0)

    // The Scenes view is untouched by a plot.
    await page.getByTestId('story-view-scenes').click()
    await expect(page.getByTestId('scenes-empty')).toBeVisible()
  })

  test('arcs and beats are reordered from the keyboard alone, and the focus follows them', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Plot Keys '))
    const storyId = await seedStory(page, universeId, 'Three threads')
    const a = await seedArc(page, universeId, storyId, 'A')
    await seedArc(page, universeId, storyId, 'B')
    await seedArc(page, universeId, storyId, 'C')
    await seedBeat(page, universeId, storyId, a, 'a1')
    await seedBeat(page, universeId, storyId, a, 'a2')
    await seedBeat(page, universeId, storyId, a, 'a3')

    await page.goto(`/app/universes/${universeId}/stories/${storyId}/plot`)
    await expect
      .poll(() => plotStructure(page))
      .toEqual(['Arc 1: A | a1 | a2 | a3', 'Arc 2: B', 'Arc 3: C'])

    // An arc's menu is named with the arc's heading; its moves are in it, after Edit arc.
    await arc(page, 'C').getByRole('button', { name: 'More actions for Arc 3: C' }).focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => focused(page)).toMatchObject({ control: 'plot-arc-move-up', arc: 'C' })

    await saveAndAnnounce(
      page,
      '/plot-arcs/order',
      () => page.keyboard.press('Enter'),
      '“C” is now arc 2 of 3.',
    )
    // The focus follows the arc, back on its menu.
    await expect.poll(() => focused(page)).toMatchObject({ control: 'plot-arc-actions', arc: 'C' })

    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await saveAndAnnounce(
      page,
      '/plot-arcs/order',
      () => page.keyboard.press('Enter'),
      '“C” is now arc 1 of 3.',
    )
    await expect.poll(() => focused(page)).toMatchObject({ control: 'plot-arc-actions', arc: 'C' })

    // At the top, "Move up" is not offered.
    await page.keyboard.press('Enter')
    await expect(arc(page, 'C').getByTestId('plot-arc-move-up')).toHaveCount(0)
    await expect(arc(page, 'C').getByTestId('plot-arc-move-down')).toBeVisible()
    await page.keyboard.press('Escape')

    // A beat's move stays inside its arc; its menu is named with the beat.
    await beat(page, 'a3').getByRole('button', { name: 'More actions for a3' }).focus()
    await page.keyboard.press('Enter')
    await expect
      .poll(() => focused(page))
      .toMatchObject({ control: 'plot-beat-move-up', beat: 'a3' })

    await saveAndAnnounce(
      page,
      '/beats/order',
      () => page.keyboard.press('Enter'),
      '“a3” is now beat 2 of 3 in Arc 2: A.',
    )
    await expect
      .poll(() => focused(page))
      .toMatchObject({ control: 'plot-beat-actions', beat: 'a3' })

    await page.keyboard.press('Space')
    await expect
      .poll(() => focused(page))
      .toMatchObject({ control: 'plot-beat-move-up', beat: 'a3' })
    await saveAndAnnounce(
      page,
      '/beats/order',
      () => page.keyboard.press('Space'),
      '“a3” is now beat 1 of 3 in Arc 2: A.',
    )
    await page.keyboard.press('Enter')
    await expect(beat(page, 'a3').getByTestId('plot-beat-move-up')).toHaveCount(0)
    await expect
      .poll(() => focused(page))
      .toMatchObject({ control: 'plot-beat-move-down', beat: 'a3' })
    await page.keyboard.press('Escape')

    // C went to the top past A, so A is second now, and B last; only A's beats moved inside it.
    const moved = ['Arc 1: C', 'Arc 2: A | a3 | a1 | a2', 'Arc 3: B']
    await expect.poll(() => plotStructure(page)).toEqual(moved)

    await page.reload()
    await expect.poll(() => plotStructure(page)).toEqual(moved)
  })

  test('the plot stays usable from a phone to a wide desktop, light and dark', async ({ page }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Wide Plot '))
    const ids = await seedEntities(page, universeId, [
      'Arlen of the Long Northern Watch',
      'The White Tower at the Edge of the Known Sea',
      'Council of Nine',
    ])
    const storyId = await seedStory(
      page,
      universeId,
      'A story whose title runs on for rather longer than any title reasonably should',
    )
    const chapter = await seedChapter(
      page,
      universeId,
      storyId,
      'A chapter whose title also runs on past where any sensible heading would stop',
    )
    const scenes = [
      await seedScene(
        page,
        universeId,
        storyId,
        'The first scene, with a title long enough to wrap onto a second line somewhere',
        chapter,
      ),
      await seedScene(page, universeId, storyId, 'Second', chapter),
      await seedScene(
        page,
        universeId,
        storyId,
        'An Unchaptered scene with a long title of its own',
      ),
    ]

    const long = await seedArc(
      page,
      universeId,
      storyId,
      'An arc whose title runs on past where any sensible heading would stop, and then some',
      'Its description runs on as well, long enough to wrap on a phone and hold a measure on a desktop.',
    )
    await seedArc(page, universeId, storyId, 'Short')
    await seedBeat(
      page,
      universeId,
      storyId,
      long,
      'A beat whose title is long enough to wrap onto a second line on any narrow screen at all',
      scenes,
      Object.values(ids),
    )
    await seedBeat(page, universeId, storyId, long, 'Second beat', scenes.slice(1))

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

      await page.goto(`/app/universes/${universeId}/stories/${storyId}/plot`)
      await expect(page.getByTestId('plot-arc')).toHaveCount(2)
      await expect(page.getByTestId('plot-beat')).toHaveCount(2)
      expect(await scrollsSideways(page), `plot at ${width}px`).toBe(false)

      if (colorScheme === 'dark') {
        const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
        expect(ground, `dark ground at ${width}px`).toBe('rgb(21, 22, 23)')
      }

      // The view links, an arc's heading and tools, a beat's tools and every chip it holds are on screen.
      for (const control of ['story-view-scenes', 'story-view-plot']) {
        const box = await page.getByTestId(control).boundingBox()
        expect(box!.x + box!.width, `${control} at ${width}px`).toBeLessThanOrEqual(edge)
      }

      const first = page.getByTestId('plot-arc').first()
      // An arc shows Add beat and its menu; Edit, moves and Delete wait inside it.
      await expect(first.getByTestId('plot-arc-delete')).toHaveCount(0)
      for (const control of ['plot-arc-heading', 'plot-arc-new-beat', 'plot-arc-actions']) {
        const box = await first.getByTestId(control).boundingBox()
        expect(box, `${control} at ${width}px`).not.toBeNull()
        expect(box!.x + box!.width, `${control} at ${width}px`).toBeLessThanOrEqual(edge)
      }

      const firstBeat = page.getByTestId('plot-beat').first()
      await expect(firstBeat.getByTestId('plot-beat-delete')).toHaveCount(0)
      for (const control of ['plot-beat-edit', 'plot-beat-actions']) {
        const box = await firstBeat.getByTestId(control).boundingBox()
        expect(box, `${control} at ${width}px`).not.toBeNull()
        expect(box!.x + box!.width, `${control} at ${width}px`).toBeLessThanOrEqual(edge)
      }

      for (const chip of [
        ...(await firstBeat.getByTestId('plot-beat-scene').all()),
        ...(await firstBeat.getByTestId('lore-reference').all()),
      ]) {
        const box = await chip.boundingBox()
        expect(box!.x + box!.width, `plot chip at ${width}px`).toBeLessThanOrEqual(edge)
      }

      // The beat drawer keeps a form's measure on a wide screen, and its scene list stays inside it.
      await firstBeat.getByTestId('plot-beat-edit').click()
      const form = page.getByTestId('plot-beat-form')
      await expect(form).toBeVisible()
      const formBox = await form.boundingBox()
      expect(formBox!.width, `beat form at ${width}px`).toBeLessThanOrEqual(
        Math.min(width, 560) + 1,
      )

      const option = page.getByTestId('scene-picker-option').first()
      await option.scrollIntoViewIfNeeded()
      await expect(option).toBeVisible()
      await expect(page.getByTestId('scene-picker-option').first()).toBeChecked()

      // Polled: the drawer slides in, and a box read mid-slide sits off to the right of where it lands.
      const filter = page.getByTestId('scene-picker-filter')
      await expect
        .poll(
          async () => {
            const box = await filter.boundingBox()
            return box ? box.x + box.width : Number.POSITIVE_INFINITY
          },
          { message: `scene filter at ${width}px` },
        )
        .toBeLessThanOrEqual(edge)
      expect(await scrollsSideways(page), `beat form at ${width}px`).toBe(false)

      await page.getByTestId('cancel-plot-beat').click()
      await expect(form).toHaveCount(0)

      // On the Scenes view, a scene's beat chips wrap inside the screen too.
      await page.getByTestId('story-view-scenes').click()
      await expect(page.getByTestId('scene')).toHaveCount(3)
      expect(await scrollsSideways(page), `scenes at ${width}px`).toBe(false)
      for (const chip of await page.getByTestId('scene-plot-beat').all()) {
        const box = await chip.boundingBox()
        expect(box!.x + box!.width, `scene plot chip at ${width}px`).toBeLessThanOrEqual(edge)
      }
    }
  })
})
