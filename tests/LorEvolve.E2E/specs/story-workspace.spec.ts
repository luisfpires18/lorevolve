import { expect, test, type Page } from '@playwright/test'
import { openAccountMenu } from './support/account'
import { chooseFromMenu, openMenuFor } from './support/rowMenu'
import { acceptConfirm, dismissConfirm } from './support/confirm'

/**
 * The Story workspace as one product rather than three screens: Scenes, Plot and Manuscript under one header, reached
 * from one another, with every link landing somewhere a person can see and a keyboard can find. Each test registers its
 * own account and builds its own universe, so nothing depends on data another test left behind.
 *
 * The invariants under test: a new story leads to a scene first; the three views share one header, one read and an
 * address each; a scene, its prose, its plot and its lore are a link apart; no in-app way out drops unsaved prose
 * without asking; and on a phone the work starts on the first screen.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('crosser')
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

async function seedStory(page: Page, universeId: string, title: string, premise: string | null) {
  const story = await page.request.post(`/api/universes/${universeId}/stories`, {
    data: { title, premise, status: 0 },
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
  chapterId: string | null,
  povEntityId: string | null = null,
  entityIds: string[] = [],
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
        entityIds,
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
  entityIds: string[],
) {
  const created = await page.request.post(
    `/api/universes/${universeId}/stories/${storyId}/plot-arcs/${arcId}/beats`,
    { data: { title, description: null, notes: null, sceneIds, entityIds } },
  )
  expect(created.status()).toBe(201)
  return (await created.json()).id as string
}

async function writeManuscript(
  page: Page,
  universeId: string,
  storyId: string,
  sceneId: string,
  content: string,
) {
  const saved = await page.request.put(
    `/api/universes/${universeId}/stories/${storyId}/scenes/${sceneId}/manuscript`,
    { data: { content, expectedVersion: 0 } },
  )
  expect(saved.status()).toBe(200)
}

function scene(page: Page, title: string) {
  return page.locator(`[data-testid="scene"][data-title="${title}"]`)
}

function beat(page: Page, title: string) {
  return page.locator(`[data-testid="plot-beat"][data-title="${title}"]`)
}

/** Whether the page can be scrolled sideways, which no screen in LorEvolve may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

test.describe('story workspace', () => {
  test('a new story leads to its first scene, and its three views share one header, one read and an address each', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('First Scene '))
    const storyId = await seedStory(
      page,
      universeId,
      'The Long Winter',
      'A siege, told from its last day back to its first.',
    )
    const storyUrl = `/app/universes/${universeId}/stories/${storyId}`
    const views = page.getByRole('navigation', { name: 'Story views' })

    // Scenes, the story's home: one empty state, one way to begin, and nothing competing with it.
    await page.goto(storyUrl)
    await expect(page.getByTestId('scenes-empty')).toContainText('No scenes yet.')
    await expect(page.getByTestId('new-scene')).toHaveCount(1)
    await expect(page.getByTestId('scenes-empty').getByTestId('new-scene')).toBeVisible()
    await expect(page.getByTestId('new-chapter')).toHaveCount(1)
    await expect(page.getByTestId('story-premise')).toHaveText(
      'A siege, told from its last day back to its first.',
    )
    await expect(views.getByRole('link', { name: 'Scenes' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    // Plot: the same header without the premise, its own empty state, and a way back to the scene that comes first.
    await views.getByRole('link', { name: 'Plot' }).click()
    await page.waitForURL(new RegExp(`/stories/${storyId}/plot$`))
    await expect(views.getByRole('link', { name: 'Plot' })).toHaveAttribute('aria-current', 'page')
    await expect(views.getByRole('link', { name: 'Scenes' })).not.toHaveAttribute('aria-current')
    await expect(page.getByTestId('story-title')).toHaveText('The Long Winter')
    await expect(page.getByTestId('story-premise')).toHaveCount(0)
    await expect(page.getByTestId('plot-empty')).toContainText('No arcs yet.')
    await expect(page.getByTestId('new-plot-arc')).toHaveCount(1)
    await expect(page.getByTestId('plot-empty-scenes')).toBeVisible()

    await views.getByRole('link', { name: 'Manuscript' }).click()
    await page.waitForURL(new RegExp(`/stories/${storyId}/manuscript$`))
    await expect(views.getByRole('link', { name: 'Manuscript' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByTestId('manuscript-empty')).toContainText('No scenes yet.')

    // The browser's own history walks the views back and forth, and a reload keeps each where it is.
    await page.goBack()
    await page.waitForURL(new RegExp(`/stories/${storyId}/plot$`))
    await expect(page.getByTestId('plot-empty')).toBeVisible()
    await page.goBack()
    await page.waitForURL(new RegExp(`/stories/${storyId}$`))
    await expect(page.getByTestId('scenes-empty')).toBeVisible()
    await page.goForward()
    await page.waitForURL(new RegExp(`/stories/${storyId}/plot$`))
    await page.reload()
    await expect(page.getByTestId('plot-empty')).toBeVisible()
    await expect(views.getByRole('link', { name: 'Plot' })).toHaveAttribute('aria-current', 'page')

    // One read of the story and its plot serves every view: moving between them reads neither again.
    const reads: string[] = []
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname
      if (
        path === `/api/universes/${universeId}/stories/${storyId}` ||
        path.endsWith('/plot-arcs')
      ) {
        reads.push(path)
      }
    })
    await views.getByRole('link', { name: 'Scenes' }).click()
    await expect(page.getByTestId('scenes-empty')).toBeVisible()
    await views.getByRole('link', { name: 'Plot' }).click()
    await expect(page.getByTestId('plot-empty')).toBeVisible()
    expect(reads).toEqual([])

    // The first useful thing is a scene, straight from the empty state.
    await page.getByTestId('plot-empty-scenes').click()
    await page.waitForURL(new RegExp(`/stories/${storyId}$`))
    await page.getByTestId('new-scene').click()
    await page.getByTestId('scene-title-input').fill('The Gates')
    await page.getByTestId('save-scene').click()
    await expect(page.getByTestId('scene-form')).toHaveCount(0)
    await expect(page.getByTestId('scenes-empty')).toHaveCount(0)
    await expect(page.getByTestId('scene')).toHaveCount(1)

    // The story's own edit is in the story's menu, and its drawer hands the focus back to that menu.
    const storyMenu = page.getByTestId('story-actions')
    await expect(storyMenu).toHaveAccessibleName(/^Story actions for /)
    await chooseFromMenu(page, 'edit-story')
    await page.getByTestId('story-status-drafting').click()
    await page.getByTestId('save-story').click()
    await expect(page.getByTestId('story-form')).toHaveCount(0)
    await expect(page.getByTestId('story-status')).toHaveText('Drafting')
    await expect(storyMenu).toBeFocused()
  })

  test('a writer moves between a scene, its prose, its plot and its lore, and no unsaved word is dropped on the way', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Crossings '))
    const arlen = await seedEntity(page, universeId, 'Arlen')
    const storyId = await seedStory(page, universeId, 'Crossings', null)
    const arrival = await seedChapter(page, universeId, storyId, 'Arrival')
    for (const title of ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']) {
      await seedScene(page, universeId, storyId, title, arrival)
    }
    const council = await seedScene(page, universeId, storyId, 'The Council', arrival, arlen, [
      arlen,
    ])
    const arc = await seedArc(page, universeId, storyId, 'Fall of the King')
    const beatId = await seedBeat(
      page,
      universeId,
      storyId,
      arc,
      'The crown is refused',
      [council],
      [arlen],
    )

    const storyUrl = `/app/universes/${universeId}/stories/${storyId}`
    const atCouncil = new RegExp(`/stories/${storyId}#scene-${council}$`)
    const editor = page.getByTestId('manuscript-editor')

    // Write, on the scene itself, opens that scene's manuscript at the one address it has.
    await page.goto(storyUrl)
    const write = scene(page, 'The Council').getByTestId('scene-write')
    await expect(write).toHaveAccessibleName('Write')
    await expect(write).toHaveAccessibleDescription(/The Council/)
    await write.click()
    await page.waitForURL(new RegExp(`/manuscript/${council}$`))
    await expect(page.getByTestId('manuscript-scene-title')).toHaveText('The Council')
    await expect(
      page.getByTestId('manuscript-lore').getByRole('link', { name: 'Arlen' }),
    ).toBeVisible()

    await editor.fill('The hall had emptied.')

    // Going back to the scene's place in the story asks first, and staying keeps every word.
    await chooseFromMenu(page, 'manuscript-show-scene')
    await dismissConfirm(page, '“The Council” has unsaved changes')
    await expect(page).toHaveURL(new RegExp(`/manuscript/${council}$`))
    await expect(editor).toHaveValue('The hall had emptied.')

    // So does signing out, which is a button rather than a link.
    await openAccountMenu(page)
    await page.getByRole('button', { name: 'Sign out' }).click()
    await dismissConfirm(page, '“The Council” has unsaved changes')
    await expect(page).toHaveURL(new RegExp(`/manuscript/${council}$`))
    await expect(editor).toHaveValue('The hall had emptied.')
    await page.keyboard.press('Escape')

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith('/manuscript') && response.request().method() === 'PUT',
      ),
      page.getByTestId('manuscript-save').click(),
    ])
    await expect(page.getByTestId('manuscript-status')).toHaveText('Saved')

    // Saved, it simply goes - and lands on the scene: scrolled to, focused and marked for a moment.
    await chooseFromMenu(page, 'manuscript-show-scene')
    await page.waitForURL(atCouncil)
    const councilCard = scene(page, 'The Council')
    await expect(councilCard).toHaveAttribute('data-arrived', 'true')
    await expect(councilCard).toBeFocused()
    await expect(councilCard).toBeInViewport()
    await expect(councilCard).not.toHaveAttribute('data-arrived', /.*/, { timeout: 6_000 })

    // From the scene to the beat that points at it, marked the same way, and back again.
    await councilCard.getByTestId('scene-plot-beat').click()
    await page.waitForURL(new RegExp(`/plot#beat-${beatId}$`))
    await expect(beat(page, 'The crown is refused')).toHaveAttribute('data-arrived', 'true')
    await expect(beat(page, 'The crown is refused')).toBeFocused()

    await beat(page, 'The crown is refused').getByTestId('plot-beat-scene').click()
    await page.waitForURL(atCouncil)
    await expect(scene(page, 'The Council')).toBeFocused()

    // A deep link survives a reload, and still lands where it points.
    await page.reload()
    await expect(scene(page, 'The Council')).toBeInViewport()
    await expect(scene(page, 'The Council')).toBeFocused()

    // Every menu says whose it is, Delete comes last in it, and a drawer hands the focus back to the menu that opened it.
    const sceneMenu = scene(page, 'The Council').getByTestId('scene-actions')
    await expect(sceneMenu).toHaveAccessibleName('More actions for The Council')
    await openMenuFor(scene(page, 'The Council'), 'scene-edit')
    const items = scene(page, 'The Council').locator('.actionmenu__item')
    await expect(items.first()).toHaveAccessibleName('Edit scene')
    await expect(items.last()).toHaveAccessibleName('Delete scene')
    await expect(items.last()).toHaveAttribute('data-testid', 'scene-delete')
    await scene(page, 'The Council').getByTestId('scene-edit').click()
    await expect(page.getByTestId('scene-form')).toBeVisible()
    await page.getByTestId('cancel-scene').click()
    await expect(page.getByTestId('scene-form')).toHaveCount(0)
    await expect(sceneMenu).toBeFocused()

    // The lore the prose is about is a link from the manuscript; with the words saved it simply goes there.
    await scene(page, 'The Council').getByTestId('scene-write').click()
    await page.waitForURL(new RegExp(`/manuscript/${council}$`))
    await expect(editor).toHaveValue('The hall had emptied.')
    await page.getByTestId('manuscript-lore').getByRole('link', { name: 'Arlen' }).click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    // Choosing to sign out with words unsaved does sign out.
    await page.goto(`${storyUrl}/manuscript/${council}`)
    await editor.fill('Written, and let go.')
    await openAccountMenu(page)
    await page.getByRole('button', { name: 'Sign out' }).click()
    await acceptConfirm(page)
    await page.waitForURL('/login')
  })

  test('on a phone the work starts on the first screen, and the story keeps one bar from 390px to 1920px', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('First Screen '))
    const arlen = await seedEntity(page, universeId, 'Arlen of the Long Northern Watch')
    const storyId = await seedStory(
      page,
      universeId,
      'The Long Winter of the Ashfall Succession, and Everything That Came After It',
      'A siege, told from its last day back to its first. Arlen holds the East Gate while the Council of Nine argues over a crown nobody wants.',
    )
    const chapter = await seedChapter(
      page,
      universeId,
      storyId,
      'The Council of Nine Convenes Under a Sky Full of Ash',
    )
    const council = await seedScene(
      page,
      universeId,
      storyId,
      'The Council, with a title long enough to wrap onto a second line',
      chapter,
      arlen,
      [arlen],
    )
    await seedScene(page, universeId, storyId, 'The Gates', chapter)
    const arc = await seedArc(page, universeId, storyId, 'Fall of the King')
    await seedBeat(page, universeId, storyId, arc, 'The crown is refused', [council], [arlen])
    await writeManuscript(
      page,
      universeId,
      storyId,
      council,
      Array.from({ length: 80 }, () => 'The hall had emptied long before Arlen understood.').join(
        '\n\n',
      ),
    )

    const storyUrl = `/app/universes/${universeId}/stories/${storyId}`

    for (const [width, height, colorScheme] of [
      [390, 844, 'dark'],
      [768, 1024, 'light'],
      [1440, 900, 'dark'],
      [1920, 1080, 'light'],
    ] as const) {
      // Layout boxes come back in fractional pixels; a hair over the edge is rounding, not overflow.
      const edge = width + 1

      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width, height })

      // Scenes: the view's own tools and the first chapter are on the first screen, under the whole header.
      await page.goto(storyUrl)
      await expect(page.getByTestId('scene')).toHaveCount(2)
      expect(await scrollsSideways(page), `scenes at ${width}px`).toBe(false)
      const newScene = (await page.getByTestId('new-scene').boundingBox())!
      expect(newScene.y + newScene.height, `new scene at ${width}px`).toBeLessThanOrEqual(height)
      const firstChapter = (await page.getByTestId('chapter').first().boundingBox())!
      expect(firstChapter.y, `first chapter at ${width}px`).toBeLessThan(height)

      // One bar: the three views and the story's menu, none off the screen and all on one line.
      const manuscriptView = (await page.getByTestId('story-view-manuscript').boundingBox())!
      for (const name of ['Story actions for']) {
        const tool = page.getByRole('button', { name })
        await expect(tool, `${name} at ${width}px`).toBeVisible()
        const box = (await tool.boundingBox())!
        expect(box.x + box.width, `${name} at ${width}px`).toBeLessThanOrEqual(edge)
        // On the same line: the tool's box and the view link's box overlap vertically.
        expect(box.y, `${name} shares the views' line at ${width}px`).toBeLessThan(
          manuscriptView.y + manuscriptView.height,
        )
        expect(box.y + box.height, `${name} shares the views' line at ${width}px`).toBeGreaterThan(
          manuscriptView.y,
        )
      }

      // Plot: the first arc is on the first screen.
      await page.getByTestId('story-view-plot').click()
      await expect(page.getByTestId('plot-arc')).toHaveCount(1)
      expect(await scrollsSideways(page), `plot at ${width}px`).toBe(false)
      const firstArc = (await page.getByTestId('plot-arc').first().boundingBox())!
      expect(firstArc.y, `first arc at ${width}px`).toBeLessThan(height * 0.75)

      // Manuscript: a real stretch of the prose is on the first screen, beneath its planning and its tools.
      await page.goto(`${storyUrl}/manuscript/${council}`)
      const editor = page.getByTestId('manuscript-editor')
      await expect(editor).not.toHaveValue('')
      expect(await scrollsSideways(page), `manuscript at ${width}px`).toBe(false)

      // The scene's tools keep to one line, each under its whole name - History, then the menu holding Edit scene and
      // Show in Scenes: a second row of them is prose pushed off a phone's first screen.
      const history = page.getByTestId('manuscript-history-toggle')
      await expect(history).toHaveAccessibleName('Manuscript history')
      const menu = (await page.getByTestId('manuscript-scene-actions').boundingBox())!
      const historyBox = (await history.boundingBox())!
      expect(menu.x + menu.width, `scene menu at ${width}px`).toBeLessThanOrEqual(edge)
      expect(historyBox.y, `history shares the menu's line at ${width}px`).toBeLessThan(
        menu.y + menu.height,
      )
      await openMenuFor(page, 'manuscript-edit-scene')
      await expect(page.getByTestId('manuscript-edit-scene')).toHaveAccessibleName('Edit scene')
      await expect(page.getByTestId('manuscript-show-scene')).toHaveAccessibleName('Show in Scenes')
      await page.keyboard.press('Escape')

      // The writing dominates: even under a long chapter and a long scene title, a real stretch of prose is on the first
      // screen between the top of the sheet and the bar holding Save - measured, not an exact height, because fonts
      // differ between machines. (Design refactor 001 measured about 210px of it on a 390px phone.)
      const editorBox = (await editor.boundingBox())!
      await editor.focus()
      const save = (await page.getByTestId('manuscript-save').boundingBox())!
      expect(save.y - editorBox.y, `first-screen prose at ${width}px`).toBeGreaterThanOrEqual(300)

      if (colorScheme === 'dark') {
        const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
        expect(ground, `dark ground at ${width}px`).toBe('rgb(21, 22, 23)')
      }
    }
  })
})
