import { expect, test, type Page } from '@playwright/test'
import { chooseFromMenu, openMenuFor } from './support/rowMenu'
import { acceptConfirm, confirmDialog, dismissConfirm } from './support/confirm'

/**
 * A story's manuscript, end to end: the prose an author writes, scene by scene, on the story's Manuscript view. Each
 * test registers its own account and builds its own universe, so nothing depends on data another test left behind.
 *
 * The invariants under test throughout: prose comes back exactly as typed; it belongs to its scene, so moving,
 * reordering or un-chaptering the scene keeps it and deleting the scene takes it; nothing unsaved is left behind without
 * asking; a failed or stale save never replaces what the author has on screen; and a scene outside the story is never
 * read.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('writer')
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

async function seedEntity(page: Page, universeId: string, name: string) {
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string }[]

  const created = await page.request.post(`/api/universes/${universeId}/entities`, {
    data: {
      entityTypeId: types.find((type) => type.name === 'Character')!.id,
      name,
      summary: null,
      canonStatus: 0,
      aliases: [],
      tags: [],
      fields: [],
    },
  })
  expect(created.status()).toBe(201)
  return (await created.json()).id as string
}

async function seedStory(page: Page, universeId: string, title: string) {
  const story = await page.request.post(`/api/universes/${universeId}/stories`, {
    data: { title, premise: null, status: 1 },
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
  povEntityId: string | null = null,
) {
  const created = await page.request.post(
    `/api/universes/${universeId}/stories/${storyId}/scenes`,
    {
      data: {
        title,
        summary: null,
        notes: null,
        povEntityId,
        chronology: null,
        entityIds: [],
        chapterId,
      },
    },
  )
  expect(created.status()).toBe(201)
  return (await created.json()).id as string
}

async function seedArc(page: Page, universeId: string, storyId: string, title: string) {
  const created = await page.request.post(
    `/api/universes/${universeId}/stories/${storyId}/plot-arcs`,
    { data: { title, description: null, notes: null } },
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
  sceneIds: string[],
) {
  const created = await page.request.post(
    `/api/universes/${universeId}/stories/${storyId}/plot-arcs/${arcId}/beats`,
    { data: { title, description: null, notes: null, sceneIds, entityIds: [] } },
  )
  expect(created.status()).toBe(201)
}

function manuscriptPath(universeId: string, storyId: string, sceneId: string) {
  return `/api/universes/${universeId}/stories/${storyId}/scenes/${sceneId}/manuscript`
}

/** The scene's prose as the API holds it, read straight from its own route. */
async function readManuscript(page: Page, universeId: string, storyId: string, sceneId: string) {
  const response = await page.request.get(manuscriptPath(universeId, storyId, sceneId))
  expect(response.status()).toBe(200)
  return (await response.json()) as { content: string; updatedAt: string | null; version: number }
}

/** Saves prose straight through the API, as another window or device would, over whatever is stored now. */
async function writeManuscript(
  page: Page,
  universeId: string,
  storyId: string,
  sceneId: string,
  content: string,
) {
  const current = await readManuscript(page, universeId, storyId, sceneId)
  const saved = await page.request.put(manuscriptPath(universeId, storyId, sceneId), {
    data: { content, expectedVersion: current.version },
  })
  expect(saved.status()).toBe(200)
}

function outlineScene(page: Page, title: string) {
  return page.locator(`[data-testid="manuscript-outline-scene"][data-title="${title}"]`)
}

function scene(page: Page, title: string) {
  return page.locator(`[data-testid="scene"][data-title="${title}"]`)
}

function chapter(page: Page, title: string) {
  return page.locator(`[data-testid="chapter"][data-title="${title}"]`)
}

/** The outline as the page draws it, one line per group: "Chapter 1: Arrival | The Gates | The Council". */
function outline(page: Page) {
  return page
    .getByTestId('manuscript-outline-list')
    .evaluate((root) =>
      [...root.querySelectorAll('[data-testid="manuscript-outline-group"]')].map((group) =>
        [
          group.querySelector('[data-testid="manuscript-outline-heading"]')?.textContent ?? '',
          ...[...group.querySelectorAll('[data-testid="manuscript-outline-scene"]')].map(
            (node) => node.getAttribute('data-title') ?? '',
          ),
        ].join(' | '),
      ),
    )
}

