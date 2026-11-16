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

/** 3 is Film. The same structure the series uses, under the vocabulary a film uses (#146). */
async function film(page: Page, universeId: string) {
  return api<{ id: string }>(page, 'POST', '/api/projects', {
    name: unique('Low Tide '),
    kind: 3,
    lifecycle: 1,
    subtype: 'animated',
    summary: '',
    universeId,
    expectedVersion: null,
  })
}

/** 4 is Comic. Volumes of chapters, with pages and panels beneath a chapter (#147). */
async function comic(page: Page, universeId: string, subtype: string | null = null) {
  return api<{ id: string }>(page, 'POST', '/api/projects', {
    name: unique('Low Tide '),
    kind: 4,
    lifecycle: 1,
    subtype,
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

    await page.goto(`/app/projects/${project.id}/structure`)

    await expect(page.getByTestId('project-seasons-empty')).toBeVisible()

    // Two seasons, in the order they were made. The form opens from the panel's head (#184).
    await page.getByTestId('project-season-add').click()
    await page.getByTestId('project-season-new-name').fill('Season 1')
    await page.getByTestId('project-season-new-save').click()
    await expect(page.getByTestId('project-season-list')).toContainText('Season 1')

    await page.getByTestId('project-season-add').click()
    await page.getByTestId('project-season-new-name').fill('Season 2')
    await page.getByTestId('project-season-new-save').click()

    const seasons = page.getByTestId('project-season-list')
    await expect(seasons.locator('> li')).toHaveCount(2)

    // Three episodes in the first season.
    const first = seasons.locator('> li').first()
    for (const title of ['Pilot', 'The Salt Road', 'Low Tide']) {
      await first.getByRole('button', { name: 'Add episode' }).click()
      await page.getByTestId('project-episode-new-title').fill(title)
      await page.getByTestId('project-episode-new-save').click()
      await expect(first).toContainText(title)
    }

    await expect(first).toContainText('3 episodes')

    // Reordered: the last one moved up from its own menu rather than by a drag.
    const episodes = first.locator('ol > li')
    await expect(episodes).toHaveCount(3)
    await episodes
      .nth(2)
      .getByRole('button', { name: /More actions/ })
      .click()
    await episodes.nth(2).getByRole('button', { name: 'Move up' }).click()

    await expect(first.locator('ol > li').nth(1)).toContainText('Low Tide')

    // A script on the first episode, read when opened and saved whole.
    await first.locator('ol > li').first().getByRole('button', { name: 'Open script' }).click()

    const script = page.locator('[data-testid^="project-script-text-"]').first()
    await script.fill('INT. SALT HOUSE - NIGHT\n\nAlenna comes back out of the sea.')
    await page.locator('[data-testid^="project-script-save-"]').first().click()

    await expect(first).toContainText('Script,')

    // Moved to the other season, which closes the first season's list up behind it.
    const moving = first.locator('ol > li').first()
    await moving.getByRole('button', { name: /More actions/ }).click()
    await moving.getByRole('button', { name: /Move to Season 2/ }).click()

    await expect(first).toContainText('2 episodes')
    await expect(seasons.locator('> li').nth(1)).toContainText('1 episode')
  })

  test('a film says sequences and scenes for the same structure, and a game has none', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const movie = await film(page, world.id)

    await page.goto(`/app/projects/${movie.id}/structure`)

    // The film's own words, and not the series' ones.
    const panel = page.getByTestId('project-seasons')
    await expect(panel.getByRole('heading', { name: 'Sequences' })).toBeVisible()
    await expect(panel).toContainText('No sequences yet.')
    await expect(panel).not.toContainText('Season')

    await page.getByTestId('project-season-add').click()
    await page.getByTestId('project-season-new-name').fill('Act one')
    await page.getByTestId('project-season-new-save').click()

    const sequence = page.getByTestId('project-season-list').locator('> li').first()
    await sequence.getByRole('button', { name: 'Add scene' }).click()
    await page.getByTestId('project-episode-new-title').fill('The tide goes out')
    await page.getByTestId('project-episode-new-save').click()

    await expect(sequence).toContainText('1 scene')
    await expect(sequence).toContainText('The tide goes out')

    // The film's words reach the row's menu too, not only the panel's heading.
    const scene = sequence.locator('ol > li').first()
    await scene.getByRole('button', { name: /More actions/ }).click()
    await expect(scene.getByRole('button', { name: 'Delete scene' })).toBeVisible()

    // A game has no such panel at all: widening the structure to Film must not widen it to everything.
    const game = await api<{ id: string }>(page, 'POST', '/api/projects', {
      name: unique('Hollow Season '),
      kind: 1,
      lifecycle: 1,
      subtype: null,
      summary: '',
      universeId: world.id,
      expectedVersion: null,
    })

    // A game has no structure of its own, and its overview is its own view (#195), not the structure panel. With
    // nothing in the project yet that overview is its empty state.
    await page.goto(`/app/projects/${game.id}`)
    await expect(page.getByTestId('project-overview-empty')).toBeVisible()
    await expect(page.getByTestId('project-seasons')).toHaveCount(0)
  })

  test('a comic says volumes and chapters, and a chapter opens its pages and panels', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const book = await comic(page, world.id, 'manga')

    await page.goto(`/app/projects/${book.id}/structure`)

    // A comic's own words.
    const panel = page.getByTestId('project-seasons')
    await expect(panel.getByRole('heading', { name: 'Volumes' })).toBeVisible()
    await expect(panel).toContainText('No volumes yet.')

    await page.getByTestId('project-season-add').click()
    await page.getByTestId('project-season-new-name').fill('Volume 1')
    await page.getByTestId('project-season-new-save').click()

    const volume = page.getByTestId('project-season-list').locator('> li').first()
    await volume.getByRole('button', { name: 'Add chapter' }).click()
    await page.getByTestId('project-episode-new-title').fill('The tide goes out')
    await page.getByTestId('project-episode-new-save').click()

    await expect(volume).toContainText('1 chapter')

    // The level only a comic has, folded away until asked for.
    await volume.getByRole('button', { name: 'Open pages' }).click()
    await expect(volume).toContainText('No pages yet.')

    await volume.getByRole('button', { name: 'Add page' }).click()
    await page.locator('[data-testid^="project-page-new-name-"]').first().fill('1')
    await page.locator('[data-testid^="project-page-new-save-"]').first().click()

    const pageRow = volume.locator('[data-testid^="project-page-"]').first()
    await expect(pageRow).toContainText('No panels yet.')

    await pageRow.getByRole('button', { name: 'Add panel' }).click()
    await page.getByTestId('project-panel-new-description').fill('Wide on the saltflats')
    await page.getByTestId('project-panel-new-dialogue').fill('Nobody comes back twice.')
    await page.getByTestId('project-panel-new-save').click()

    await expect(pageRow).toContainText('1 panel')
    await expect(pageRow).toContainText('Wide on the saltflats')
    await expect(pageRow).toContainText('Nothing from the lore')

    // The manga template is the one offered, chosen by the subtype, on Entities, which holds the schema (#196).
    // From the sidebar: on a wide screen it lists the project's views and the tab bar steps aside.
    await page.getByTestId(`project-entities-${book.id}`).click()
    await expect(page.getByTestId('project-schema-offer')).toContainText('Chapter')
  })

  test('a panel is pointed at a lore entry from the screen, and the reference leads to it', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const book = await comic(page, world.id)

    // A lore entry to point at, and the type it needs.
    const types = await api<{ id: string; name: string }[]>(
      page,
      'GET',
      `/api/universes/${world.id}/entity-types`,
    )
    const entry = await api<{ id: string; name: string }>(
      page,
      'POST',
      `/api/universes/${world.id}/entities`,
      {
        entityTypeId: types[0].id,
        name: 'Alenna Vance',
        summary: null,
        canonStatus: 0,
        aliases: [],
        tags: [],
        fields: [],
      },
    )

    await page.goto(`/app/projects/${book.id}/structure`)

    await page.getByTestId('project-season-add').click()
    await page.getByTestId('project-season-new-name').fill('Volume 1')
    await page.getByTestId('project-season-new-save').click()

    const volume = page.getByTestId('project-season-list').locator('> li').first()
    await volume.getByRole('button', { name: 'Add chapter' }).click()
    await page.getByTestId('project-episode-new-title').fill('The tide goes out')
    await page.getByTestId('project-episode-new-save').click()

    await volume.getByRole('button', { name: 'Open pages' }).click()
    await volume.getByRole('button', { name: 'Add page' }).click()
    await page.locator('[data-testid^="project-page-new-name-"]').first().fill('1')
    await page.locator('[data-testid^="project-page-new-save-"]').first().click()

    const pageRow = volume.locator('[data-testid^="project-page-"]').first()

    // A panel created with the entry chosen through the picker the rest of LorEvolve uses.
    await pageRow.getByRole('button', { name: 'Add panel' }).click()
    await page.getByTestId('project-panel-new-description').fill('Alenna, close')

    const picker = page.getByTestId('project-panel-new-shows')
    await picker.getByRole('combobox').fill('Alenna')
    await page
      .getByRole('option', { name: /Alenna Vance/ })
      .first()
      .click()

    await page.getByTestId('project-panel-new-save').click()

    // The reference is shown as a link, and it leads to the entry.
    const shown = pageRow.locator('[data-testid^="project-panel-shows-"]').first()
    await expect(shown).toContainText('Alenna Vance')
    await shown.click()

    await page.waitForURL(`**/app/universes/${world.id}/lore/${entry.id}`)
    await expect(page.getByRole('heading', { name: 'Alenna Vance' })).toBeVisible()
  })

  test('a season that still holds an episode is not deleted, and the refusal is shown', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const project = await series(page, world.id)

    await page.goto(`/app/projects/${project.id}/structure`)

    await page.getByTestId('project-season-add').click()
    await page.getByTestId('project-season-new-name').fill('Season 1')
    await page.getByTestId('project-season-new-save').click()

    const season = page.getByTestId('project-season-list').locator('> li').first()
    await season.getByRole('button', { name: 'Add episode' }).click()
    await page.getByTestId('project-episode-new-title').fill('Pilot')
    await page.getByTestId('project-episode-new-save').click()
    await expect(season).toContainText('Pilot')

    const seasonHead = season.locator('.projectcard__head').first()
    await seasonHead.getByRole('button', { name: /More actions/ }).click()
    await seasonHead.getByRole('button', { name: 'Delete season' }).click()

    await expect(page.getByTestId('project-seasons-failed')).toBeVisible()
    await expect(page.getByTestId('project-season-list')).toContainText('Season 1')

    // Emptied first, it goes.
    const episode = season.locator('ol > li').first()
    await episode.getByRole('button', { name: /More actions/ }).click()
    await episode.getByRole('button', { name: 'Delete episode' }).click()
    await expect(season).toContainText('No episodes yet.')

    const head = page
      .getByTestId('project-season-list')
      .locator('> li')
      .first()
      .locator('.projectcard__head')
      .first()
    await head.getByRole('button', { name: /More actions/ }).click()
    await head.getByRole('button', { name: 'Delete season' }).click()

    await expect(page.getByTestId('project-seasons-empty')).toBeVisible()
  })
})
