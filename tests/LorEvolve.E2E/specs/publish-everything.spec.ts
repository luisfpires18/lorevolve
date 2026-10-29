import { expect, test, type Page } from '@playwright/test'
import { png } from './support/png'

/**
 * Publish everything, on a public universe's Publish page. The API's rule - Canon lore and Complete stories with their
 * scenes, nothing else, only adding - is settled by `PublishEverythingTests`; what only a browser can show is here: the
 * confirmation naming every entry and story and the story it skips, the result in words, the counts read again, a second
 * run saying there is nothing new, and the panel at phone width.
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
}

async function api<T>(page: Page, method: string, path: string, data?: object) {
  const response = await page.request.fetch(path, { method, data })
  expect(response.ok(), `${method} ${path}`).toBe(true)
  return (response.status() === 204 ? null : await response.json()) as T
}

/** A public universe holding Canon and Draft lore, a Complete story with a scene, and stories it must leave alone. */
async function world(page: Page) {
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
  await api(page, 'POST', `/api/universes/${id}/publish`)

  const types = (await api<{ id: string }[]>(page, 'GET', `/api/universes/${id}/entity-types`))!
  for (const [name, canonStatus] of [
    ['Tide keeper', 2],
    ['Salt widow', 2],
    ['Half a rumour', 1],
  ] as const) {
    await api(page, 'POST', `/api/universes/${id}/entities`, {
      entityTypeId: types[0].id,
      name,
      summary: null,
      canonStatus,
      aliases: [],
      tags: [],
      fields: [],
    })
  }

  const stories = `/api/universes/${id}/stories`
  const story = async (title: string, status: number, summary: string | null) => {
    const storyId = (await api<{ id: string }>(page, 'POST', stories, {
      title,
      premise: null,
      status,
    }))!.id
    if (summary)
      await api(page, 'PUT', `${stories}/${storyId}/publication`, { publicSummary: summary })
    return storyId
  }
  const complete = await story('The Long Ebb', 2, 'For readers: the ebb.')
  const scene = (await api<{ id: string }>(page, 'POST', `${stories}/${complete}/scenes`, {
    title: 'Low water',
    summary: 'The sea goes out.',
    notes: null,
  }))!.id
  await api(page, 'PUT', `${stories}/${complete}/scenes/${scene}/manuscript`, {
    content: 'The sea went out and kept going.',
    expectedVersion: 0,
  })
  await story('Still drafting', 1, 'For readers: not yet.')
  await story('No summary yet', 2, null)
  return id
}

test('publish everything names what goes public, then publishes only that', async ({ page }) => {
  await signUp(page)
  const id = await world(page)
  await page.goto(`/app/universes/${id}/publish`)

  const panel = page.getByTestId('publish-everything')
  await panel.getByTestId('publish-everything-open').click()

  const confirm = page.getByTestId('publish-everything-confirm')
  await expect(confirm).toBeFocused()
  await expect(confirm.getByTestId('publish-everything-entry')).toHaveText([
    /Salt widow/,
    /Tide keeper/,
  ])
  await expect(confirm.getByTestId('publish-everything-story')).toHaveText([
    /The Long Ebb · 1 scene and their text/,
  ])
  await expect(confirm.getByTestId('publish-everything-skipped')).toContainText('No summary yet')
  await expect(confirm).not.toContainText('Half a rumour')
  await expect(confirm).not.toContainText('Still drafting')

  await confirm.getByTestId('publish-everything-confirm-button').click()
  await expect(page.getByTestId('publish-everything-done')).toHaveText(
    'Published 2 lore entries, 1 story and 1 scene.',
  )
  await expect(page.getByTestId('published-lore')).toHaveText('2 public')
  await expect(page.getByTestId('published-stories')).toHaveText('1 public')

  // Run again: nothing new, and only a Close.
  await panel.getByTestId('publish-everything-open').click()
  await expect(confirm.getByRole('heading')).toHaveText('Nothing new to publish')
  await expect(confirm.getByTestId('publish-everything-confirm-button')).toHaveCount(0)
  await confirm.getByRole('button', { name: 'Close' }).click()
  await expect(confirm).toHaveCount(0)
})

test('the publish everything confirmation fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signUp(page)
  const id = await world(page)
  await page.goto(`/app/universes/${id}/publish`)

  await page.getByTestId('publish-everything-open').click()
  await expect(page.getByTestId('publish-everything-confirm')).toBeVisible()
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})
