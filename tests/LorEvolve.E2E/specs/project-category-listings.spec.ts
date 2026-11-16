import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #276: each Creation category (Writing, Gaming, Cinema, Comic) lists only its own kinds from its own universe.
 * Kind travels as a number: 0 Writing, 1 Game, 2 Series, 3 Film, 4 Comic.
 */

const PASSWORD = 'Test-password-123!'
const WRITING = 0
const GAME = 1
const SERIES = 2
const FILM = 3
const COMIC = 4

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('category')
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
  return (await response.json()) as T
}

async function universe(page: Page) {
  return (
    await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Categoryworld '),
      description: null,
    })
  ).id
}

async function project(page: Page, universeId: string, name: string, kind: number) {
  return (
    await api<{ id: string }>(page, 'POST', '/api/projects', {
      name,
      kind,
      lifecycle: 0,
      subtype: null,
      summary: '',
      universeId,
      expectedVersion: null,
    })
  ).id
}

async function listed(page: Page, universeId: string, category: string) {
  await page.goto(`/app/universes/${universeId}/${category}`)
  await expect(page.getByTestId('projects-page')).toBeVisible()
  return page.getByTestId('projects-item')
}

/** Writing is the Stories experience (#277): its projects are `writing-project-row` links, not `projects-item` rows. */
async function writingRows(page: Page, universeId: string) {
  await page.goto(`/app/universes/${universeId}/writing`)
  await expect(page.getByTestId('writing-project-list')).toBeVisible()
  return page.getByTestId('writing-project-row')
}

async function ids(items: ReturnType<Page['getByTestId']>) {
  return (
    await items.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-project-id')))
  ).sort()
}

test.describe('Project listings by category', () => {
  test('each category lists its own kinds, separates same-name projects and leaves other universes out', async ({
    page,
  }) => {
    await signUp(page)
    const a = await universe(page)
    const b = await universe(page)
    const writing = await project(page, a, 'Writing one', WRITING)
    const game = await project(page, a, 'Game one', GAME)
    const comic = await project(page, a, 'Comic one', COMIC)
    const film = await project(page, a, 'Twin', FILM)
    const series = await project(page, a, 'Twin', SERIES)
    const otherWriting = await project(page, b, 'Other writing', WRITING)
    const otherFilm = await project(page, b, 'Other film', FILM)

    const writingRowsA = await writingRows(page, a)
    await expect(writingRowsA).toHaveCount(1)
    await expect(writingRowsA.getByRole('link')).toHaveAttribute('href', new RegExp(writing))
    expect(await ids(await listed(page, a, 'gaming'))).toEqual([game])
    expect(await ids(await listed(page, a, 'comic'))).toEqual([comic])

    const cinema = await listed(page, a, 'cinema')
    expect(await ids(cinema)).toEqual([film, series].sort())
    expect(await ids(cinema)).not.toContain(otherFilm)
    await writingRows(page, a)
    await expect(page.getByTestId('writing-project-list')).not.toContainText('Other writing')
    await expect(page.locator(`a[href*="${otherWriting}"]`)).toHaveCount(0)

    // Same name stays two rows, told apart by kind.
    await listed(page, a, 'cinema')
    await expect(page.locator(`[data-project-id="${film}"]`)).toHaveAttribute(
      'data-kind',
      `${FILM}`,
    )
    await expect(page.locator(`[data-project-id="${film}"] .storyrow__meta`)).toContainText('Film')
    await expect(page.locator(`[data-project-id="${series}"]`)).toHaveAttribute(
      'data-kind',
      `${SERIES}`,
    )
    await expect(page.locator(`[data-project-id="${series}"] .storyrow__meta`)).toContainText(
      'Series',
    )

    // Each same-name row opens its own project.
    for (const id of [film, series]) {
      await listed(page, a, 'cinema')
      await page.getByTestId(`projects-row-${id}`).click()
      await expect(page).toHaveURL(new RegExp(id))
    }
  })

  test('an empty category shows its own empty state and New project preselects the kind', async ({
    page,
  }) => {
    await signUp(page)
    const b = await universe(page)
    await project(page, b, 'Only writing', WRITING)
    await project(page, b, 'Only film', FILM)

    await listed(page, b, 'gaming')
    await expect(page.getByTestId('projects-empty')).toContainText('No game projects yet.')
    await listed(page, b, 'comic')
    await expect(page.getByTestId('projects-empty')).toContainText('No comic projects yet.')

    await listed(page, b, 'cinema')
    await page.getByTestId('projects-page-new').click()
    await expect(page).toHaveURL(new RegExp(`universeId=${b}`))
    await expect(page.getByTestId('project-new-kind')).toHaveValue(`${FILM}`)
  })
})
