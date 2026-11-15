import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #144: a project defines its own types and holds its own entries.
 *
 * These are the paths an author actually walks: a game offered its starter types, taking them, making an entry of one
 * with a field value, then adding a type of their own and deleting one they do not want. The isolation that matters
 * most is checked on the screens rather than only in the API tests: a project's types must not appear on the
 * universe's own Types screen, and one project's entries must not appear in another's.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('projent')
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
    name: unique('Gameworld '),
    description: null,
  })
}

/** Kind and lifecycle travel as numbers: 1 is Game and 1 is Active. */
async function game(page: Page, universeId: string) {
  return api<{ id: string; name: string }>(page, 'POST', '/api/projects', {
    name: unique('Hollow Season '),
    kind: 1,
    lifecycle: 1,
    subtype: null,
    summary: '',
    universeId,
    expectedVersion: null,
  })
}

test.describe('Project entities', () => {
  test('a game takes the starter types, holds an entry with a field value, and the author shapes the rest', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const project = await game(page, world.id)
    const base = `/app/projects/${project.id}/entities`

    await page.goto(base)

    // The starter types are offered, not already there: with no types the Entities view is the offer (#196).
    const offer = page.getByTestId('project-schema-offer')
    await expect(offer).toContainText('Map')
    await expect(offer).toContainText('Unit')
    await expect(offer).toContainText('Item')

    await page.getByTestId('project-schema-starters').click()

    // Taken, the view opens on the type cards with their counts, and no schema editor above them.
    const cards = page.getByTestId('project-entity-type-cards')
    await expect(cards.locator('> li')).toHaveCount(3)
    await expect(cards).toContainText('Map')
    await expect(cards).toContainText('No entries yet')
    await expect(page.getByTestId('project-schema')).toHaveCount(0)

    // The definitions are one action away. Map's starter field records the player counts it supports, as several
    // choices rather than one number.
    await page.getByTestId('project-types-manage').click()
    await expect(page).toHaveURL(/\/entities\?manage=types$/)
    const types = page.getByTestId('project-types')
    await expect(types).toContainText('Supported players')
    await expect(types).toContainText('Several choices')
    await expect(page.getByTestId('project-schema-offer')).toHaveCount(0)
    await page.getByTestId('project-entities-back').click()

    // A card opens that type's entries alone: no other type is offered and the editor is not on the way.
    await cards.getByRole('link', { name: /Map/ }).click()
    await expect(page).toHaveURL(/\/entities\?type=/)
    await expect(page.getByTestId('project-entries')).toBeVisible()
    await expect(page.getByTestId('project-entries-type')).toHaveCount(0)
    await expect(page.getByTestId('project-schema')).toHaveCount(0)

    // An entry of the type, with one of those choices made. The form opens from the panel's head (#184).
    await page.getByTestId('project-entry-add').click()
    await page.getByTestId('project-entry-new-name').fill('Saltflats')

    const players = page.locator('[data-testid^="project-entry-value-"]').first()
    await players.getByText('4', { exact: true }).click()

    await page.getByTestId('project-entry-new-save').click()

    await expect(page.getByTestId('project-entry-list')).toContainText('Saltflats')

    // Back on the cards, the count is read again.
    await page.getByTestId('project-entities-back').click()
    await expect(cards.locator('> li', { hasText: 'Map' })).toContainText('1 entry')

    // From here the schema is the author's: a type of their own, and one of the starters gone.
    await page.getByTestId('project-types-manage').click()
    await page.getByTestId('project-type-add').click()
    await page.getByTestId('project-type-new-name').fill('Encounter')
    await page.getByTestId('project-type-new-save').click()
    await expect(types).toContainText('Encounter')

    // Rename and delete live in the row's menu, as they do on a lore type's row.
    // The card's own head, not the whole card: a field row inside it carries a menu of its own.
    const item = types.locator('> li', { hasText: 'Item' }).first().locator('.projectcard__head')
    await item.getByRole('button', { name: /More actions/ }).click()
    await item.getByRole('button', { name: 'Delete type' }).click()
    await expect(types).not.toContainText('Item')

    // A type still used by an entry is not deleted: the refusal is shown rather than the entry losing its type.
    const map = types.locator('> li', { hasText: 'Map' }).first().locator('.projectcard__head')
    await map.getByRole('button', { name: /More actions/ }).click()
    await map.getByRole('button', { name: 'Delete type' }).click()
    await expect(page.getByTestId('project-schema-failed')).toBeVisible()
    await expect(types).toContainText('Map')
  })

  test('a type with more entries than one page shows the rest when asked', async ({ page }) => {
    await signUp(page)
    const world = await universe(page)
    const project = await game(page, world.id)
    const type = await api<{ id: string }>(
      page,
      'POST',
      `/api/projects/${project.id}/entity-types`,
      {
        name: 'Unit',
        description: null,
        icon: null,
        accentColor: null,
      },
    )
    // One more than a page, so a list that ignored paging would show them all at once and fail here.
    for (let index = 1; index <= 26; index += 1) {
      await api(page, 'POST', `/api/projects/${project.id}/entities`, {
        entityTypeId: type.id,
        name: `Unit ${String(index).padStart(2, '0')}`,
        summary: null,
        canonEntityId: null,
        fields: [],
      })
    }

    await page.goto(`/app/projects/${project.id}/entities?type=${type.id}`)
    const list = page.getByTestId('project-entry-list')
    await expect(list.locator('> li')).toHaveCount(25)
    await expect(list).not.toContainText('Unit 26')

    await page.getByTestId('project-entries-more').click()
    await expect(list.locator('> li')).toHaveCount(26)
    await expect(list).toContainText('Unit 26')
    await expect(page.getByTestId('project-entries-more')).toHaveCount(0)

    // A type the project no longer has, named by the address, is said to be missing rather than swapped for another.
    await api(page, 'POST', `/api/projects/${project.id}/entity-types`, {
      name: 'Map',
      description: null,
      icon: null,
      accentColor: null,
    })
    await page.goto(
      `/app/projects/${project.id}/entities?type=00000000-0000-0000-0000-000000000000`,
    )
    await expect(page.getByTestId('project-entries-type-missing')).toBeVisible()
    await expect(page.getByTestId('project-entry-list')).toHaveCount(0)
    await expect(page.getByTestId('project-entry-add')).toHaveCount(0)
    await page.getByTestId('project-entities-back').click()
    await expect(page.getByTestId('project-entity-type-cards').locator('> li')).toHaveCount(2)
  })

  test("a project's types and entries stay out of the universe's lore and out of another project", async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const first = await game(page, world.id)
    const second = await game(page, world.id)

    await page.goto(`/app/projects/${first.id}/entities`)
    await page.getByTestId('project-type-add').click()
    await page.getByTestId('project-type-new-name').fill('Unit')
    await page.getByTestId('project-type-new-save').click()
    await page.getByTestId('project-entity-type-cards').getByRole('link', { name: /Unit/ }).click()

    await page.getByTestId('project-entry-add').click()
    await page.getByTestId('project-entry-new-name').fill('Saltbearer')
    await page.getByTestId('project-entry-new-save').click()
    await expect(page.getByTestId('project-entry-list')).toContainText('Saltbearer')

    // The other project of the same universe shares neither: it is offered its own starters and holds nothing.
    await page.goto(`/app/projects/${second.id}/entities`)
    await expect(page.getByTestId('project-schema-offer')).toBeVisible()
    await expect(page.getByTestId('project-types').locator('> li')).toHaveCount(0)
    await expect(page.getByTestId('project-entity-type-cards')).toHaveCount(0)

    // And the universe's own Types screen shows only the lore's types, with none of the game's.
    await page.goto(`/app/universes/${world.id}/types`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.locator('main')).not.toContainText('Unit')
  })

  test('a game overview says what is in the project, what was touched last, and the way into the rest', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const project = await game(page, world.id)
    const overview = `/app/projects/${project.id}/overview`

    // Nothing of its own yet: the overview says what to do first rather than drawing empty panels (#195).
    await page.goto(overview)
    const empty = page.getByTestId('project-overview-empty')
    await expect(empty).toBeVisible()
    await expect(empty).toContainText('nothing in it yet')
    await expect(page.getByTestId('project-overview-counts')).toHaveCount(0)

    // Its action leads into Entities, which is where a project with no types starts.
    await empty.getByRole('link').click()
    await page.waitForURL(/\/entities$/)

    const types = await api<{ id: string; name: string }[]>(
      page,
      'POST',
      `/api/projects/${project.id}/template`,
    )
    const unit = types.find((type) => type.name === 'Unit')!
    const map = types.find((type) => type.name === 'Map')!

    for (const name of ['Saltbearer', 'Tidewarden']) {
      await api(page, 'POST', `/api/projects/${project.id}/entities`, {
        entityTypeId: unit.id,
        name,
        summary: null,
      })
    }
    const latest = await api<{ id: string; name: string }>(
      page,
      'POST',
      `/api/projects/${project.id}/entities`,
      { entityTypeId: map.id, name: 'Aback Flats', summary: null },
    )

    await page.goto(overview)

    // Counts per type, from the types list rather than from counting entries.
    const counts = page.getByTestId('project-overview-type-counts')
    await expect(counts.getByTestId(`project-overview-type-${unit.id}`)).toContainText('2 entries')
    await expect(counts.getByTestId(`project-overview-type-${map.id}`)).toContainText('1 entry')

    // The newest first, which is the order the list has to be asked for: by name Aback Flats would lead anyway, so
    // the assertion that carries weight is that the newest entry heads the list while two older ones exist.
    const recent = page.getByTestId('project-overview-recent-list')
    await expect(recent.locator('> li')).toHaveCount(3)
    await expect(recent.locator('> li').first()).toContainText('Aback Flats')

    // Each one opens its type's entries, where an entry is read.
    await page.getByTestId(`project-overview-entry-${latest.id}`).click()
    await expect(page.getByTestId('project-entries')).toContainText('Aback Flats')

    // The universe's lore and every other view this kind offers are a link away.
    await page.goto(overview)
    await expect(page.getByTestId('project-overview-lore')).toContainText(/\w/)
    for (const segment of ['entities', 'systems', 'ideas']) {
      await expect(page.getByTestId(`project-overview-way-${segment}`)).toBeVisible()
    }
    await expect(page.getByTestId('project-overview-way-overview')).toHaveCount(0)
  })
})
