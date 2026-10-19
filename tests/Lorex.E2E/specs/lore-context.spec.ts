import { expect, test, type Browser, type Page } from '@playwright/test'
import { PASSWORD, post, unique } from './support/trash'

/**
 * Lore Context (task 048): the manuscript's Lore drawer. Each test builds its own account and universe.
 *
 * The invariants under test: the drawer opens over the writing and never touches it - unsaved prose, its selection and
 * its leave question survive opening, closing, linking and unlinking; the scene's links are the real `SceneEntityLinks`,
 * saved through the scene's own versioned save and read back after a reload; a stale save is refused rather than
 * written over someone else's change; and a collaborator who only reads is shown no way to change anything.
 */

const Role = { Viewer: 1 } as const

async function signUp(page: Page) {
  const username = unique('lorectx')
  const email = `${username}@example.test`
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return email
}

interface World {
  universeId: string
  storyId: string
  sceneId: string
  akron: string
  mira: string
}

/** A universe with a story of one scene linked to Akron, and Mira - summary, alias, a relation - not linked yet. */
async function world(page: Page): Promise<World> {
  const universeId = await post(page, '/api/universes', {
    name: unique('Context World '),
    description: null,
    accentColor: null,
  })
  const u = `/api/universes/${universeId}`
  const types = (await (await page.request.get(`${u}/entity-types`)).json()) as {
    id: string
    name: string
  }[]
  const character = types.find((type) => type.name === 'Character')!.id
  const entry = (name: string, summary: string | null, aliases: string[] = []) =>
    post(page, `${u}/entities`, {
      entityTypeId: character,
      name,
      summary,
      canonStatus: 0,
      aliases,
      tags: [],
      fields: [],
    })

  const akron = await entry('Akron Vale', 'A ferryman who never crosses back.')
  const mira = await entry('Mira Holt', 'The lighthouse keeper of the north shore.', ['The Keeper'])
  const kind = await post(page, `${u}/relationship-types`, {
    name: 'mentors',
    inverseName: 'is mentored by',
    isSymmetric: false,
    description: null,
    displayOrder: null,
    canonConstraints: null,
    familySemantic: 0,
  })
  await post(page, `${u}/relationships`, {
    relationshipTypeId: kind,
    sourceEntityId: mira,
    targetEntityId: akron,
    canonStatus: 0,
    startDate: null,
    endDate: null,
    notes: null,
  })

  const storyId = await post(page, `${u}/stories`, {
    title: 'Tidewater',
    premise: null,
    status: 1,
  })
  const sceneId = await post(page, `${u}/stories/${storyId}/scenes`, {
    title: 'The Crossing',
    summary: 'Kept as it is.',
    notes: 'Notes stay too.',
    povEntityId: null,
    chronology: null,
    entityIds: [akron],
    chapterId: null,
  })

  return { universeId, storyId, sceneId, akron, mira }
}

function scenePath(w: World) {
  return `/api/universes/${w.universeId}/stories/${w.storyId}/scenes/${w.sceneId}`
}

async function readScene(page: Page, w: World) {
  const response = await page.request.get(scenePath(w))
  expect(response.status()).toBe(200)
  return (await response.json()) as {
    title: string
    summary: string | null
    notes: string | null
    version: number
    entities: { entityId: string; name: string }[]
  }
}

async function openManuscript(page: Page, w: World) {
  await page.goto(`/app/universes/${w.universeId}/stories/${w.storyId}/manuscript/${w.sceneId}`)
  await expect(page.getByTestId('manuscript-editor')).toBeEditable()
}

