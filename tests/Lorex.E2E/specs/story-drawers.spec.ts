import { expect, test, type Page } from '@playwright/test'
import { chooseFromMenu } from './support/rowMenu'
import { answerConfirms } from './support/confirm'

/**
 * The five story drawers - story, chapter, scene, arc and beat - never let unsaved changes go without asking, and never
 * ask about a form that holds nothing to lose. Dirty is the form against what it opened on, as the save would send it:
 * a change put back is no change, and the order references were picked in is not one either.
 *
 * Each drawer is a modal dialog, so while one is open the page behind it cannot be clicked: the ways out are its own
 * Cancel, Escape and the backdrop, which ask once to discard, and the browser's Back, Forward, reload and close, which
 * ask the leave question every Lorex editor asks. Each test builds its own account and universe.
 */
const PASSWORD = 'Test-password-123!'
const DISCARD = 'Close without saving your changes? They will be lost.'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('drawer')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function newUniverse(page: Page, name: string) {
  await page.goto('/app')
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

async function post(page: Page, path: string, data: object) {
  const created = await page.request.post(path, { data })
  expect(created.status()).toBe(201)
  return (await created.json()).id as string
}

async function seedEntity(page: Page, universeId: string, name: string) {
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string }[]
  return post(page, `/api/universes/${universeId}/entities`, {
    entityTypeId: types.find((type) => type.name === 'Character')!.id,
    name,
    summary: null,
    canonStatus: 0,
    aliases: [],
    tags: [],
    fields: [],
  })
}

/** A story with two chapters, two scenes in the first, one arc of one beat pointing at the first scene. */
async function seedStory(page: Page, universeId: string) {
  const stories = `/api/universes/${universeId}/stories`
  const storyId = await post(page, stories, { title: 'The Long Winter', premise: null, status: 0 })
  const base = `${stories}/${storyId}`
  const chapter = (title: string) =>
    post(page, `${base}/chapters`, { title, summary: null, notes: null })
  const one = await chapter('Arrival')
  await chapter('Ashes')
  const arlen = await seedEntity(page, universeId, 'Arlen')
  const scene = (title: string, entityIds: string[]) =>
    post(page, `${base}/scenes`, {
      title,
      summary: null,
      notes: null,
      povEntityId: null,
      chronology: null,
      entityIds,
      chapterId: one,
    })
  const gates = await scene('The Gates', [arlen])
  await scene('The Council', [])
  const arc = await post(page, `${base}/plot-arcs`, {
    title: 'The siege',
    description: null,
    notes: null,
  })
  await post(page, `${base}/plot-arcs/${arc}/beats`, {
    title: 'The wall holds',
    description: null,
    notes: null,
    sceneIds: [gates],
    entityIds: [],
  })
  return `/app/universes/${universeId}/stories/${storyId}`
}

/**
 * Every dialog the page raises, in order, each answered by the next answer queued - dismissed when none is queued. So a
 * test says what it expects to be asked, and a question nobody expected shows up in `asked`.
 */
async function dialogs(page: Page) {
  const asked: string[] = []
  const answers: boolean[] = []
  // A reload or a closed tab is the browser's own prompt; everything else is LoreX's confirmation (Issue #50).
  page.on('dialog', (dialog) => {
    asked.push(dialog.type() === 'beforeunload' ? 'beforeunload' : dialog.message())
    void (answers.shift() ? dialog.accept() : dialog.dismiss())
  })
  await answerConfirms(page, () => answers.shift() ?? false, asked)
  return {
    asked,
    answer(...next: boolean[]) {
      answers.push(...next)
    },
  }
}

function scene(page: Page, title: string) {
  return page.locator(`[data-testid="scene"][data-title="${title}"]`)
}

