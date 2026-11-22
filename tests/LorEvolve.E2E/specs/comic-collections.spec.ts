import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #296: Comic Story Arcs and Events. An Event lists a Western Comic issue and a Manga chapter in an order that
 * survives a reload, the same issue sits in a Story Arc too, removing an entry leaves the issue, and an entry opens
 * the original node in its project.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('arc')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function comic(page: Page, universeId: string, name: string, format: string) {
  const response = await page.request.post('/api/projects', {
    data: { name, kind: 4, lifecycle: 0, subtype: null, summary: null, universeId, format },
  })
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { id: string }).id
}

async function node(page: Page, projectId: string, level: string, title: string) {
  const response = await page.request.post(`/api/projects/${projectId}/structure`, {
    data: { level, title },
  })
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { id: string }).id
}

async function collection(page: Page, kind: string, name: string) {
  await page.getByTestId(`comic-collection-add-${kind}`).click()
  await page.getByTestId('comic-collection-drawer-name').fill(name)
  await page.getByTestId('comic-collection-drawer-save').click()
  await expect(page.getByTestId('comic-collection-drawer')).toHaveCount(0)
  const card = page
    .getByTestId(`comic-collections-${kind}`)
    .locator('li[data-testid^="comic-collection-"]', { hasText: name })
  const testId = await card.getAttribute('data-testid')
  return testId!.replace('comic-collection-', '')
}

async function add(page: Page, collectionId: string, label: string) {
  await page.getByTestId(`comic-collection-entry-new-${collectionId}`).click()
  await page.getByTestId('comic-entry-drawer-node').selectOption({ label })
  await page.getByTestId('comic-entry-drawer-save').click()
  await expect(page.getByTestId('comic-entry-drawer')).toHaveCount(0)
}

test('an event spans two comics in an order that persists, and an entry opens the original node', async ({
  page,
}) => {
  await signUp(page)
  const response = await page.request.post('/api/universes', {
    data: { name: unique('Arcworld '), description: null },
  })
  const world = (await response.json()) as { id: string }
  const western = await comic(page, world.id, 'Western', 'western-comic')
  const manga = await comic(page, world.id, 'Manga', 'manga')
  const issue = await node(page, western, 'issue', 'First issue')
  const chapter = await node(page, manga, 'chapter', 'First chapter')

  await page.goto(`/app/universes/${world.id}/comic`)
  await page.getByTestId('comic-view-collections').click()
  await expect(page.getByTestId('comic-collections')).toBeVisible()

  const event = await collection(page, 'event', 'Crossover')
  await add(page, event, 'Western - issue First issue')
  await add(page, event, 'Manga - chapter First chapter')

  const entries = page
    .getByTestId(`comic-collection-${event}`)
    .locator('li[data-testid^="comic-entry-"]')
  await expect(entries).toHaveText([/First issue/, /First chapter/])

  await page.getByTestId(`comic-entry-actions-${event}-${chapter}`).click()
  await page.getByTestId(`comic-entry-${event}-${chapter}-up`).click()
  // Wait for the move to land before reloading, or the reload can race it.
  await expect(entries).toHaveText([/First chapter/, /First issue/])
  await page.reload()
  await expect(entries).toHaveText([/First chapter/, /First issue/])

  // The same issue in a story arc too; unlinking it from the event leaves it in the arc and in its comic.
  const arc = await collection(page, 'story-arc', 'Arc')
  await add(page, arc, 'Western - issue First issue')
  await page.getByTestId(`comic-entry-actions-${event}-${issue}`).click()
  await page.getByTestId(`comic-entry-remove-${event}-${issue}`).click()
  await expect(entries).toHaveText([/First chapter/])
  await page.reload()
  await expect(page.getByTestId(`comic-entry-${arc}-${issue}`)).toBeVisible()

  await page.getByTestId(`comic-entry-link-${arc}-${issue}`).click()
  await expect(page).toHaveURL(new RegExp(`${western}/structure\\?node=${issue}`))
  await expect(page.getByTestId('project-node-editor')).toBeVisible()
  await expect(page.locator('#project-node-editor-title')).toHaveText('First issue')
})