test.describe('Lore Context', () => {
  test('opens over unsaved prose, previews, links and unlinks, and the prose stays exactly as it was', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await openManuscript(page, w)

    // Unsaved prose with a selection in it.
    const editor = page.getByTestId('manuscript-editor')
    await editor.fill('The ferry left at dawn.')
    await editor.evaluate((box: HTMLTextAreaElement) => box.setSelectionRange(4, 9))
    await expect(page.getByTestId('manuscript-save')).toBeEnabled()

    // Closed by default; opened from the manuscript's tools.
    const drawer = page.getByTestId('lore-context')
    await expect(drawer).toHaveCount(0)
    const trigger = page.getByTestId('lore-context-trigger')
    await trigger.click()
    await expect(drawer).toBeVisible()
    await expect(drawer.getByRole('heading', { name: 'The Crossing' })).toBeVisible()

    // The scene's linked lore, at once.
    const linked = drawer.getByTestId('lore-context-linked')
    await expect(linked).toHaveCount(1)
    await expect(linked).toContainText('Akron Vale')
    await expect(linked).toContainText('Character')

    // Search finds Mira by her alias; preview her without leaving.
    await drawer.getByTestId('lore-context-search').fill('Keeper')
    const result = drawer.getByTestId('lore-context-result').filter({ hasText: 'Mira Holt' })
    await expect(result).toBeVisible()
    await result.getByTestId('lore-context-preview').click()
    const preview = drawer.getByTestId('lore-preview')
    await expect(preview.getByTestId('lore-preview-name')).toHaveText('Mira Holt')
    await expect(preview.getByTestId('lore-preview-summary')).toHaveText(
      'The lighthouse keeper of the north shore.',
    )
    await expect(preview.getByTestId('lore-preview-facts')).toContainText('The Keeper')
    await expect(preview.getByTestId('lore-preview-relations')).toContainText('mentors Akron Vale')
    await expect(preview.getByTestId('lore-preview-open')).toHaveAttribute(
      'href',
      `/app/universes/${w.universeId}/lore/${w.mira}`,
    )

    // Link from the preview: saved, and the scene's other fields untouched.
    const before = await readScene(page, w)
    await preview.getByTestId('lore-preview-link').click()
    await expect(preview.getByTestId('lore-preview-unlink')).toBeVisible()
    const after = await readScene(page, w)
    expect(after.entities.map((e) => e.entityId).sort()).toEqual([w.akron, w.mira].sort())
    expect(after.version).toBe(before.version + 1)
    expect(after.summary).toBe('Kept as it is.')
    expect(after.notes).toBe('Notes stay too.')

    // Back to the list, focus where it was: both linked, and the result now offers Unlink, not a second link.
    await preview.getByTestId('lore-preview-back').click()
    await expect(result.getByTestId('lore-context-preview')).toBeFocused()
    await expect(linked).toHaveCount(2)
    await expect(result.getByTestId('lore-context-unlink')).toBeVisible()

    // Unlink Akron from the list.
    await linked.filter({ hasText: 'Akron Vale' }).getByTestId('lore-context-unlink').click()
    await expect(linked).toHaveCount(1)
    await expect(linked).toContainText('Mira Holt')
    expect((await readScene(page, w)).entities.map((e) => e.entityId)).toEqual([w.mira])

    // Close: focus back on Lore, the prose and its selection as they were, still unsaved and never saved.
    await drawer.getByTestId('lore-context-close').click()
    await expect(drawer).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(editor).toHaveValue('The ferry left at dawn.')
    expect(
      await editor.evaluate((box: HTMLTextAreaElement) => [box.selectionStart, box.selectionEnd]),
    ).toEqual([4, 9])
    await expect(page.getByTestId('manuscript-save')).toBeEnabled()
    await expect(page.getByTestId('manuscript-lore')).toContainText('Mira Holt')
    await expect(page.getByTestId('manuscript-lore')).not.toContainText('Akron Vale')
    const manuscript = await page.request.get(`${scenePath(w)}/manuscript`)
    expect((await manuscript.json()).content).toBe('')

    // Ctrl+S still saves the prose, and a reload shows the links as stored.
    await editor.focus()
    await page.keyboard.press('Control+s')
    await expect(page.getByTestId('manuscript-status')).toHaveText('Saved')
    await page.reload()
    await expect(page.getByTestId('manuscript-editor')).toHaveValue('The ferry left at dawn.')
    await page.getByTestId('lore-context-trigger').click()
    await expect(drawer.getByTestId('lore-context-linked')).toHaveCount(1)
    await expect(drawer.getByTestId('lore-context-linked')).toContainText('Mira Holt')
  })

  test('the leave question still stands when the preview opens the full entry', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await openManuscript(page, w)
    await page.getByTestId('manuscript-editor').fill('Not saved yet.')

    await page.getByTestId('lore-context-trigger').click()
    const drawer = page.getByTestId('lore-context')
    await drawer.getByTestId('lore-context-linked').getByTestId('lore-context-preview').click()

    // Staying keeps the drawer, the page and the prose.
    page.once('dialog', (dialog) => void dialog.dismiss())
    await drawer.getByTestId('lore-preview-open').click()
    await expect(page).toHaveURL(/\/manuscript\//)
    await expect(page.getByTestId('manuscript-editor')).toHaveValue('Not saved yet.')

    page.once('dialog', (dialog) => void dialog.accept())
    await drawer.getByTestId('lore-preview-open').click()
    await expect(page).toHaveURL(new RegExp(`/lore/${w.akron}$`))
  })

  test('a scene saved elsewhere since it opened is not written over, and a failed save shows nothing as linked', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await openManuscript(page, w)
    await page.getByTestId('manuscript-editor').fill('Draft in progress.')

    await page.getByTestId('lore-context-trigger').click()
    const drawer = page.getByTestId('lore-context')
    await drawer.getByTestId('lore-context-search').fill('Mira')
    const result = drawer.getByTestId('lore-context-result').filter({ hasText: 'Mira Holt' })
    await expect(result).toBeVisible()

    // Another window renames the scene.
    const stored = await readScene(page, w)
    const renamed = await page.request.put(scenePath(w), {
      data: {
        title: 'The Crossing, revised',
        summary: stored.summary,
        notes: stored.notes,
        povEntityId: null,
        chronology: null,
        entityIds: [w.akron],
        chapterId: null,
        expectedVersion: stored.version,
      },
    })
    expect(renamed.status()).toBe(200)

    await result.getByTestId('lore-context-link').click()
    await expect(drawer.getByTestId('lore-context-error')).toContainText(
      'This scene was changed somewhere else',
    )
    const refused = await readScene(page, w)
    expect(refused.title).toBe('The Crossing, revised')
    expect(refused.entities.map((e) => e.entityId)).toEqual([w.akron])

    // The page read the scene again, so trying once more lands over the latest.
    await expect(drawer.getByRole('heading', { name: 'The Crossing, revised' })).toBeVisible()
    await result.getByTestId('lore-context-link').click()
    await expect(result.getByTestId('lore-context-unlink')).toBeVisible()
    const linked = await readScene(page, w)
    expect(linked.title).toBe('The Crossing, revised')
    expect(linked.entities.map((e) => e.entityId).sort()).toEqual([w.akron, w.mira].sort())

    // A save that fails outright changes nothing on screen.
    await page.route(`**${scenePath(w)}`, (route) =>
      route.request().method() === 'PUT' ? route.fulfill({ status: 500 }) : route.continue(),
    )
    await drawer
      .getByTestId('lore-context-linked')
      .filter({ hasText: 'Mira Holt' })
      .getByTestId('lore-context-unlink')
      .click()
    await expect(drawer.getByTestId('lore-context-error')).toHaveText(
      'That didn’t save. Try again.',
    )
    await expect(drawer.getByTestId('lore-context-linked')).toHaveCount(2)
    await expect(page.getByTestId('manuscript-editor')).toHaveValue('Draft in progress.')
  })

  test('search and preview work from the keyboard, and Escape closes', async ({ page }) => {
    await signUp(page)
    const w = await world(page)
    await openManuscript(page, w)

    await page.getByTestId('lore-context-trigger').focus()
    await page.keyboard.press('Enter')
    const drawer = page.getByTestId('lore-context')
    const search = drawer.getByTestId('lore-context-search')
    await expect(search).toBeFocused()

    await page.keyboard.type('Mira')
    await expect(drawer.getByTestId('lore-context-result')).toHaveCount(1)
    await page.keyboard.press('ArrowDown')
    const name = drawer.getByTestId('lore-context-result').getByTestId('lore-context-preview')
    await expect(name).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(search).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(drawer.getByTestId('lore-preview-back')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(name).toBeFocused()

    await drawer.getByTestId('lore-context-search').fill('nothing like this')
    await expect(drawer.getByTestId('lore-context-no-results')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(drawer).toHaveCount(0)
    await expect(page.getByTestId('lore-context-trigger')).toBeFocused()
  })

  test('a Viewer reads and previews the scene’s lore and is offered no way to change it', async ({
    page,
    browser,
  }) => {
    await signUp(page)
    const w = await world(page)
    const viewer = await member(browser)
    const invitation = await post(page, `/api/universes/${w.universeId}/invitations`, {
      email: viewer.email,
      role: Role.Viewer,
    })
    expect((await viewer.page.request.post(`/api/invitations/${invitation}/accept`)).ok()).toBe(
      true,
    )

    await viewer.page.goto(
      `/app/universes/${w.universeId}/stories/${w.storyId}/manuscript/${w.sceneId}`,
    )
    await viewer.page.getByTestId('lore-context-trigger').click()
    const drawer = viewer.page.getByTestId('lore-context')
    await expect(drawer.getByTestId('lore-context-linked')).toContainText('Akron Vale')
    await drawer.getByTestId('lore-context-search').fill('Mira')
    await expect(drawer.getByTestId('lore-context-result')).toHaveCount(1)
    await expect(drawer.getByTestId('lore-context-link')).toHaveCount(0)
    await expect(drawer.getByTestId('lore-context-unlink')).toHaveCount(0)
    await drawer.getByTestId('lore-context-result').getByTestId('lore-context-preview').click()
    await expect(drawer.getByTestId('lore-preview-name')).toHaveText('Mira Holt')
    await expect(drawer.getByTestId('lore-preview-link')).toHaveCount(0)

    // The API refuses the save the drawer never offers.
    const stored = await readScene(page, w)
    const refused = await viewer.page.request.put(scenePath(w), {
      data: {
        title: stored.title,
        summary: stored.summary,
        notes: stored.notes,
        povEntityId: null,
        chronology: null,
        entityIds: [w.akron, w.mira],
        chapterId: null,
        expectedVersion: stored.version,
      },
    })
    expect(refused.status()).toBe(403)

    // Someone outside the universe reads none of it.
    const outsider = await member(browser)
    expect((await outsider.page.request.get(scenePath(w))).status()).toBe(404)
    expect(
      (
        await outsider.page.request.get(`/api/universes/${w.universeId}/entities?search=Mira`)
      ).status(),
    ).toBe(404)
    await viewer.context.close()
    await outsider.context.close()
  })

  test('on a phone the drawer is a full-width sheet over the prose, and closing keeps the prose', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signUp(page)
    const w = await world(page)
    await openManuscript(page, w)
    await page.getByTestId('manuscript-editor').fill('Written on the train.')

    const trigger = page.getByTestId('lore-context-trigger')
    await expect(trigger).toHaveAccessibleName('Lore')
    const box = await trigger.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(32)
    await trigger.click()

    const drawer = page.getByTestId('lore-context')
    const sheet = await drawer.boundingBox()
    expect(Math.round(sheet!.width)).toBe(390)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBe(0)
    await expect(drawer.getByTestId('lore-context-linked')).toContainText('Akron Vale')
    await drawer.getByTestId('lore-context-close').click()
    await expect(drawer).toHaveCount(0)
    await expect(page.getByTestId('manuscript-editor')).toHaveValue('Written on the train.')
  })
})

async function member(browser: Browser) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const email = await signUp(page)
  return { context, page, email }
}
