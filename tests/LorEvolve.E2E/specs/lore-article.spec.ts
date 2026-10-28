import { expect, test, type Page } from '@playwright/test'
import { chooseLoreType } from './support/lore'
import { clickSignOut } from './support/account'
import { acceptConfirm, answerConfirms, dismissConfirm } from './support/confirm'

/**
 * An entry's article, end to end: the long-form prose an author writes about a piece of lore, on the entry itself. Each
 * test registers its own account and builds its own universe, so nothing depends on data another test left behind.
 *
 * The invariants under test throughout: the article is written on the entry, with no other object to create; it saves
 * explicitly and comes back as written; a structured edit leaves it alone; search finds its words and says so; it keeps
 * its own history; nothing unsaved is left behind without asking; and a failed, stale or orphaned save never replaces
 * what the author has on screen.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('scribe')
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

/** A Tiptap document, one paragraph per argument - the shape the editor writes. */
function doc(...paragraphs: string[]) {
  return JSON.stringify({
    type: 'doc',
    content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
  })
}

function articlePath(universeId: string, entityId: string) {
  return `/api/universes/${universeId}/entities/${entityId}/article`
}

/** The article as the API holds it, read straight from its own route. */
async function readArticle(page: Page, universeId: string, entityId: string) {
  const response = await page.request.get(articlePath(universeId, entityId))
  expect(response.status()).toBe(200)
  return (await response.json()) as { content: string; updatedAt: string | null; version: number }
}

/** Saves an article straight through the API, as another window or device would, over whatever is stored now. */
async function writeArticle(page: Page, universeId: string, entityId: string, content: string) {
  const current = await readArticle(page, universeId, entityId)
  const saved = await page.request.put(articlePath(universeId, entityId), {
    data: { content, expectedVersion: current.version },
  })
  expect(saved.status()).toBe(200)
}

/** Saves through the page and waits until the API has confirmed it and the page says so - not only for the press. */
async function saveWith(page: Page, action: () => Promise<void>) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/article') &&
        response.request().method() === 'PUT' &&
        response.ok(),
    ),
    action(),
  ])
  await expect(page.getByTestId('article-status')).toHaveText('Saved')
}

/** Puts the caret at the end of the article and types there. */
async function typeAtEnd(page: Page, text: string) {
  await page.getByTestId('lore-editor').focus()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(text)
}

