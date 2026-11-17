import { expect, test, type Page } from '@playwright/test'

/**
 * Issues #288 and #293: Cinema and Comic production formats. Each Film, Series and Comic format is chosen on the new project form, persists across
 * a reload, and shows on the Projects list and the project's overview.
 */

const PASSWORD = 'Test-password-123!'

const FORMATS = [
  { kind: '3', id: 'feature-film', label: 'Feature Film / Movie' },
  { kind: '3', id: 'short-film', label: 'Short Film' },
  { kind: '3', id: 'special', label: 'Special' },
  { kind: '3', id: 'trailer', label: 'Trailer' },
  { kind: '2', id: 'tv-show', label: 'TV Show' },
  { kind: '2', id: 'limited-series', label: 'Limited Series' },
  { kind: '4', id: 'western-comic', label: 'Western Comic' },
  { kind: '4', id: 'manga', label: 'Manga' },
  { kind: '4', id: 'graphic-novel', label: 'Graphic Novel' },
  { kind: '4', id: 'one-shot', label: 'One-shot' },
  { kind: '4', id: 'webcomic', label: 'Webcomic / Webtoon' },
]

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('cinfmt')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

test('each Cinema and Comic format is chosen, kept after a reload, and drawn on the list and overview', async ({
  page,
}) => {
  await signUp(page)
  const response = await page.request.post('/api/universes', {
    data: { name: unique('Formatworld '), description: null },
  })
  expect(response.ok()).toBe(true)
  const world = (await response.json()) as { id: string }

  for (const format of FORMATS) {
    const name = unique(`${format.id} `)
    await page.goto(`/app/projects/new?universeId=${world.id}`)
    await page.getByTestId('project-new-name').fill(name)
    await page.getByTestId('project-new-kind').selectOption(format.kind)
    await page.getByTestId('project-new-format').selectOption(format.id)
    await page.getByTestId('project-new-save').click()

    await expect(page.getByTestId('project-name')).toContainText(name)
    await page.reload()
    await expect(page.getByTestId('project-format')).toHaveText(format.label)

    await page.goto('/app/projects')
    const row = page.getByTestId('projects-item').filter({ hasText: name })
    await expect(row.getByTestId('project-row-format')).toHaveText(format.label)
  }
})

test('a project of another kind has no format choice', async ({ page }) => {
  await signUp(page)
  const response = await page.request.post('/api/universes', {
    data: { name: unique('Formatworld '), description: null },
  })
  const world = (await response.json()) as { id: string }
  await page.goto(`/app/projects/new?universeId=${world.id}`)
  await page.getByTestId('project-new-kind').selectOption('1')
  await expect(page.getByTestId('project-new-format')).toHaveCount(0)
})
