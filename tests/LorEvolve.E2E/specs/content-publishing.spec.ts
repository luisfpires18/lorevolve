import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { png } from './support/png'
import { confirmDialog } from './support/confirm'

/**
 * Public portal 010: a lore entry or a story is private until its owner publishes it, publishing a universe publishes
 * none of them, and a private universe hides every one it holds without forgetting which were chosen (ADR 0036). The
 * API's promises - the four combinations, the allow-lists, the thumbnail, the Trash, backups - are settled by
 * `ContentPublicationTests` and its neighbours; what only a browser can show is here: the state said in a word on the
 * entry and the story, the panel that explains it and is the confirmation, the universe's part always spelled out, a
 * stranger kept out, no leave prompt left behind, and all of it on a phone.
 *
 * Every test builds its own account and universe. "Anonymous" is Playwright's own request context, which shares no
 * cookie with the page.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('curator')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return username
}

async function api<T>(page: Page, method: string, path: string, data?: object) {
  const response = await page.request.fetch(path, { method, data })
  expect(response.ok(), `${method} ${path}`).toBe(true)
  return (response.status() === 204 ? null : await response.json()) as T
}

/** A universe with everything publishing needs, published or not. Returns its id and, once published, its address. */
async function world(page: Page, publish: boolean) {
  const id = (await api<{ id: string }>(page, 'POST', '/api/universes', {
    name: unique('Tidewater '),
    description: null,
  }))!.id
  await api(page, 'PUT', `/api/universes/${id}/publication`, {
    publicSummary: 'A drowned coast where the tide keeps count.',
    category: 4,
    genres: [1],
  })
  const artwork = await page.request.put(`/api/universes/${id}/artwork`, {
    multipart: {
      file: { name: 'art.png', mimeType: 'image/png', buffer: png(800, 500, () => [40, 70, 180]) },
    },
  })
  expect(artwork.ok()).toBe(true)
  await api(page, 'PUT', '/api/profile/public-name', { publicDisplayName: 'Ione Marsh' })
  const slug = publish
    ? (await api<{ publicSlug: string }>(page, 'POST', `/api/universes/${id}/publish`))!.publicSlug
    : null
  return { id, slug }
}

async function entry(page: Page, universeId: string, name: string) {
  const types = (await api<{ id: string }[]>(
    page,
    'GET',
    `/api/universes/${universeId}/entity-types`,
  ))!
  return (await api<{ id: string }>(page, 'POST', `/api/universes/${universeId}/entities`, {
    entityTypeId: types[0].id,
    name,
    summary: 'Keeper of the count.',
    canonStatus: 1,
    aliases: [],
    tags: [],
    fields: [],
  }))!.id
}

async function story(page: Page, universeId: string, title: string) {
  return (await api<{ id: string }>(page, 'POST', `/api/universes/${universeId}/stories`, {
    title,
    premise: 'Private premise: the narrator lies.',
    status: 1,
  }))!.id
}

/** What anyone reads of a universe's published entries or stories; null when the universe itself is not public. */
async function listed(anonymous: APIRequestContext, slug: string, kind: 'lore' | 'stories') {
  const response = await anonymous.get(`/api/public/universes/${slug}/${kind}`)
  if (response.status() === 404) return null
  expect(response.ok()).toBe(true)
  const page = (await response.json()) as { items: { name?: string; title?: string }[] }
  return page.items.map((item) => item.name ?? item.title)
}