/** Whether the page can be scrolled sideways, which no screen in LorEvolve may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

test.describe('lore article', () => {
  test('an author writes an entry article, saves it by button and keyboard, and it survives reloads, structured edits, search and its own history', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Article Reach '))
    const entityId = await seedEntity(page, universeId, 'Alenna Vance')
    const entryUrl = `/app/universes/${universeId}/lore/${entityId}`

    const article = page.getByTestId('article')
    const editor = page.getByTestId('lore-editor')
    const status = page.getByTestId('article-status')
    const save = page.getByTestId('article-save')

    // An existing entry, with no article yet: one way to begin, and nothing else to create or choose.
    await page.goto(entryUrl)
    await expect(page.getByTestId('entry-name')).toHaveText('Alenna Vance')
    await expect(page.getByTestId('article-empty')).toContainText('No article yet.')

    await page.getByTestId('article-write').click()
    await expect(editor).toBeFocused()
    await expect(status).toHaveText('Nothing saved yet')
    await expect(save).toBeDisabled()

    // While the article is written, the entry's own actions step aside for its save bar.
    await expect(page.getByTestId('edit-entity')).toHaveCount(0)

    await page.keyboard.type(
      'She kept the tide ledger by hand, and never once missed a turn of the Halloway tide.',
    )
    await expect(status).toHaveText('Unsaved changes')
    await saveWith(page, () => save.click())
    await expect(save).toBeDisabled()
    expect((await readArticle(page, universeId, entityId)).content).toContain('Halloway tide.')

    // Save let go of the focus when it disabled itself; it goes back to the writing, so typing simply carries on.
    await expect(editor).toBeFocused()
    await page.keyboard.type(' Still writing.')
    await expect(status).toHaveText('Unsaved changes')
    await saveWith(page, () => page.keyboard.press('ControlOrMeta+s'))

    // Read back after a reload.
    await page.reload()
    await expect(article.getByTestId('lore-article')).toContainText('never once missed a turn')

    // Opened again, added to, and saved from the keyboard; Done returns the focus to where writing began.
    await page.getByTestId('article-edit').click()
    await expect(editor).toBeFocused()
    await page.keyboard.type(' The ledger outlived her.')
    await saveWith(page, () => page.keyboard.press('ControlOrMeta+s'))
    await page.getByTestId('article-done').click()
    await expect(page.getByTestId('article-edit')).toBeFocused()
    await expect(article.getByTestId('lore-article')).toContainText('The ledger outlived her.')
    await expect(page.getByTestId('edit-entity')).toBeVisible()

    // The entry's structured edit leaves the article exactly as it was, and one editor is open at a time.
    const before = await readArticle(page, universeId, entityId)
    await page.getByTestId('edit-entity').click()
    // The form takes the page while it is open, so the article's own editor cannot be started beside it.
    await expect(page.getByTestId('entry-form')).toBeVisible()
    await expect(page.getByTestId('article-edit')).toHaveCount(0)
    await page.getByLabel('Summary').fill('Warden of the drowned coast.')
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-summary')).toContainText('drowned coast')
    expect(await readArticle(page, universeId, entityId)).toEqual(before)

    // The entry's versions are their own view, and say so: the article's history is not in them.
    await page.getByTestId('entry-view-history').click()
    await expect(page.getByTestId('history-article-note')).toContainText('its own history')
    await expect(page.getByTestId('article-history-toggle')).toHaveCount(0)
    await page.getByTestId('entry-view-article').click()

    // Search finds a word only the article holds, and says where it was found.
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await chooseLoreType(page, 'Character')
    await page.getByLabel('Filter entries').fill('Halloway')
    const card = page.locator('[data-testid="entity-card"][data-entity-name="Alenna Vance"]')
    const excerpt = card.getByTestId('entity-excerpt')
    await expect(excerpt).toContainText('In the article')
    await expect(excerpt.locator('mark')).toHaveText('Halloway')

    // The article's own history: a version per save, the first read in place and put back as the newest.
    await card.click()
    await page.waitForURL(new RegExp(`/lore/${entityId}$`))
    await page.getByTestId('article-history-toggle').click()
    const versions = page.getByTestId('article-history-list').locator('li')
    await expect(versions).toHaveCount(3)

    const first = page.locator('[data-testid="article-history-list"] [data-version="1"]')
    await expect(first).toContainText('First version')
    await first.getByTestId('article-version-view').click()
    const snapshot = first.getByTestId('article-version-snapshot')
    await expect(snapshot).toContainText('Halloway tide.')
    await expect(snapshot).not.toContainText('Still writing')
    await expect(snapshot).not.toContainText('outlived')

    await first.getByTestId('article-version-restore').click()
    await acceptConfirm(page)
    await expect(versions).toHaveCount(4)
    await expect(
      page.locator('[data-testid="article-history-list"] [data-version="4"]'),
    ).toContainText('Restored version 1')
    await expect(article.getByTestId('lore-article')).not.toContainText('outlived')
    expect((await readArticle(page, universeId, entityId)).content).not.toContain('outlived')
  })

  test('nothing unsaved in an article is left behind without asking, and a failed, stale or orphaned save keeps the text', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Unsaved Article '))
    const entityId = await seedEntity(page, universeId, 'Gatewarden')
    await writeArticle(page, universeId, entityId, doc('Saved words.'))

    const entryUrl = new RegExp(`/lore/${entityId}$`)
    const editor = page.getByTestId('lore-editor')
    const status = page.getByTestId('article-status')
    const save = page.getByTestId('article-save')
    const conflict = page.getByTestId('article-conflict')

    await page.goto(`/app/universes/${universeId}/lore/${entityId}`)
    await expect(page.getByTestId('article').getByTestId('lore-article')).toHaveText('Saved words.')
    await page.getByTestId('article-edit').click()
    await expect(editor).toBeFocused()
    await page.keyboard.type(' And more.')
    await expect(status).toHaveText('Unsaved changes')

    // Following a link asks, naming the entry; staying keeps the address and the text.
    await page.locator('.entry__crumbs').getByRole('link', { name: 'Lore' }).click()
    await dismissConfirm(page, '“Gatewarden” has unsaved changes')
    await expect(page).toHaveURL(entryUrl)
    await expect(editor).toContainText('Saved words. And more.')

    // So does signing out.
    await clickSignOut(page)
    await dismissConfirm(page)
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(entryUrl)
    await expect(editor).toContainText('Saved words. And more.')

    // And closing the article with Done.
    await page.getByTestId('article-done').click()
    await dismissConfirm(page)
    await expect(editor).toContainText('Saved words. And more.')

    // A save the server fails changes nothing on screen, says so, and can be tried again.
    await page.route('**/article', (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' })
        : route.continue(),
    )
    await save.click()
    await expect(page.getByTestId('article-error')).toContainText('could not be saved')
    await expect(editor).toContainText('Saved words. And more.')
    await expect(status).toHaveText('Unsaved changes')
    expect((await readArticle(page, universeId, entityId)).content).toBe(doc('Saved words.'))
    await page.unroute('**/article')

    await saveWith(page, () => page.keyboard.press('ControlOrMeta+s'))
    await expect(page.getByTestId('article-error')).toHaveCount(0)
    expect((await readArticle(page, universeId, entityId)).content).toContain('And more.')

    // Another window saves while this one is writing. This save is refused, and nothing is lost either way.
    await typeAtEnd(page, ' Mine.')
    await writeArticle(page, universeId, entityId, doc('Written in another window.'))
    await save.click()
    await expect(conflict).toBeVisible()
    await expect(editor).toContainText('And more. Mine.')
    await expect(status).toHaveText('Unsaved changes')
    expect((await readArticle(page, universeId, entityId)).content).toBe(
      doc('Written in another window.'),
    )

    // The author reviews the latest first, then keeps their own and saves it deliberately.
    await conflict.getByTestId('article-conflict-review').click()
    await expect(conflict.getByTestId('conflict-latest-text')).toContainText(
      'Written in another window.',
    )
    await conflict.getByTestId('article-conflict-keep').click()
    await expect(conflict).toHaveCount(0)
    await expect(editor).toContainText('And more. Mine.')
    await expect(status).toHaveText('Unsaved changes')
    await saveWith(page, () => save.click())
    expect((await readArticle(page, universeId, entityId)).content).toContain('Mine.')

    // Or takes the other one - once they confirm it.
    await typeAtEnd(page, ' Again.')
    await writeArticle(page, universeId, entityId, doc('Theirs again.'))
    await save.click()
    await expect(conflict).toBeVisible()
    await conflict.getByTestId('article-conflict-review').click()
    await conflict.getByTestId('article-conflict-use-latest').click()
    await acceptConfirm(page)
    await expect(editor).toHaveText('Theirs again.')
    await expect(status).toHaveText('Saved')
    await expect(conflict).toHaveCount(0)

    // The entry goes to the Trash from another window: a save says so, and the text stays to be copied.
    await typeAtEnd(page, ' Orphaned.')
    expect(
      (await page.request.delete(`/api/universes/${universeId}/entities/${entityId}`)).status(),
    ).toBe(204)
    await save.click()
    await expect(page.getByTestId('article-error')).toContainText('no longer here')
    await expect(editor).toContainText('Theirs again. Orphaned.')
    await expect(status).toHaveText('Unsaved changes')

    // Closing the tab with unsaved text asks too.
    const prompt = page.waitForEvent('dialog')
    await page.close({ runBeforeUnload: true })
    const dialog = await prompt
    expect(dialog.type()).toBe('beforeunload')
    await dialog.accept()
  })

  test('the browser Back and Forward buttons ask once before unsaved article text is left, and a saved article moves freely', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('History Article '))
    const entityId = await seedEntity(page, universeId, 'Wayfarer')
    await writeArticle(page, universeId, entityId, doc('Saved words.'))

    const loreUrl = new RegExp(`/universes/${universeId}/lore([?]type=[0-9a-f-]+)?$`)
    const entryUrl = new RegExp(`/lore/${entityId}$`)
    const article = page.getByTestId('article')
    const editor = page.getByTestId('lore-editor')
    const status = page.getByTestId('article-status')
    const crumb = page.locator('.entry__crumbs').getByRole('link', { name: 'Lore' })

    // Every question the page asks is counted and answered as the step says.
    const questions: string[] = []
    let answer: 'stay' | 'leave' = 'stay'
    await answerConfirms(page, () => answer === 'leave', questions)

    // In-app history: the Lore browser, then the entry, reached by its card.
    await page.goto(`/app/universes/${universeId}/lore`)
    await chooseLoreType(page, 'Character')
    await page.locator('[data-testid="entity-card"][data-entity-name="Wayfarer"]').click()
    await page.waitForURL(entryUrl)
    await expect(article.getByTestId('lore-article')).toHaveText('Saved words.')

    // Nothing unsaved: Back and Forward simply move, and nothing asks.
    await page.goBack()
    await page.waitForURL(loreUrl)
    await page.goForward()
    await page.waitForURL(entryUrl)
    await expect(article.getByTestId('lore-article')).toHaveText('Saved words.')

    // With a page ahead of the entry in the history too, so Forward has somewhere to go.
    await crumb.click()
    await page.waitForURL(loreUrl)
    await page.goBack()
    await page.waitForURL(entryUrl)
    await expect.poll(() => questions).toEqual([])

    await page.getByTestId('article-edit').click()
    await expect(editor).toBeFocused()
    await page.keyboard.type(' And more.')
    await expect(status).toHaveText('Unsaved changes')

    // Back, and stay: asked once, still on the entry, still writing, the text intact and still editable.
    await page.goBack()
    await expect.poll(() => questions.length).toBe(1)
    await expect.poll(() => questions[0]).toContain('“Wayfarer” has unsaved changes')
    await expect(page).toHaveURL(entryUrl)
    await expect(article).toHaveAttribute('data-state', 'editing')
    await expect(editor).toHaveText('Saved words. And more.')
    await expect(status).toHaveText('Unsaved changes')
    await typeAtEnd(page, ' Still here.')
    await expect(editor).toHaveText('Saved words. And more. Still here.')

    // Forward, and stay: the same.
    await page.goForward()
    await expect.poll(() => questions.length).toBe(2)
    await expect(page).toHaveURL(entryUrl)
    await expect(editor).toHaveText('Saved words. And more. Still here.')

    // A link still asks exactly once - its own question, not a second one from the history guard.
    await crumb.click()
    await expect.poll(() => questions.length).toBe(3)
    await expect(page).toHaveURL(entryUrl)
    await expect(editor).toHaveText('Saved words. And more. Still here.')

    // Forward, and leave: the move is held, asked about and then made, and the unsaved text was never saved. The address
    // changes as the move is held and again as it is made, so what is waited for is the question and the page arrived at.
    answer = 'leave'
    await page.goForward()
    await expect.poll(() => questions.length).toBe(4)
    await expect(page.getByTestId('entity-grid')).toBeVisible()
    await expect(page).toHaveURL(loreUrl)
    expect((await readArticle(page, universeId, entityId)).content).toBe(doc('Saved words.'))

    // Back to a saved article asks nothing, and shows what is saved.
    await page.goBack()
    await page.waitForURL(entryUrl)
    await expect(article.getByTestId('lore-article')).toHaveText('Saved words.')
    await expect.poll(() => questions).toHaveLength(4)

    // Back, and leave, from unsaved text again: one question, and the Lore browser.
    await page.getByTestId('article-edit').click()
    await expect(editor).toBeFocused()
    await page.keyboard.type(' Dropped.')
    await expect(status).toHaveText('Unsaved changes')
    await page.goBack()
    await expect.poll(() => questions.length).toBe(5)
    await expect(page.getByTestId('entity-grid')).toBeVisible()
    await expect(page).toHaveURL(loreUrl)
    expect((await readArticle(page, universeId, entityId)).content).toBe(doc('Saved words.'))

    // Saved and gone: history keeps moving without a question.
    await page.goForward()
    await page.waitForURL(entryUrl)
    await expect(article.getByTestId('lore-article')).toHaveText('Saved words.')
    await page.goBack()
    await page.waitForURL(loreUrl)
    await expect(page.getByTestId('entity-grid')).toBeVisible()
    await expect.poll(() => questions).toHaveLength(5)
  })

  test('the article reads and writes from a phone to a wide desktop, light and dark', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Wide Article '))
    const entityId = await seedEntity(
      page,
      universeId,
      'An entry whose name runs on for rather longer than any name should',
    )

    const paragraph =
      'The hall had emptied long before Arlen understood why Mira would not meet his eyes, and by then the lamps were guttering and the rain had found every gap in the old roof.'
    await writeArticle(
      page,
      universeId,
      entityId,
      doc(
        `https://example.test/${'unbroken'.repeat(24)}`,
        ...Array.from({ length: 60 }, (_, index) => `Paragraph ${index + 1}. ${paragraph}`),
      ),
    )

    const entryUrl = `/app/universes/${universeId}/lore/${entityId}`

    for (const [width, colorScheme] of [
      [390, 'dark'],
      [768, 'light'],
      [1440, 'light'],
      [1920, 'dark'],
    ] as const) {
      // Layout boxes come back in fractional pixels; a hair over the edge is rounding, not overflow.
      const edge = width + 1

      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width, height: 900 })
      await page.goto(entryUrl)

      const body = page.getByTestId('article').getByTestId('lore-article')
      await expect(body).toContainText('Paragraph 60.')
      expect(await scrollsSideways(page), `article at ${width}px`).toBe(false)
      const bodyBox = (await body.boundingBox())!
      expect(bodyBox.x + bodyBox.width, `article body at ${width}px`).toBeLessThanOrEqual(edge)

      if (colorScheme === 'dark') {
        const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
        expect(ground, `dark ground at ${width}px`).toBe('rgb(21, 22, 23)')
      }

      // Writing: the surface keeps a useful height, the tools and the save bar stay on screen, nothing overflows.
      await page.getByTestId('article-edit').click()
      const editor = page.getByTestId('lore-editor')
      await expect(editor).toBeFocused()
      expect(await scrollsSideways(page), `writing at ${width}px`).toBe(false)

      const editorBox = (await editor.boundingBox())!
      expect(editorBox.x + editorBox.width, `editor at ${width}px`).toBeLessThanOrEqual(edge)
      expect(editorBox.height, `editor height at ${width}px`).toBeGreaterThanOrEqual(250)

      for (const tool of await page
        .getByRole('toolbar', { name: 'Formatting' })
        .getByRole('button')
        .all()) {
        const box = (await tool.boundingBox())!
        expect(box.x + box.width, `toolbar at ${width}px`).toBeLessThanOrEqual(edge)
      }

      for (const control of ['article-save', 'article-done', 'article-status']) {
        const locator = page.getByTestId(control)
        await expect(locator, `${control} at ${width}px`).toBeInViewport()
        const box = (await locator.boundingBox())!
        expect(box.x + box.width, `${control} at ${width}px`).toBeLessThanOrEqual(edge)
      }

      await expect(page.getByTestId('edit-entity')).toHaveCount(0)
      await page.getByTestId('article-done').click()
      await expect(page.getByTestId('edit-entity')).toBeVisible()
    }
  })
})