test.describe('story drawers', () => {
  test('a new story asks before its title is thrown away, by Cancel, Escape or the backdrop, and never when untouched', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('New Tales '))
    const { asked, answer } = await dialogs(page)

    await page.goto(`/app/universes/${universeId}/stories`)
    const form = page.getByTestId('story-form')

    // Untouched, it simply closes - by Cancel, and by Escape.
    await page.getByTestId('new-story').click()
    await page.getByTestId('cancel-story').click()
    await expect(form).toHaveCount(0)
    await page.getByTestId('new-story').click()
    await page.keyboard.press('Escape')
    await expect(form).toHaveCount(0)
    await expect.poll(() => asked).toEqual([])

    // With a title typed, each way out asks once; staying keeps the title and the focus in the drawer.
    await page.getByTestId('new-story').click()
    const title = page.getByTestId('story-title-input')
    await title.fill('The Salt Archive')

    // Each question is answered before the next way out is tried, as a person would. The backdrop first: the drawer's
    // panel sits at the right, so the left edge of the screen is the dialog's own surround.
    await page.mouse.click(20, 400)
    await expect.poll(() => asked.length).toBe(1)
    await page.getByTestId('cancel-story').click()
    await expect.poll(() => asked.length).toBe(2)
    await page.keyboard.press('Escape')
    await expect.poll(() => asked.length).toBe(3)
    await page.keyboard.press('Escape')
    await expect.poll(() => asked).toEqual([DISCARD, DISCARD, DISCARD, DISCARD])
    await expect(form).toBeVisible()
    await expect(title).toHaveValue('The Salt Archive')
    await expect
      .poll(() =>
        page.evaluate(() => !!document.activeElement?.closest('[data-testid="story-form"]')),
      )
      .toBe(true)

    // A title typed and cleared is nothing to lose.
    await title.fill('')
    await page.getByTestId('cancel-story').click()
    await expect(form).toHaveCount(0)
    await expect.poll(() => asked).toHaveLength(4)

    // Discarding closes it, asked once - and the next new story starts blank.
    await page.getByTestId('new-story').click()
    await title.fill('Thrown away')
    answer(true)
    await page.getByTestId('cancel-story').click()
    await expect(form).toHaveCount(0)
    await expect.poll(() => asked).toHaveLength(5)
    await page.getByTestId('new-story').click()
    await expect(title).toHaveValue('')
  })

  test("an edited story holds the browser's Back and a reload, and a successful save lets go", async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Held Back '))
    const storyUrl = await seedStory(page, universeId)
    const { asked, answer } = await dialogs(page)

    // A real page to go back to.
    await page.goto(`/app/universes/${universeId}/stories`)
    await page.getByTestId('story-row').getByRole('link').click()
    await page.waitForURL(storyUrl)

    await chooseFromMenu(page, 'edit-story')
    const form = page.getByTestId('story-form')
    const premise = page.getByTestId('story-premise-input')
    await premise.fill('A siege, told backwards.')

    // Back asks the leave question; staying keeps the address, the drawer and the draft.
    await page.goBack()
    await expect.poll(() => asked.length).toBe(1)
    await expect
      .poll(() => asked[0])
      .toBe('“The Long Winter” has unsaved changes. Leave without saving them?')
    await expect(page).toHaveURL(storyUrl)
    await expect(form).toBeVisible()
    await expect(premise).toHaveValue('A siege, told backwards.')

    // Reload or close asks through the browser's own prompt while anything is unsaved.
    await page.close({ runBeforeUnload: true })
    await expect.poll(() => asked.length).toBe(2)
    await expect.poll(() => asked[1]).toBe('beforeunload')
    await expect(form).toBeVisible()

    // Saved, nothing is left to ask about: the drawer closes and Back goes straight back.
    await page.getByTestId('save-story').click()
    await expect(form).toHaveCount(0)
    await expect(page.getByTestId('story-premise')).toHaveText('A siege, told backwards.')
    await page.goBack()
    await page.waitForURL(/\/stories$/)
    await expect(page.getByTestId('story-row')).toBeVisible()
    await expect.poll(() => asked).toHaveLength(2)

    // Leaving an unsaved edit by Back, once confirmed, goes - once - and closes the drawer.
    await page.goForward()
    await page.waitForURL(storyUrl)
    await expect(page.getByTestId('story-title')).toBeVisible()
    await chooseFromMenu(page, 'edit-story')
    await page.getByTestId('story-title-input').fill('Other')
    // The browser moves first and the router puts it back while it asks, so the question is waited for, not assumed.
    answer(true)
    await page.goBack()
    await expect.poll(() => asked.length).toBe(3)
    await page.waitForURL(/\/stories$/)
    await expect(page.getByTestId('story-row')).toBeVisible()
    await expect(form).toHaveCount(0)
    await expect(page.getByTestId('story-row')).toHaveAttribute('data-title', 'The Long Winter')
  })

  test('a chapter whose save fails keeps its draft and its guard, and one that saves asks nothing', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Failed Saves '))
    const storyUrl = await seedStory(page, universeId)
    const { asked, answer } = await dialogs(page)

    await page.goto(`/app/universes/${universeId}/stories`)
    await page.getByTestId('story-row').getByRole('link').click()
    await page.waitForURL(storyUrl)
    const chapter = page.locator('[data-testid="chapter"][data-title="Arrival"]')

    // Opening the edit changes nothing, the chapters' order included.
    await chooseFromMenu(chapter, 'chapter-edit')
    const form = page.getByTestId('chapter-form')
    await page.getByTestId('cancel-chapter').click()
    await expect(form).toHaveCount(0)
    await expect.poll(() => asked).toEqual([])

    await chooseFromMenu(chapter, 'chapter-edit')
    await page.getByTestId('chapter-summary-input').fill('Where it begins.')

    // The save is refused by the server: the drawer, the draft and the guard all stay.
    await page.route('**/chapters/*', (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 500, body: '' })
        : route.continue(),
    )
    await page.getByTestId('save-chapter').click()
    await expect(page.getByTestId('chapter-error')).toBeVisible()
    await expect(form).toBeVisible()
    await expect(page.getByTestId('chapter-summary-input')).toHaveValue('Where it begins.')

    await page.getByTestId('cancel-chapter').click()
    await expect.poll(() => asked).toEqual([DISCARD])
    await page.goBack()
    await expect.poll(() => asked.length).toBe(2)
    await expect
      .poll(() => asked[1])
      .toBe('“Arrival” has unsaved changes. Leave without saving them?')
    await expect(page).toHaveURL(storyUrl)
    await expect(form).toBeVisible()

    // Once it saves, nothing asks: not the drawer closing, not Back.
    await page.unroute('**/chapters/*')
    await page.getByTestId('save-chapter').click()
    await expect(form).toHaveCount(0)
    await expect(chapter.getByTestId('chapter-summary')).toHaveText('Where it begins.')
    await page.goBack()
    await page.waitForURL(/\/stories$/)
    await expect.poll(() => asked).toHaveLength(2)

    // A new chapter asks too, and discarding it creates nothing.
    await page.goForward()
    await page.waitForURL(storyUrl)
    await page.getByTestId('new-chapter').click()
    await page.getByTestId('chapter-title-input').fill('Never written')
    answer(true)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('chapter-form')).toHaveCount(0)
    await expect.poll(() => asked).toEqual([DISCARD, asked[1], DISCARD])
    await expect(page.getByTestId('chapter')).toHaveCount(2)
  })

  test("a scene's draft is its title, chapter and lore; a change put back is none; and a discarded draft never reaches the next scene", async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Scene Drafts '))
    const storyUrl = await seedStory(page, universeId)
    const { asked, answer } = await dialogs(page)
    // Reached in the app, so Back has a page of Lorex's own to go to.
    await page.goto(`/app/universes/${universeId}/stories`)
    await page.getByTestId('story-row').getByRole('link').click()
    await page.waitForURL(storyUrl)
    const form = page.getByTestId('scene-form')
    const title = page.getByTestId('scene-title-input')

    // Put back as it was, a title is clean again: Cancel closes without asking.
    await chooseFromMenu(scene(page, 'The Gates'), 'scene-edit')
    await title.fill('The Gates, again')
    await title.fill('The Gates')
    await page.getByTestId('cancel-scene').click()
    await expect(form).toHaveCount(0)
    await expect.poll(() => asked).toEqual([])

    // Moving it to another chapter is a change.
    await chooseFromMenu(scene(page, 'The Gates'), 'scene-edit')
    await page.getByTestId('scene-chapter-select').selectOption({ label: 'Chapter 2: Ashes' })
    await page.getByTestId('cancel-scene').click()
    await expect.poll(() => asked).toEqual([DISCARD])
    await expect(form).toBeVisible()

    // So is letting go of an entry it links; choosing the chapter back leaves only that change.
    await page.getByTestId('scene-chapter-select').selectOption({ label: 'Chapter 1: Arrival' })
    await form.getByTestId('participant-remove-Arlen').click()
    await page.keyboard.press('Escape')
    await expect.poll(() => asked).toEqual([DISCARD, DISCARD])
    await expect(form).toBeVisible()

    // Discarded, the edit is gone: the next scene opened shows only its own stored values.
    await title.fill('Something else entirely')
    answer(true)
    await page.getByTestId('cancel-scene').click()
    await expect(form).toHaveCount(0)
    await chooseFromMenu(scene(page, 'The Council'), 'scene-edit')
    await expect(title).toHaveValue('The Council')
    await expect(page.getByTestId('scene-chapter-select')).toHaveValue(/.+/)
    await expect(form.getByTestId('participant-remove-Arlen')).toHaveCount(0)
    await page.getByTestId('cancel-scene').click()
    await expect(form).toHaveCount(0)
    await chooseFromMenu(scene(page, 'The Gates'), 'scene-edit')
    await expect(title).toHaveValue('The Gates')
    await expect(form.getByTestId('participant-remove-Arlen')).toBeVisible()
    await page.getByTestId('cancel-scene').click()
    await expect.poll(() => asked).toHaveLength(3)

    // A new scene, untouched, closes quietly; with a title, Back asks and staying keeps it.
    await page.getByTestId('new-scene').click()
    await page.keyboard.press('Escape')
    await expect(form).toHaveCount(0)
    await expect.poll(() => asked).toHaveLength(3)
    await page.getByTestId('new-scene').click()
    await title.fill('The Breach')
    await page.goBack()
    await expect.poll(() => asked.length).toBe(4)
    await expect
      .poll(() => asked[3])
      .toBe('This new scene has not been created. Leave without saving it?')
    await expect(title).toHaveValue('The Breach')

    // Saved, it closes without a word, and the scene is there.
    await page.getByTestId('save-scene').click()
    await expect(form).toHaveCount(0)
    await expect(scene(page, 'The Breach')).toHaveCount(1)
    await expect.poll(() => asked).toHaveLength(4)
  })

  test("an arc and a beat ask before their drafts go, a beat's scenes count, and a saved one asks nothing", async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Plot Drafts '))
    const storyUrl = await seedStory(page, universeId)
    const { asked, answer } = await dialogs(page)
    await page.goto(`${storyUrl}/plot`)
    const arc = page.locator('[data-testid="plot-arc"][data-title="The siege"]')
    const beat = page.locator('[data-testid="plot-beat"][data-title="The wall holds"]')

    // A new arc: untouched it closes; with a title it asks, and discarding creates nothing.
    await page.getByTestId('new-plot-arc').click()
    await page.getByTestId('cancel-plot-arc').click()
    await expect(page.getByTestId('plot-arc-form')).toHaveCount(0)
    await page.getByTestId('new-plot-arc').click()
    await page.getByTestId('plot-arc-title-input').fill('Loose threads')
    answer(true)
    await page.getByTestId('cancel-plot-arc').click()
    await expect(page.getByTestId('plot-arc-form')).toHaveCount(0)
    await expect.poll(() => asked).toEqual([DISCARD])
    await expect(page.getByTestId('plot-arc')).toHaveCount(1)

    // An edited arc, saved, asks nothing - neither on closing nor on leaving for another view.
    await chooseFromMenu(arc, 'plot-arc-edit')
    await page.getByTestId('plot-arc-description-input').fill('Who holds the wall.')
    await page.getByTestId('save-plot-arc').click()
    await expect(page.getByTestId('plot-arc-form')).toHaveCount(0)
    await expect(arc.getByTestId('plot-arc-description')).toHaveText('Who holds the wall.')

    // A beat's scenes are part of it: ticking one is a change, unticking it again is none.
    await beat.getByTestId('plot-beat-edit').click()
    const beatForm = page.getByTestId('plot-beat-form')
    const council = beatForm.locator(
      '[data-testid="scene-picker-option"][data-title="The Council"]',
    )
    await council.check()
    await page.getByTestId('cancel-plot-beat').click()
    await expect.poll(() => asked).toEqual([DISCARD, DISCARD])
    await expect(beatForm).toBeVisible()
    await council.uncheck()
    await page.getByTestId('cancel-plot-beat').click()
    await expect(beatForm).toHaveCount(0)
    await expect.poll(() => asked).toHaveLength(2)

    // A new beat asks too; saved, it is simply there.
    await arc.getByTestId('plot-arc-new-beat').click()
    await page.getByTestId('plot-beat-title-input').fill('The gate falls')
    await page.keyboard.press('Escape')
    await expect.poll(() => asked).toEqual([DISCARD, DISCARD, DISCARD])
    await page.getByTestId('save-plot-beat').click()
    await expect(beatForm).toHaveCount(0)
    await expect(page.getByTestId('plot-beat')).toHaveCount(2)

    await page.getByTestId('story-view-scenes').click()
    await page.waitForURL(storyUrl)
    await expect.poll(() => asked).toHaveLength(3)
  })
})