function dialogs(page: Page) {
  const asked: string[] = []
  page.on('dialog', (dialog) => {
    asked.push(dialog.message())
    void dialog.dismiss()
  })
  return asked
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

async function stranger(browser: Browser) {
  const context = await browser.newContext()
  return { context, page: await context.newPage() }
}

test.describe('publishing lore and stories', () => {
  test('an entry starts private in a public universe, is published from its page, and the universe decides who sees it', async ({
    page,
    request: anonymous,
  }) => {
    await signUp(page)
    const asked = dialogs(page)
    const universe = await world(page, true)
    const name = unique('Tidewarden ')
    const id = await entry(page, universe.id, name)

    // Publishing the universe published nothing inside it.
    expect(await listed(anonymous, universe.slug!, 'lore')).toEqual([])

    await page.goto(`/app/universes/${universe.id}/lore/${id}`)
    const pill = page.getByTestId('entry-publication')
    await expect(page.getByTestId('entry-publication-state')).toHaveText('Private')
    await expect(pill).toHaveAccessibleName('Publication: Private')

    // Opening it is the confirmation: what gets listed, what stays private, and the verb.
    await pill.click()
    const panel = page.getByTestId('entry-publication-panel')
    await expect(panel).toContainText(
      'Publishing this lore entry makes it available in your public universe.',
    )
    await expect(panel).toContainText('Readers see its name, type, summary, picture and article.')
    await expect(panel).toContainText(
      'Its fields, aliases, tags, relationships and history are not published.',
    )
    await expect(page.getByTestId('publish-entry')).toBeFocused()
    await page.getByTestId('publish-entry').click()

    await expect(page.getByTestId('entry-publication-state')).toHaveText('Public')
    await expect(pill).toBeFocused()
    await expect(page.getByTestId('entry-publication-announcer')).toContainText(
      'Published. It is listed in your public universe.',
    )
    expect(await listed(anonymous, universe.slug!, 'lore')).toEqual([name])

    // The universe made private: gone for anyone, still chosen - and a private universe's entry offers no pill (Issue
    // #47), while Edit stays where it was.
    await api(page, 'POST', `/api/universes/${universe.id}/unpublish`)
    expect(await listed(anonymous, universe.slug!, 'lore')).toBeNull()
    await page.reload()
    await expect(page.getByTestId('edit-entity')).toBeVisible()
    await expect(pill).toHaveCount(0)

    // Published again from the Publish page: its confirmation names the entry still chosen, and exactly it comes back.
    await page.goto(`/app/universes/${universe.id}/publish`)
    await page.getByTestId('publish').click()
    await expect(page.getByTestId('publish-confirm-selected-entry')).toHaveText([
      new RegExp(`^${name} · `),
    ])
    await page.getByTestId('confirm-publish').click()
    await expect(page.getByTestId('publication-status')).toContainText('Public')
    expect(await listed(anonymous, universe.slug!, 'lore')).toEqual([name])
    await page.goto(`/app/universes/${universe.id}/lore/${id}`)
    await expect(page.getByTestId('entry-publication-state')).toHaveText('Public')

    // Made private from its page: gone at the next read.
    await pill.click()
    await page.getByTestId('unpublish-entry').click()
    await expect(page.getByTestId('entry-publication-state')).toHaveText('Private')
    expect(await listed(anonymous, universe.slug!, 'lore')).toEqual([])

    // Nothing about publishing is unsaved work: leaving asks nothing.
    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Lore' })
      .click()
    await page.waitForURL(new RegExp(`/app/universes/${universe.id}/lore[?]type=[0-9a-f-]+$`))
    expect(asked).toEqual([])
    await expect(confirmDialog(page)).toHaveCount(0)
  })

  test('a story is chosen while its universe is private, stays hidden, and appears when the universe is published', async ({
    page,
    request: anonymous,
  }) => {
    await signUp(page)
    const asked = dialogs(page)
    const universe = await world(page, false)
    const title = unique('The Long Ebb ')
    const id = await story(page, universe.id, title)

    await page.goto(`/app/universes/${universe.id}/stories/${id}`)
    const pill = page.getByTestId('story-publication')
    await expect(page.getByTestId('story-publication-state')).toHaveText('Private')

    // A story needs a public summary before it can be published (Task 011); the premise never stands in for it.
    await pill.click()
    const panel = page.getByTestId('story-publication-panel')
    await expect(panel).toContainText(
      'A story needs a public summary, written for readers, before it can be published.',
    )
    await expect(panel).toContainText(
      'Its premise, chapters and notes are not published, nor any scene, prose or arc you have not published.',
    )
    await expect(page.getByTestId('publish-story')).toBeDisabled()
    await page.getByTestId('edit-story-public-summary').click()
    await page
      .getByTestId('story-public-summary-input')
      .fill('Told for readers: a tide that counts.')
    await page.getByTestId('save-story-public-summary').click()
    await expect(page.getByTestId('story-public-summary-form')).toHaveCount(0)

    await pill.click()
    await expect(panel).toContainText(
      'Your universe is private. Publishing selects this story: it remains hidden while the universe is private.',
    )
    await expect(page.getByTestId('story-public-summary')).toContainText(
      'Told for readers: a tide that counts.',
    )
    await page.getByTestId('publish-story').click()
    await expect(page.getByTestId('story-publication-state')).toHaveText('Selected')
    await expect(page.getByTestId('story-publication-announcer')).toContainText(
      'Selected for publication. It stays hidden while the universe is private.',
    )

    // Choosing the story did not publish the universe.
    const state = await api<{ visibility: number; universeIsPublic: boolean }>(
      page,
      'GET',
      `/api/universes/${universe.id}/stories/${id}/publication`,
    )
    expect(state).toMatchObject({ visibility: 1, universeIsPublic: false })
    expect(
      (await api<{ visibility: number }>(page, 'GET', `/api/universes/${universe.id}/publication`))!
        .visibility,
    ).toBe(0)

    const slug = (await api<{ publicSlug: string }>(
      page,
      'POST',
      `/api/universes/${universe.id}/publish`,
    ))!.publicSlug
    const read = await anonymous.get(`/api/public/universes/${slug}/stories`)
    const body = await read.text()
    expect(
      (JSON.parse(body) as { items: { title: string }[] }).items.map((item) => item.title),
    ).toEqual([title])
    expect(body).not.toContain('narrator lies')

    await page.reload()
    await expect(page.getByTestId('story-publication-state')).toHaveText('Public')
    await pill.click()
    await expect(panel).toContainText('This story is selected for your public universe.')
    await page.getByTestId('unpublish-story').click()
    await expect(page.getByTestId('story-publication-state')).toHaveText('Private')
    expect(await listed(anonymous, slug, 'stories')).toEqual([])

    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Stories' })
      .click()
    await page.waitForURL(`/app/universes/${universe.id}/stories`)
    expect(asked).toEqual([])
    await expect(confirmDialog(page)).toHaveCount(0)
  })

  test('publishing a world first names the entries it makes public, and neither answer changes what was chosen', async ({
    page,
    request: anonymous,
  }) => {
    await signUp(page)
    const universe = await world(page, false)
    const ash = await entry(page, universe.id, 'Ash Warden')
    const brine = await entry(page, universe.id, 'Brine Oracle')
    const unchosen = await entry(page, universe.id, 'Unchosen Seer')
    for (const id of [ash, brine]) {
      await api(page, 'POST', `/api/universes/${universe.id}/entities/${id}/publish`)
    }
    const selections = () =>
      Promise.all(
        [ash, brine, unchosen].map(
          async (id) =>
            (await api<{ visibility: number }>(
              page,
              'GET',
              `/api/universes/${universe.id}/entities/${id}/publication`,
            ))!.visibility,
        ),
      )

    // The confirmation reads them fresh and names each with its type: the two chosen, not the third (Issue #47).
    await page.goto(`/app/universes/${universe.id}/publish`)
    await page.getByTestId('publish').click()
    const confirm = page.getByTestId('publish-confirm')
    await expect(confirm.getByTestId('publish-confirm-selected-lore')).toContainText(
      'the 2 lore entries you selected for publication earlier.',
    )
    await expect(confirm.getByTestId('publish-confirm-selected-entry')).toHaveText([
      /^Ash Warden · \S/,
      /^Brine Oracle · \S/,
    ])
    await expect(confirm).not.toContainText('Unchosen Seer')

    // Keep private: nothing published, nothing rewritten.
    await confirm.getByRole('button', { name: 'Keep private' }).click()
    await expect(confirm).toHaveCount(0)
    expect(await selections()).toEqual([1, 1, 0])
    expect(
      (await api<{ visibility: number }>(page, 'GET', `/api/universes/${universe.id}/publication`))!
        .visibility,
    ).toBe(0)

    // Publish world: readers find exactly the entries it named, and every choice is as it was.
    await page.getByTestId('publish').click()
    await page.getByTestId('confirm-publish').click()
    await expect(page.getByTestId('publication-status')).toContainText('Public')
    const slug = (await api<{ publicSlug: string }>(
      page,
      'GET',
      `/api/universes/${universe.id}/publication`,
    ))!.publicSlug
    expect(await listed(anonymous, slug, 'lore')).toEqual(['Ash Warden', 'Brine Oracle'])
    expect(await selections()).toEqual([1, 1, 0])
  })

  test('another account can neither read nor change what an owner publishes', async ({
    page,
    browser,
    request: anonymous,
  }) => {
    await signUp(page)
    const universe = await world(page, true)
    const entryId = await entry(page, universe.id, unique('Owned '))
    const storyId = await story(page, universe.id, unique('Owned tale '))

    const other = await stranger(browser)
    const username = unique('intruder')
    const registered = await other.context.request.post('/api/auth/register', {
      data: { username, email: `${username}@example.test`, password: PASSWORD },
    })
    expect(registered.ok()).toBe(true)

    for (const path of [
      `/api/universes/${universe.id}/entities/${entryId}`,
      `/api/universes/${universe.id}/stories/${storyId}`,
    ]) {
      expect((await other.context.request.get(`${path}/publication`)).status()).toBe(404)
      expect((await other.context.request.post(`${path}/publish`)).status()).toBe(404)
      expect((await anonymous.post(`${path}/publish`)).status()).toBe(401)
    }

    // Its page is not theirs either: the entry is simply not there.
    await other.page.goto(`/app/universes/${universe.id}/lore/${entryId}`)
    await expect(other.page.getByTestId('entry-publication')).toHaveCount(0)
    await other.context.close()

    expect(await listed(anonymous, universe.slug!, 'lore')).toEqual([])
    expect(await listed(anonymous, universe.slug!, 'stories')).toEqual([])
  })

  test('a private universe offers no entry pill on any width, keeps the tools on one line, and a public one does', async ({
    page,
  }) => {
    await signUp(page)
    const universe = await world(page, false)
    const entryId = await entry(page, universe.id, unique('Quiet warden '))

    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(`/app/universes/${universe.id}/lore/${entryId}`)
      const edit = page.getByTestId('edit-entity')
      await expect(edit).toBeVisible()
      await expect(page.getByTestId('entry-publication')).toHaveCount(0)
      // Edit leads the tools: no space is kept where the pill would be.
      const tools = (await page.locator('.entry__tools').boundingBox())!
      expect(Math.abs((await edit.boundingBox())!.x - tools.x)).toBeLessThan(1)
      await noSidewaysScroll(page)
    }

    await api(page, 'POST', `/api/universes/${universe.id}/publish`)
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(`/app/universes/${universe.id}/lore/${entryId}`)
      await expect(page.getByTestId('entry-publication-state')).toHaveText('Private')
      const [pill, edit] = [page.getByTestId('entry-publication'), page.getByTestId('edit-entity')]
      // Pill and Edit share one line.
      expect(Math.abs((await pill.boundingBox())!.y - (await edit.boundingBox())!.y)).toBeLessThan(
        8,
      )
      await noSidewaysScroll(page)
    }
  })

  test('on a phone: the state reads, the panel fits, and publishing works by keyboard', async ({
    page,
    request: anonymous,
  }) => {
    await signUp(page)
    const universe = await world(page, true)
    const name = 'حارس المد'
    const entryId = await entry(page, universe.id, name)
    const storyId = await story(page, universe.id, 'מדינת המלח — The Salt Kingdom 1847')

    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 800 })

      await page.goto(`/app/universes/${universe.id}/lore/${entryId}`)
      const pill = page.getByTestId('entry-publication')
      await expect(pill).toBeVisible()
      await pill.focus()
      await page.keyboard.press('Enter')
      const panel = page.getByTestId('entry-publication-panel')
      await expect(panel).toBeVisible()
      const box = (await panel.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      await noSidewaysScroll(page)
      await page.keyboard.press('Escape')

      await page.goto(`/app/universes/${universe.id}/stories/${storyId}`)
      await page.getByTestId('story-publication').click()
      const storyBox = (await page.getByTestId('story-publication-panel').boundingBox())!
      expect(storyBox.x + storyBox.width).toBeLessThanOrEqual(width)
      await noSidewaysScroll(page)
      await page.keyboard.press('Escape')
    }

    // Published from the phone, by keyboard alone; the name is listed exactly as written.
    await page.goto(`/app/universes/${universe.id}/lore/${entryId}`)
    await page.getByTestId('entry-publication').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('publish-entry')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('entry-publication-state')).toHaveText('Public')
    expect(await listed(anonymous, universe.slug!, 'lore')).toEqual([name])
  })

  test('the portal still lets a reader sign in from a public world and come back to it', async ({
    page,
    browser,
  }) => {
    await signUp(page)
    const universe = await world(page, true)
    const id = await entry(page, universe.id, unique('Doorward '))
    await api(page, 'POST', `/api/universes/${universe.id}/entities/${id}/publish`)

    const visitor = await stranger(browser)
    const username = unique('reader')
    expect(
      (
        await visitor.context.request.post('/api/auth/register', {
          data: { username, email: `${username}@example.test`, password: PASSWORD },
        })
      ).ok(),
    ).toBe(true)
    await visitor.context.clearCookies()

    await visitor.page.goto(`/worlds/${universe.slug}`)
    await expect(visitor.page.getByTestId('public-world')).toBeVisible()
    await visitor.page.getByTestId('portal-login').click()
    await expect(visitor.page).toHaveURL(/\/login$/)
    await visitor.page.getByLabel('Username or email').fill(username)
    await visitor.page.getByLabel('Password').fill(PASSWORD)
    await visitor.page.getByRole('button', { name: 'Sign in' }).click()
    await visitor.page.waitForURL(`/worlds/${universe.slug}`)
    await visitor.page.getByTestId('portal-workspace').click()
    await visitor.page.waitForURL('/app')
    await visitor.context.close()
  })
})
