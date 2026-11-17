import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #297: Comic Volumes. A Manga project's Volume collects its chapters by reference on the project page: rename,
 * add, reorder, reload, open, remove and delete, and the chapters stay in the outline throughout.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('vol')
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
    data: {
      name,
      kind: 4,
      lifecycle: 0,
      subtype: null,
      summary: null,
      universeId,
      format,
    },
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
    .locator('li.projectcard', { hasText: name })
  const testId = await card.getAttribute('data-testid')
  return testId!.replace('comic-collection-', '')
}

async function add(page: Page, collectionId: string, label: string) {
  await page.getByTestId(`comic-collection-actions-${collectionId}`).click()
  await page.getByTestId(`comic-collection-entry-new-${collectionId}`).click()
  await page.getByTestId('comic-entry-drawer-node').selectOption({ label })
  await page.getByTestId('comic-entry-drawer-save').click()
  await expect(page.getByTestId('comic-entry-drawer')).toHaveCount(0)
}

test('a volume collects the chapters of a manga in an order that persists and leaves them in the outline', async ({
  page,
}) => {
  await signUp(page)
  const response = await page.request.post('/api/universes', {
    data: { name: unique('Volworld '), description: null },
  })
  const world = (await response.json()) as { id: string }
  const manga = await comic(page, world.id, 'Manga', 'manga')
  const one = await node(page, manga, 'chapter', 'Chapter one')
  const two = await node(page, manga, 'chapter', 'Chapter two')
  await node(page, manga, 'chapter', 'Chapter three')

  await page.goto(`/app/universes/${world.id}/projects/${manga}/structure`)
  await expect(page.getByTestId('comic-collections')).toBeVisible()
  const volume = await collection(page, 'volume', 'Volume')

  await page.getByTestId(`comic-collection-actions-${volume}`).click()
  await page.getByTestId(`comic-collection-edit-${volume}`).click()
  await page.getByTestId('comic-collection-drawer-name').fill('First volume')
  await page.getByTestId('comic-collection-drawer-save').click()
  await expect(page.getByTestId(`comic-collection-${volume}`)).toContainText('First volume')

  await add(page, volume, 'Manga - chapter Chapter one')
  await add(page, volume, 'Manga - chapter Chapter two')
  const entries = page.getByTestId(`comic-collection-${volume}`).locator('li.fieldlist__row')
  await page.getByTestId(`comic-entry-actions-${volume}-${two}`).click()
  await page.getByTestId(`comic-entry-${volume}-${two}-up`).click()
  await page.reload()
  await expect(entries).toHaveText([/Chapter two/, /Chapter one/])

  await page.getByTestId(`comic-entry-actions-${volume}-${one}`).click()
  await page.getByTestId(`comic-entry-remove-${volume}-${one}`).click()
  await expect(entries).toHaveText([/Chapter two/])

  // Volumes stay off the universe's arcs and events list.
  await page.goto(`/app/universes/${world.id}/comic`)
  await page.getByTestId('comic-view-collections').click()
  await expect(page.getByTestId('comic-collections')).toBeVisible()
  await expect(page.getByText('First volume')).toHaveCount(0)

  await page.goto(`/app/universes/${world.id}/projects/${manga}/structure`)
  await page.getByTestId(`comic-entry-link-${volume}-${two}`).click()
  await expect(page).toHaveURL(new RegExp(`${manga}/structure\?node=${two}`))
  await expect(page.locator('#project-node-editor-title')).toHaveText('Chapter two')

  await page.getByTestId(`comic-collection-actions-${volume}`).click()
  await page.getByTestId(`comic-collection-delete-${volume}`).click()
  await page.getByRole('button', { name: 'Delete' }).last().click()
  await expect(page.getByTestId(`comic-collection-${volume}`)).toHaveCount(0)
  const tree = await page.request.get(`/api/projects/${manga}/structure`)
  expect(JSON.stringify(await tree.json())).toContain('Chapter three')
  expect(JSON.stringify(await tree.json())).toContain('Chapter one')
})
