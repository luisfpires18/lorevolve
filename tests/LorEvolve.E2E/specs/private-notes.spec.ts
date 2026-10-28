import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { invite, PASSWORD, post, unique } from './support/trash'

/**
 * Issue 23: the owner's private note on an entry, as two people in their own browsers. The API's rules are proved by its own
 * tests; this proves what each person sees: the owner writes a note that survives a reload, nothing is read until the drawer
 * opens, a save over a newer note is refused with the text kept, and an Editor is offered nothing and refused at the API.
 */

interface Person {
  context: BrowserContext
  page: Page
  username: string
  email: string
}

async function person(browser: Browser, prefix: string): Promise<Person> {
  const context = await browser.newContext()
  const page = await context.newPage()
  const username = unique(prefix)
  const email = `${username}@example.test`
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return { context, page, username, email }
}

async function world(owner: Page) {
  const universeId = await post(owner, '/api/universes', {
    name: unique('Noted World '),
    description: null,
    accentColor: null,
  })
  const types = (await (
    await owner.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string }[]
  const entryId = await post(owner, `/api/universes/${universeId}/entities`, {
    entityTypeId: types.find((type) => type.name === 'Character')!.id,
    name: 'Ember Vale',
    summary: 'The drowned heir.',
    canonStatus: 2,
    aliases: [],
    tags: [],
    fields: [],
  })
  return { universeId, entryId }
}

/** Every finished read of a note the page completes, so a test can say none happens before the drawer opens. */
function watchNoteReads(page: Page) {
  const reads: string[] = []
  page.on('requestfinished', (request) => {
    if (request.method() === 'GET' && new URL(request.url()).pathname.endsWith('/private-note')) {
      reads.push(request.url())
    }
  })
  return reads
}

const drawer = (page: Page) => page.getByTestId('private-note-drawer')

async function openNote(page: Page) {
  await page.getByTestId('private-note-trigger').click()
  await expect(drawer(page)).toBeVisible()
  await expect(drawer(page).getByTestId('private-note-text')).toBeVisible()
}

test.describe('private author notes', () => {
  test('the owner writes a note that survives a reload, and a stale save is refused with the text kept', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const owner = await person(browser, 'noteowner')
    const { universeId, entryId } = await world(owner.page)
    const entryPage = `/app/universes/${universeId}/lore/${entryId}`
    const secret = `Secretly-${unique('reveal')}`

    const reads = watchNoteReads(owner.page)
    await owner.page.goto(entryPage)
    await expect(owner.page.getByTestId('entry-name')).toHaveText('Ember Vale')
    const trigger = owner.page.getByTestId('private-note-trigger')
    await expect(trigger).toHaveAccessibleName('Private note')
    expect(reads).toHaveLength(0)

    await openNote(owner.page)
    await expect.poll(() => reads.length).toBe(1)
    await expect(drawer(owner.page).getByRole('heading', { name: 'Ember Vale' })).toBeVisible()
    await expect(drawer(owner.page).getByTestId('private-note-status')).toHaveText(
      'Nothing saved yet',
    )

    await drawer(owner.page).getByTestId('private-note-text').fill(`${secret} is the heir's twin.`)
    await drawer(owner.page).getByTestId('private-note-save').click()
    await expect(drawer(owner.page).getByTestId('private-note-status')).toContainText('Saved')

    // Closing an unchanged drawer asks nothing; the note is there after a reload.
    await drawer(owner.page).getByTestId('private-note-close').click()
    await expect(drawer(owner.page)).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await owner.page.reload()
    await expect(owner.page.getByTestId('entry-name')).toHaveText('Ember Vale')
    await openNote(owner.page)
    await expect(drawer(owner.page).getByTestId('private-note-text')).toHaveValue(
      `${secret} is the heir's twin.`,
    )

    // The note reaches no other read: not the entry, not Lore's search, not the universe search.
    const entry = await (
      await owner.page.request.get(`/api/universes/${universeId}/entities/${entryId}`)
    ).text()
    expect(entry).not.toContain(secret)
    const lore = (await (
      await owner.page.request.get(
        `/api/universes/${universeId}/entities?search=${encodeURIComponent(secret)}`,
      )
    ).json()) as { totalCount: number }
    expect(lore.totalCount).toBe(0)
    const everywhere = await (
      await owner.page.request.get(
        `/api/universes/${universeId}/search?q=${encodeURIComponent(secret)}`,
      )
    ).text()
    expect(everywhere).not.toContain(secret)

    // Saved somewhere else meanwhile: the save is refused, the text stays, the latest is reviewed, and keeping saves again.
    await drawer(owner.page).getByTestId('private-note-text').fill(`${secret}: rewrite this.`)
    const elsewhere = await owner.page.request.put(
      `/api/universes/${universeId}/entities/${entryId}/private-note`,
      { data: { content: 'Changed in another window.', expectedVersion: 1 } },
    )
    expect(elsewhere.ok()).toBe(true)
    await drawer(owner.page).getByTestId('private-note-save').click()
    await expect(drawer(owner.page).getByTestId('private-note-conflict')).toBeVisible()
    await expect(drawer(owner.page).getByTestId('private-note-text')).toHaveValue(
      `${secret}: rewrite this.`,
    )
    await drawer(owner.page).getByRole('button', { name: 'Review the latest version' }).click()
    await expect(drawer(owner.page).getByText('Changed in another window.')).toBeVisible()
    await drawer(owner.page).getByRole('button', { name: 'Keep my changes' }).click()
    await drawer(owner.page).getByTestId('private-note-save').click()
    await expect(drawer(owner.page).getByTestId('private-note-status')).toContainText('Saved')
    const latest = (await (
      await owner.page.request.get(`/api/universes/${universeId}/entities/${entryId}/private-note`)
    ).json()) as { content: string; version: number }
    expect(latest.content).toBe(`${secret}: rewrite this.`)
    expect(latest.version).toBe(3)

    await owner.context.close()
  })

  test('an Editor is offered no note and refused at the API, and the owner has it on a phone', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const owner = await person(browser, 'noteowner')
    const editor = await person(browser, 'noteeditor')
    const { universeId, entryId } = await world(owner.page)
    await invite(
      owner.page,
      editor.page,
      `/api/universes/${universeId}/invitations`,
      editor.email,
      3,
    )
    const entryPage = `/app/universes/${universeId}/lore/${entryId}`

    const put = await owner.page.request.put(
      `/api/universes/${universeId}/entities/${entryId}/private-note`,
      { data: { content: 'Owner only.', expectedVersion: 0 } },
    )
    expect(put.ok()).toBe(true)

    // The Editor can edit the entry and sees Review, but no note and no way to ask for one.
    const editorReads = watchNoteReads(editor.page)
    await editor.page.goto(entryPage)
    await expect(editor.page.getByTestId('entry-name')).toHaveText('Ember Vale')
    await expect(editor.page.getByTestId('comments-trigger')).toBeVisible()
    await expect(editor.page.getByTestId('private-note-trigger')).toHaveCount(0)
    expect(editorReads).toHaveLength(0)
    const refused = await editor.page.request.get(
      `/api/universes/${universeId}/entities/${entryId}/private-note`,
    )
    expect(refused.status()).toBe(403)
    expect(await refused.text()).not.toContain('Owner only.')

    // The owner on a phone: the trigger is an icon with its name, the drawer takes the width, the note is readable.
    await owner.page.setViewportSize({ width: 390, height: 844 })
    await owner.page.goto(entryPage)
    const trigger = owner.page.getByTestId('private-note-trigger')
    await expect(trigger).toHaveAccessibleName('Private note')
    await expect(trigger.locator('.entry__toollabel')).not.toBeInViewport()
    await openNote(owner.page)
    await expect(drawer(owner.page).getByTestId('private-note-text')).toHaveValue('Owner only.')
    const box = await drawer(owner.page).locator('.drawer__panel').boundingBox()
    expect(box?.width).toBeGreaterThan(380)
    await drawer(owner.page).getByTestId('private-note-close').click()
    await expect(drawer(owner.page)).toHaveCount(0)

    await owner.context.close()
    await editor.context.close()
  })
})
