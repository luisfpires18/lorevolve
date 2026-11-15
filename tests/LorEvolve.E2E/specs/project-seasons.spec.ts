import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #145: a project holds seasons, and episodes with their scripts.
 *
 * The paths an author walks: make two seasons, put episodes in one, reorder them, write a script, move an episode to
 * the other season. Order is what these are really for, because a stored place is the kind of thing that looks right
 * in one screen and is wrong after a delete.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('seasons')
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
  return (await response.json()) as T
}

async function universe(page: Page) {
  return api<{ id: string }>(page, 'POST', '/api/universes', {
    name: unique('Seriesworld '),
    description: null,
  })
}

/** Kind and lifecycle travel as numbers: 2 is Series and 1 is Active. */
async function series(page: Page, universeId: string) {
  return api<{ id: string }>(page, 'POST', '/api/projects', {
    name: unique('Hollow Season '),
    kind: 2,
    lifecycle: 1,
    subtype: 'live action',
    summary: '',
    universeId,
    expectedVersion: null,
  })
}

test.describe('Project seasons', () => {
  test('a series gets seasons, episodes in order, and a script on one of them', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const project = await series(page, world.id)

    await page.goto(`/app/projects/${project.id}`)

    await expect(page.getByTestId('project-seasons-empty')).toBeVisible()

    // Two seasons, in the order they were made.
    await page.getByTestId('project-season-new-name').fill('Season 1')
    await page.getByTestId('project-season-new-save').click()
    await expect(page.getByTestId('project-season-list')).toContainText('Season 1')

    await page.getByTestId('project-season-new-name').fill('Season 2')
    await page.getByTestId('project-season-new-save').click()

    const seasons = page.getByTestId('project-season-list')
    await expect(seasons.locator('> li')).toHaveCount(2)

    // Three episodes in the first season.
    const first = seasons.locator('> li').first()
    for (const title of ['Pilot', 'The Salt Road', 'Low Tide']) {
      await first.getByRole('button', { name: 'Add an episode' }).click()
      await page.getByTestId('project-episode-new-title').fill(title)
      await page.getByTestId('project-episode-new-save').click()
      await expect(first).toContainText(title)
    }

    await expect(first).toContainText('3 episodes')

    // Reordered: the last one moved to the top, by its own button rather than a drag.
    const episodes = first.locator('ol > li')
    await expect(episodes).toHaveCount(3)
    await episodes.nth(2).getByRole('button', { name: 'Move up' }).click()

    await expect(first.locator('ol > li').nth(1)).toContainText('Low Tide')

    // A script on the first episode, read when opened and saved whole.
    await first.locator('ol > li').first().getByRole('button', { name: 'Open script' }).click()

    const script = page.locator('[data-testid^="project-script-text-"]').first()
    await script.fill('INT. SALT HOUSE - NIGHT\n\nAlenna comes back out of the sea.')
    await page.locator('[data-testid^="project-script-save-"]').first().click()

    await expect(first).toContainText('Script,')

    // Moved to the other season, which closes the first season's list up behind it.
    await first
      .locator('ol > li')
      .first()
      .getByRole('button', { name: /Move to Season 2/ })
      .click()

    await expect(first).toContainText('2 episodes')
    await expect(seasons.locator('> li').nth(1)).toContainText('1 episode')
  })

  test('a season that still holds an episode is not deleted, and the refusal is shown', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const project = await series(page, world.id)

    await page.goto(`/app/projects/${project.id}`)

    await page.getByTestId('project-season-new-name').fill('Season 1')
    await page.getByTestId('project-season-new-save').click()

    const season = page.getByTestId('project-season-list').locator('> li').first()
    await season.getByRole('button', { name: 'Add an episode' }).click()
    await page.getByTestId('project-episode-new-title').fill('Pilot')
    await page.getByTestId('project-episode-new-save').click()
    await expect(season).toContainText('Pilot')

    await season.getByRole('button', { name: 'Delete season' }).click()

    await expect(page.getByTestId('project-seasons-failed')).toBeVisible()
    await expect(page.getByTestId('project-season-list')).toContainText('Season 1')

    // Emptied first, it goes.
    await season.getByRole('button', { name: 'Delete episode' }).click()
    await expect(season).toContainText('No episodes yet.')

    await page
      .getByTestId('project-season-list')
      .locator('> li')
      .first()
      .getByRole('button', { name: 'Delete season' })
      .click()

    await expect(page.getByTestId('project-seasons-empty')).toBeVisible()
  })
})