/** Saves through the page and waits until the API has confirmed it and the page says so - not only for the press. */
async function saveWith(page: Page, action: () => Promise<void>) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/manuscript') &&
        response.request().method() === 'PUT' &&
        response.ok(),
    ),
    action(),
  ])
  await expect(page.getByTestId('manuscript-status')).toHaveText('Saved')
}

/** Uses a Scenes view control and waits for its write to be saved, not only redrawn. */
async function structural(page: Page, route: string, action: () => Promise<void>) {
  await Promise.all([
    page.waitForResponse(
      (response) => response.url().endsWith(route) && response.request().method() === 'PUT',
    ),
    action(),
  ])
}

/** Whether the page can be scrolled sideways, which no screen in LorEvolve may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

test.describe('manuscript', () => {
  test('an author writes prose scene by scene, and it survives reloads, moves, reorders, a chapter delete and goes with its scene', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Manuscript Reach '))
    const storyId = await seedStory(page, universeId, 'The Fall of Varn')
    const arrival = await seedChapter(page, universeId, storyId, 'Arrival')
    const ashes = await seedChapter(page, universeId, storyId, 'Ashes')
    const prologue = await seedScene(page, universeId, storyId, 'Prologue')
    const gates = await seedScene(page, universeId, storyId, 'The Gates', arrival)
    const council = await seedScene(page, universeId, storyId, 'The Council', arrival)
    await seedScene(page, universeId, storyId, 'The Breach', ashes)

    const storyUrl = `/app/universes/${universeId}/stories/${storyId}`
    const editor = page.getByTestId('manuscript-editor')
    const status = page.getByTestId('manuscript-status')
    const save = page.getByTestId('manuscript-save')
    const where = page.getByTestId('manuscript-where')

    // The manuscript is a view of the story. With no scene named, the first scene the story is read in opens.
    await page.goto(storyUrl)
    await page.getByTestId('story-view-manuscript').click()
    await page.waitForURL(new RegExp(`/manuscript/${prologue}$`))
    await expect(page.getByTestId('story-view-manuscript')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('story-title')).toHaveText('The Fall of Varn')

    // The outline is the story's structure: Unchaptered first, then each chapter in order.
    await expect
      .poll(() => outline(page))
      .toEqual([
        'Unchaptered | Prologue',
        'Chapter 1: Arrival | The Gates | The Council',
        'Chapter 2: Ashes | The Breach',
      ])
    await expect(outlineScene(page, 'Prologue')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('manuscript-scene-title')).toHaveText('Prologue')
    await expect(editor).toHaveValue('')
    await expect(status).toHaveText('Nothing saved yet')
    await expect(save).toBeDisabled()

    // A scene in a chapter, written in paragraphs with blank lines, curly quotes and trailing spaces.
    await outlineScene(page, 'The Council').click()
    await page.waitForURL(new RegExp(`/manuscript/${council}$`))
    await expect(outlineScene(page, 'The Council')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('manuscript-scene-title')).toHaveText('The Council')
    await expect(where).toHaveText('Chapter 1: Arrival · Scene 2 of 2')

    const councilProse =
      'The hall had emptied long before Arlen understood\nwhy Mira would not meet his eyes…\n\n\n“You knew,” he said.   \n\t‘Say it.’\n'
    await editor.fill(councilProse)
    await expect(status).toHaveText('Unsaved changes')
    await saveWith(page, () => save.click())
    await expect(save).toBeDisabled()

    // Exactly the same after a reload, on screen and in the API.
    await page.reload()
    await expect(editor).toHaveValue(councilProse)
    await expect(status).toHaveText('Saved')
    expect((await readManuscript(page, universeId, storyId, council)).content).toBe(councilProse)

    // Another scene opens empty - never showing the last one's prose - and saves from the keyboard.
    await outlineScene(page, 'The Gates').click()
    await page.waitForURL(new RegExp(`/manuscript/${gates}$`))
    await expect(page.getByTestId('manuscript-scene-title')).toHaveText('The Gates')
    await expect(editor).toHaveValue('')

    const gatesProse = 'Snow at the gates.\n\nNo one came to open them.'
    await editor.fill(gatesProse)
    await saveWith(page, () => page.keyboard.press('ControlOrMeta+s'))

    // Back and forth: each scene keeps its own.
    await outlineScene(page, 'The Council').click()
    await expect(editor).toHaveValue(councilProse)
    await outlineScene(page, 'The Gates').click()
    await expect(editor).toHaveValue(gatesProse)

    // The Council moves to another chapter on the Scenes view. Same scene, same address, same prose.
    await page.getByTestId('story-view-scenes').click()
    await page.waitForURL(new RegExp(`/stories/${storyId}$`))
    await structural(page, `/scenes/${council}/position`, async () => {
      await openMenuFor(scene(page, 'The Council'), 'scene-move-to-option')
      await scene(page, 'The Council')
        .locator('[data-testid="scene-move-to-option"][data-target="Chapter 2: Ashes"]')
        .click()
    })

    await page.goto(`${storyUrl}/manuscript/${council}`)
    await expect(where).toHaveText('Chapter 2: Ashes · Scene 2 of 2')
    await expect(editor).toHaveValue(councilProse)
    await expect
      .poll(() => outline(page))
      .toEqual([
        'Unchaptered | Prologue',
        'Chapter 1: Arrival | The Gates',
        'Chapter 2: Ashes | The Breach | The Council',
      ])

    // Reordered inside its chapter: still the same prose.
    await page.goto(storyUrl)
    await structural(page, '/scenes/order', () =>
      chooseFromMenu(scene(page, 'The Council'), 'scene-move-up'),
    )
    await expect(page.getByTestId('story-announcer')).toHaveText(
      '“The Council” is now scene 1 of 2 in Chapter 2: Ashes.',
    )

    await page.goto(`${storyUrl}/manuscript/${council}`)
    await expect(where).toHaveText('Chapter 2: Ashes · Scene 1 of 2')
    await expect(editor).toHaveValue(councilProse)

    // Arrival is deleted: The Gates goes to Unchaptered with every word it had.
    await page.goto(storyUrl)
    await chooseFromMenu(chapter(page, 'Arrival'), 'chapter-delete')
    await acceptConfirm(page)
    await expect(page.getByTestId('chapter')).toHaveCount(1)

    await page.goto(`${storyUrl}/manuscript/${gates}`)
    await expect(where).toHaveText('Unchaptered · Scene 2 of 2')
    await expect(editor).toHaveValue(gatesProse)
    await expect
      .poll(() => outline(page))
      .toEqual([
        'Unchaptered | Prologue | The Gates',
        'Chapter 1: Ashes | The Council | The Breach',
      ])

    // The Gates is deleted, and its prose with it. Its old address opens nothing.
    await page.goto(storyUrl)
    await chooseFromMenu(scene(page, 'The Gates'), 'scene-delete')
    await acceptConfirm(page)
    await expect(scene(page, 'The Gates')).toHaveCount(0)

    await page.goto(`${storyUrl}/manuscript/${gates}`)
    await expect(page.getByTestId('manuscript-scene-missing')).toContainText(
      'That scene is not in this story.',
    )
    await expect(outlineScene(page, 'The Gates')).toHaveCount(0)
    expect((await page.request.get(manuscriptPath(universeId, storyId, gates))).status()).toBe(404)
    expect((await readManuscript(page, universeId, storyId, council)).content).toBe(councilProse)
  })

  test('nothing unsaved is left behind without asking, and a failed or stale save keeps the text on screen', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Unsaved '))
    const storyId = await seedStory(page, universeId, 'Careful')
    const first = await seedScene(page, universeId, storyId, 'First')
    const second = await seedScene(page, universeId, storyId, 'Second')
    await writeManuscript(page, universeId, storyId, first, 'Saved words.')

    const storyUrl = `/app/universes/${universeId}/stories/${storyId}`
    const firstUrl = new RegExp(`/manuscript/${first}$`)
    const editor = page.getByTestId('manuscript-editor')
    const status = page.getByTestId('manuscript-status')
    const save = page.getByTestId('manuscript-save')
    const conflict = page.getByTestId('manuscript-conflict')

    await page.goto(`${storyUrl}/manuscript/${first}`)
    await expect(page.getByTestId('manuscript-where')).toHaveText('Scene 1 of 2')
    await expect(editor).toHaveValue('Saved words.')
    await expect(status).toHaveText('Saved')
    await expect(save).toBeDisabled()

    await editor.fill('Saved words. And more.')
    await expect(status).toHaveText('Unsaved changes')
    await expect(save).toBeEnabled()

    // Choosing another scene asks, naming the scene; staying keeps the address and the text.
    await outlineScene(page, 'Second').click()
    await dismissConfirm(page, '“First” has unsaved changes')
    await expect(page).toHaveURL(firstUrl)
    await expect(outlineScene(page, 'First')).toHaveAttribute('aria-current', 'page')
    await expect(editor).toHaveValue('Saved words. And more.')

    // So does leaving for another view of the story, or another section of the universe.
    for (const control of ['story-view-plot', 'story-view-scenes', 'workspace-lore']) {
      await page.getByTestId(control).click()
      await expect(confirmDialog(page), control).toBeVisible()
      await dismissConfirm(page)
      await expect(page).toHaveURL(firstUrl)
      await expect(editor).toHaveValue('Saved words. And more.')
    }

    // A save the server fails changes nothing on screen, says so, and can be tried again.
    await page.route('**/manuscript', (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
        : route.continue(),
    )
    await save.click()
    await expect(page.getByTestId('manuscript-error')).toContainText('could not be saved')
    await expect(editor).toHaveValue('Saved words. And more.')
    await expect(status).toHaveText('Unsaved changes')
    await expect(save).toBeEnabled()
    expect((await readManuscript(page, universeId, storyId, first)).content).toBe('Saved words.')
    await page.unroute('**/manuscript')

    await saveWith(page, () => page.keyboard.press('ControlOrMeta+s'))
    await expect(page.getByTestId('manuscript-error')).toHaveCount(0)
    expect((await readManuscript(page, universeId, storyId, first)).content).toBe(
      'Saved words. And more.',
    )

    // Saved, so choosing another scene asks nothing.
    await outlineScene(page, 'Second').click()
    await page.waitForURL(new RegExp(`/manuscript/${second}$`))
    await expect(page.getByTestId('manuscript-scene-title')).toHaveText('Second')
    await expect(confirmDialog(page)).toHaveCount(0)
    await expect(editor).toHaveValue('')

    // Choosing to leave does leave, and what was unsaved is gone - from the screen and from the API alike.
    await editor.fill('A draft that is never saved.')

    // The browser's Back button asks too, once; staying keeps the scene, its address and the draft.
    await page.goBack()
    await dismissConfirm(page)
    await expect(page).toHaveURL(new RegExp(`/manuscript/${second}$`))
    await expect(editor).toHaveValue('A draft that is never saved.')

    await outlineScene(page, 'First').click()
    await acceptConfirm(page)
    await page.waitForURL(firstUrl)
    await expect(editor).toHaveValue('Saved words. And more.')
    await outlineScene(page, 'Second').click()
    await expect(page.getByTestId('manuscript-scene-title')).toHaveText('Second')
    await expect(editor).toHaveValue('')
    expect((await readManuscript(page, universeId, storyId, second)).content).toBe('')

    // Another window saves First while this one is writing. This save is refused, and nothing is lost either way.
    await outlineScene(page, 'First').click()
    await expect(editor).toHaveValue('Saved words. And more.')
    await editor.fill('Written in this window.')
    await writeManuscript(page, universeId, storyId, first, 'Written in another window.')

    await save.click()
    await expect(conflict).toBeVisible()
    await expect(editor).toHaveValue('Written in this window.')
    await expect(status).toHaveText('Unsaved changes')
    expect((await readManuscript(page, universeId, storyId, first)).content).toBe(
      'Written in another window.',
    )

    // The author reviews the latest first, then keeps their own and saves it deliberately.
    await conflict.getByTestId('manuscript-conflict-review').click()
    await expect(conflict.getByTestId('conflict-latest-text')).toContainText(
      'Written in another window.',
    )
    await conflict.getByTestId('manuscript-conflict-keep').click()
    await expect(conflict).toHaveCount(0)
    await expect(editor).toHaveValue('Written in this window.')
    await expect(status).toHaveText('Unsaved changes')
    await saveWith(page, () => save.click())
    expect((await readManuscript(page, universeId, storyId, first)).content).toBe(
      'Written in this window.',
    )

    // Or takes the other one - once they confirm it.
    await editor.fill('Mine again.')
    await writeManuscript(page, universeId, storyId, first, 'Theirs again.')
    await save.click()
    await expect(conflict).toBeVisible()
    await conflict.getByTestId('manuscript-conflict-review').click()
    await conflict.getByTestId('manuscript-conflict-use-latest').click()
    await acceptConfirm(page)
    await expect(editor).toHaveValue('Theirs again.')
    await expect(status).toHaveText('Saved')
    await expect(conflict).toHaveCount(0)

    // The client knows the API's limit and says so before a save, rather than failing one.
    await editor.fill('a'.repeat(1_000_001))
    await expect(page.getByTestId('manuscript-too-long')).toContainText('1,000,001 of 1,000,000')
    await expect(save).toBeDisabled()
    await editor.fill('a'.repeat(1_000_000))
    await expect(page.getByTestId('manuscript-too-long')).toHaveCount(0)
    await expect(save).toBeEnabled()

    // Closing the tab with unsaved prose asks too.
    await editor.fill('Unsaved when the tab closes.')
    await page.getByTestId('manuscript-scene-title').click()
    const prompt = page.waitForEvent('dialog')
    await page.close({ runBeforeUnload: true })
    const dialog = await prompt
    expect(dialog.type()).toBe('beforeunload')
    await dialog.accept()
  })

  test('a story with no scenes points back to Scenes, a scene outside the story is never read, and planning stays beside the prose', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Beside '))
    const storyId = await seedStory(page, universeId, 'Not yet written')
    const storyUrl = `/app/universes/${universeId}/stories/${storyId}`

    await page.goto(`${storyUrl}/manuscript`)
    await expect(page.getByTestId('manuscript-empty')).toContainText('No scenes yet.')
    await page.getByTestId('manuscript-empty-scenes').click()
    await page.waitForURL(new RegExp(`/stories/${storyId}$`))
    await expect(page.getByTestId('scenes-empty')).toBeVisible()

    const arlen = await seedEntity(page, universeId, 'Arlen')
    const council = await seedScene(page, universeId, storyId, 'The Council', null, arlen)
    const arc = await seedArc(page, universeId, storyId, 'Fall of the King')
    await seedBeat(page, universeId, storyId, arc, 'Capital is breached', [council])

    const other = await seedStory(page, universeId, 'Another story')
    const elsewhere = await seedScene(page, universeId, other, 'Elsewhere')
    await writeManuscript(page, universeId, other, elsewhere, 'Prose from another story.')

    const reads: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/') && request.url().endsWith('/manuscript')) {
        reads.push(request.url())
      }
    })

    // Another story's scene, or no scene at all: the address names it, and nothing is read or shown.
    for (const id of [elsewhere, '7f1d6c0a-0000-4000-8000-000000000001']) {
      await page.goto(`${storyUrl}/manuscript/${id}`)
      await expect(page.getByTestId('manuscript-scene-missing')).toContainText(
        'That scene is not in this story.',
      )
      await expect(outlineScene(page, 'The Council')).toBeVisible()
      await expect(page.getByText('Prose from another story.')).toHaveCount(0)
    }
    expect(reads).toEqual([])

    // The open scene's planning is read-only context beside the prose, from the story and plot already read.
    await page.goto(`${storyUrl}/manuscript/${council}`)
    await expect(page.getByTestId('manuscript-where')).toHaveText('Scene 1 of 1')
    await expect(page.getByTestId('manuscript-pov')).toContainText('Arlen')
    const beatChip = page
      .getByTestId('manuscript-plot')
      .getByRole('link', { name: 'Fall of the King: Capital is breached' })
    await expect(beatChip).toBeVisible()
    await expect(page.getByTestId('manuscript-editor')).toHaveValue('')
    expect(reads.length).toBeGreaterThan(0)
    expect(reads.every((url) => url.includes(`/scenes/${council}/`))).toBe(true)

    // The scene's planning is edited in its own form, and a draft beside it is left exactly as it was.
    const editor = page.getByTestId('manuscript-editor')
    await editor.fill('A draft written while the planning changes.')
    await chooseFromMenu(page, 'manuscript-edit-scene')
    const form = page.getByTestId('scene-form')
    await expect(form).toBeVisible()
    await page.getByTestId('scene-title-input').fill('The Council of Nine')
    await page.getByTestId('save-scene').click()
    await expect(form).toHaveCount(0)

    await expect(page.getByTestId('manuscript-scene-title')).toHaveText('The Council of Nine')
    await expect(outlineScene(page, 'The Council of Nine')).toBeVisible()
    await expect(editor).toHaveValue('A draft written while the planning changes.')
    await expect(page.getByTestId('manuscript-status')).toHaveText('Unsaved changes')
    expect((await readManuscript(page, universeId, storyId, council)).content).toBe('')

    // A plot chip leads out of the page, so it asks first; once saved, it simply goes.
    await beatChip.click()
    await dismissConfirm(page)
    await expect(page).toHaveURL(new RegExp(`/manuscript/${council}$`))

    await saveWith(page, () => page.getByTestId('manuscript-save').click())
    await beatChip.click()
    await page.waitForURL(/\/plot#beat-[0-9a-f-]+$/)
  })

  test('a writer reaches the prose, saves, opens its history and writes on from the keyboard alone', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Keys to Write '))
    const storyId = await seedStory(page, universeId, 'Written by keys')
    const first = await seedScene(page, universeId, storyId, 'First')
    await writeManuscript(page, universeId, storyId, first, 'One.')

    await page.goto(`/app/universes/${universeId}/stories/${storyId}`)
    await page.getByTestId('story-view-manuscript').focus()
    await page.keyboard.press('Enter')
    await page.waitForURL(new RegExp(`/manuscript/${first}$`))

    const editor = page.getByTestId('manuscript-editor')
    await expect(editor).toHaveValue('One.')

    /** Presses a key until the focus lands on `testId`, and says how many presses that took. */
    async function tabTo(testId: string, key = 'Tab', limit = 12) {
      for (let presses = 1; presses <= limit; presses++) {
        await page.keyboard.press(key)
        const at = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))
        if (at === testId) return presses
      }
      throw new Error(`${testId} was not reached in ${limit} presses of ${key}`)
    }

    // From the views, the prose is a few presses away: past the outline and the scene's tools, nothing else.
    await tabTo('manuscript-editor')
    await page.keyboard.press('End')
    await page.keyboard.type(' Two.')
    await expect(page.getByTestId('manuscript-status')).toHaveText('Unsaved changes')
    await saveWith(page, () => page.keyboard.press('Control+s'))
    await expect(editor).toBeFocused()

    // History is just above the prose: opened, a version read, and back to writing.
    await tabTo('manuscript-history-toggle', 'Shift+Tab', 4)
    await page.keyboard.press('Enter')
    const list = page.getByTestId('manuscript-history-list')
    await expect(list.getByTestId('manuscript-version-view')).toHaveCount(2)
    await tabTo('manuscript-version-view')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('manuscript-version-snapshot')).toBeVisible()

    await tabTo('manuscript-editor')
    await page.keyboard.press('End')
    await page.keyboard.type(' Three.')
    await saveWith(page, () => page.keyboard.press('Control+s'))
    expect((await readManuscript(page, universeId, storyId, first)).content).toBe(
      'One. Two. Three.',
    )
  })

  test("on a phone the scene's planning waits behind Details, and on a desktop it is always shown", async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Folded Planning '))
    const arlen = await seedEntity(page, universeId, 'Arlen')
    const storyId = await seedStory(page, universeId, 'Planned')
    const first = await seedScene(page, universeId, storyId, 'First', null, arlen)
    const url = `/app/universes/${universeId}/stories/${storyId}/manuscript/${first}`

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(url)
    const details = page.getByTestId('manuscript-details-toggle')
    await expect(details).toHaveAccessibleName('Scene details')
    await expect(details).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('manuscript-pov')).toBeHidden()
    expect(await scrollsSideways(page)).toBe(false)

    await details.click()
    await expect(details).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('manuscript-pov')).toContainText('Arlen')
    await details.click()
    await expect(page.getByTestId('manuscript-pov')).toBeHidden()

    await page.setViewportSize({ width: 1440, height: 900 })
    await expect(details).toBeHidden()
    await expect(page.getByTestId('manuscript-pov')).toContainText('Arlen')
  })

  test('the manuscript keeps a writing measure from a phone to a wide desktop, light and dark', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Wide Manuscript '))
    const storyId = await seedStory(
      page,
      universeId,
      'A story whose title runs on for rather longer than any title reasonably should',
    )
    const chapterId = await seedChapter(
      page,
      universeId,
      storyId,
      'A chapter whose title also runs on past where any sensible heading would stop',
    )
    const first = await seedScene(
      page,
      universeId,
      storyId,
      'The first scene, with a title long enough to wrap onto a second line somewhere',
      chapterId,
    )
    const second = await seedScene(page, universeId, storyId, 'Second', chapterId)
    await seedScene(page, universeId, storyId, 'An Unchaptered scene with a long title of its own')

    const paragraph =
      'The hall had emptied long before Arlen understood why Mira would not meet his eyes, and by then the lamps were guttering and the rain had found every gap in the old roof.'
    const prose = Array.from({ length: 300 }, (_, index) => `${index + 1}. ${paragraph}`).join(
      '\n\n',
    )
    await writeManuscript(page, universeId, storyId, first, prose)

    const storyUrl = `/app/universes/${universeId}/stories/${storyId}`
    const measure = 46 * 16

    for (const [width, colorScheme] of [
      [390, 'dark'],
      [768, 'light'],
      [768, 'dark'],
      [1440, 'light'],
      [1920, 'light'],
      [1920, 'dark'],
    ] as const) {
      // Layout boxes come back in fractional pixels; a hair over the edge is rounding, not overflow.
      const edge = width + 1

      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`${storyUrl}/manuscript/${first}`)

      const editor = page.getByTestId('manuscript-editor')
      await expect(editor).toHaveValue(prose)
      expect(await scrollsSideways(page), `manuscript at ${width}px`).toBe(false)

      if (colorScheme === 'dark') {
        const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
        expect(ground, `dark ground at ${width}px`).toBe('rgb(21, 22, 23)')
      }

      // Prose keeps a reading measure on a wide screen and never runs off a narrow one.
      const editorBox = (await editor.boundingBox())!
      expect(editorBox.x + editorBox.width, `editor at ${width}px`).toBeLessThanOrEqual(edge)
      expect(editorBox.width, `editor measure at ${width}px`).toBeLessThanOrEqual(measure + 1)

      for (const control of [
        'story-view-manuscript',
        'manuscript-scene-actions',
        'manuscript-history-toggle',
        'manuscript-where',
      ]) {
        const box = await page.getByTestId(control).boundingBox()
        expect(box, `${control} at ${width}px`).not.toBeNull()
        expect(box!.x + box!.width, `${control} at ${width}px`).toBeLessThanOrEqual(edge)
      }

      // Save is in reach while writing.
      await editor.focus()
      const saveButton = page.getByTestId('manuscript-save')
      await expect(saveButton, `save at ${width}px`).toBeInViewport()
      const saveBox = (await saveButton.boundingBox())!
      expect(saveBox.x + saveBox.width, `save at ${width}px`).toBeLessThanOrEqual(edge)

      const toggle = page.getByTestId('manuscript-outline-toggle')
      const list = page.getByTestId('manuscript-outline-list')

      if (width < 1100) {
        // The outline folds away, and the prose takes the column.
        await expect(toggle).toBeVisible()
        await expect(list).toBeHidden()
        expect(editorBox.width, `editor width at ${width}px`).toBeGreaterThanOrEqual(
          Math.min(width - 96, measure - 1),
        )

        await toggle.click()
        await expect(list).toBeVisible()
        for (const link of await list.getByTestId('manuscript-outline-scene').all()) {
          const box = (await link.boundingBox())!
          expect(box.x + box.width, `outline scene at ${width}px`).toBeLessThanOrEqual(edge)
        }
        expect(await scrollsSideways(page), `open outline at ${width}px`).toBe(false)

        // Choosing a scene closes the list, and the focus lands on the toggle that now names it.
        await outlineScene(page, 'Second').click()
        await page.waitForURL(new RegExp(`/manuscript/${second}$`))
        await expect(page.getByTestId('manuscript-scene-title')).toHaveText('Second')
        await expect(list).toBeHidden()
        await expect(toggle).toContainText('Second')
        await expect
          .poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-testid')))
          .toBe('manuscript-outline-toggle')
      } else {
        // Beside the prose, not above it.
        await expect(toggle).toBeHidden()
        await expect(list).toBeVisible()
        const outlineBox = (await page.getByTestId('manuscript-outline').boundingBox())!
        expect(outlineBox.x + outlineBox.width, `outline at ${width}px`).toBeLessThanOrEqual(
          editorBox.x,
        )
        for (const link of await list.getByTestId('manuscript-outline-scene').all()) {
          const box = (await link.boundingBox())!
          expect(box.x + box.width, `outline scene at ${width}px`).toBeLessThanOrEqual(
            outlineBox.x + outlineBox.width + 1,
          )
        }
      }
    }
  })
})
