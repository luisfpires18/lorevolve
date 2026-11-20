import { expect, test, type Page } from '@playwright/test'
import { acceptConfirm } from './support/confirm'

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
    await expect(cards.getByTestId('lore-type-card')).toHaveCount(3)
    await expect(cards).toContainText('Map')
    await expect(cards).toContainText('No entries yet')
    await expect(page.getByTestId('project-schema')).toHaveCount(0)

    // The definitions are a tab away. Map's starter field records the player counts it supports, as several
    // choices rather than one number.
    await expect(page.getByTestId('project-types-manage')).toHaveCount(0)
    await page.getByTestId('projecttab-types').click()
    await expect(page).toHaveURL(/\/types$/)
    const types = page.getByTestId('project-types')
    // A type's fields open from its row, as on the universe's Types screen.
    await types.getByRole('button', { name: 'Fields of Map' }).click()
    await expect(types).toContainText('Supported players')
    await expect(types).toContainText('Choose several')
    await expect(page.getByTestId('project-schema-offer')).toHaveCount(0)
    await page.getByTestId('projecttab-entities').click()

    // A card opens that type's entries alone: no other type is offered and the editor is not on the way.
    await cards.getByRole('link', { name: /Map/ }).click()
    await expect(page).toHaveURL(/\/entities\?type=/)
    await expect(page.getByTestId('project-entries')).toBeVisible()
    await expect(page.getByTestId('project-entries-type')).toHaveCount(0)
    await expect(page.getByTestId('project-schema')).toHaveCount(0)

    // An entry of the type, with one of those choices made. The form opens from the panel's head (#184).
    await page.getByTestId('project-entry-add').click()
    await page.getByTestId('project-entry-new-name').fill('Saltflats')

    const players = page.getByRole('group', { name: /Supported players/ })
    await players.getByText('4', { exact: true }).click()

    await page.getByTestId('project-entry-new-save').click()

    await expect(page.getByTestId('project-entry-list')).toContainText('Saltflats')

    // Back on the cards, the count is read again.
    await page.getByTestId('project-entities-back').click()
    await expect(cards.getByTestId('lore-type-card').filter({ hasText: 'Map' })).toContainText(
      '1 entry',
    )

    // From here the schema is the author's: a type of their own, and one of the starters gone.
    await page.getByTestId('projecttab-types').click()
    // The same drawer the universe's Types screen opens.
    await page.getByTestId('project-type-add').click()
    await page.getByTestId('type-name').fill('Encounter')
    await page.getByTestId('save-type').click()
    await expect(types).toContainText('Encounter')

    // Delete lives in the row's menu, as it does on a lore type's row.
    // The row's own head, not the whole row: a field row inside it carries a menu of its own.
    const item = types.locator('> li', { hasText: 'Item' }).first().locator('.types__head')
    await item.getByRole('button', { name: /More actions/ }).click()
    await item.getByRole('button', { name: 'Delete type' }).click()
    await acceptConfirm(page)
    await expect(types).not.toContainText('Item')

    // A type still used by an entry is not deleted: the refusal is shown rather than the entry losing its type.
    const map = types.locator('> li', { hasText: 'Map' }).first().locator('.types__head')
    await map.getByRole('button', { name: /More actions/ }).click()
    await map.getByRole('button', { name: 'Delete type' }).click()
    await acceptConfirm(page)
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
    await expect(
      page.getByTestId('project-entity-type-cards').getByTestId('lore-type-card'),
    ).toHaveCount(2)
  })

  test("a project's types and entries stay out of the universe's lore and out of another project", async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const first = await game(page, world.id)
    const second = await game(page, world.id)

    await page.goto(`/app/projects/${first.id}/entities`)
    // The same drawer the universe's Types screen opens.
    await page.getByTestId('project-type-add').click()
    await page.getByTestId('type-name').fill('Unit')
    await page.getByTestId('save-type').click()
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

  test('a game has no overview: its address lands on Entities, with its facts above and the counts on the type cards', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)
    const project = await game(page, world.id)
    const entities = `/app/universes/${world.id}/projects/${project.id}/entities`

    // The bare address and the retired /overview both land on the first view, Entities (#377).
    for (const address of [`/app/projects/${project.id}`, `/app/projects/${project.id}/overview`]) {
      await page.goto(address)
      await expect(page).toHaveURL(entities)
    }
    await expect(page.getByTestId('project-page')).toHaveCount(0)
    await expect(page.getByTestId('project-overview-counts')).toHaveCount(0)
    await expect(page.getByTestId('projecttab-overview')).toHaveCount(0)

    // Its facts sit under the tabs. No summary was given, so none is drawn.
    const facts = page.getByTestId('project-facts')
    await expect(facts.getByTestId('project-meta')).toContainText('Game')
    await expect(facts.getByTestId('project-summary')).toHaveCount(0)

    // With no types the view is the offer to take the starters.
    await expect(page.getByTestId('project-schema-offer')).toBeVisible()

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
    await api(page, 'POST', `/api/projects/${project.id}/entities`, {
      entityTypeId: map.id,
      name: 'Aback Flats',
      summary: null,
    })

    await page.goto(entities)

    // Counts per type, from the types list rather than from counting entries.
    const counts = page.getByTestId('project-entity-type-cards')
    const card = (name: string) => counts.getByTestId('lore-type-card').filter({ hasText: name })
    await expect(card(unit.name)).toContainText('2 entries')
    await expect(card(map.name)).toContainText('1 entry')

    // The tab bar and the sidebar's Lore stay reachable.
    for (const segment of ['entities', 'types', 'systems']) {
      await expect(page.getByTestId(`projecttab-${segment}`)).toBeVisible()
    }
    await page
      .getByRole('navigation', { name: 'Universe', exact: true })
      .getByRole('link', { name: 'Lore', exact: true })
      .click()
    await expect(page).toHaveURL(/\/lore$/)
  })

  test('a game, a series, a film and a comic open a type as Lore does, edit types, and move between views at both widths', async ({
    page,
  }) => {
    await signUp(page)
    const world = await universe(page)

    // 1 is Game, 2 Series, 3 Film and 4 Comic. Series and Film have five views, whose tab bar used to widen a phone's page.
    for (const kind of [1, 2, 3, 4]) {
      const project = await api<{ id: string }>(page, 'POST', '/api/projects', {
        name: unique('Low Tide '),
        kind,
        lifecycle: 1,
        subtype: null,
        summary: '',
        universeId: world.id,
        expectedVersion: null,
      })
      const types = await api<{ id: string; name: string }[]>(
        page,
        'POST',
        `/api/projects/${project.id}/template`,
      )
      const first = types[0]
      await api(page, 'POST', `/api/projects/${project.id}/entities`, {
        entityTypeId: first.id,
        name: 'Mara Vell',
        summary: 'Comes back to the harbour.',
      })
      const base = `/app/universes/${world.id}/projects/${project.id}`
      // No kind has an overview (#377): the other view beside Entities is Types on every kind.
      const other = 'types'

      await page.setViewportSize({ width: 1280, height: 800 })
      await page.goto(`${base}/entities?type=${first.id}`)

      // The type's own name heads its list and New is named for it, as above a Lore type's list.
      const entries = page.getByTestId('project-entries')
      await expect(entries.getByRole('heading', { level: 2, name: first.name })).toBeVisible()
      await expect(page.getByTestId('project-entry-add')).toHaveAccessibleName(`New ${first.name}`)

      // Its entries are Lore's cards.
      const card = page.getByTestId('project-entry-list').locator('.entitycard')
      await expect(card).toHaveCount(1)
      await expect(card).toContainText('Mara Vell')
      await expect(card).toContainText('Comes back to the harbour.')

      // The tab bar is the way between the views at every width (#271).
      await expect(page.getByTestId('project-tabs')).toBeVisible()
      await page.getByTestId(`projecttab-${other}`).click()
      await expect(page).toHaveURL(new RegExp(`${base}/${other}$`))
      await page.getByTestId('projecttab-entities').click()
      await expect(page).toHaveURL(new RegExp(`${base}/entities$`))

      // A type of the project's own, made in the Types screen's drawer, is on the cards when the crumb leads back.
      // Every kind opens it from its Types tab.
      await page.getByTestId('projecttab-types').click()
      await page.getByTestId('project-type-add').click()
      await page.getByTestId('type-name').fill('Rehearsal')
      await page.getByTestId('save-type').click()
      await expect(page.getByTestId('project-types')).toContainText('Rehearsal')
      await page.getByTestId('projecttab-entities').click()
      await expect(page.getByTestId('project-entity-type-cards')).toContainText('Rehearsal')

      // On a phone the tabs are the way between the views, scroll inside their own bar, and the page stays the
      // screen's width.
      await page.setViewportSize({ width: 375, height: 740 })
      await expect(page.getByTestId('project-tabs')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        375,
      )
      await page.getByTestId(`projecttab-${other}`).click()
      await expect(page).toHaveURL(new RegExp(`${base}/${other}$`))
      await page.getByTestId('projecttab-entities').click()
      await expect(page).toHaveURL(new RegExp(`${base}/entities$`))
      await expect(page.getByTestId('project-entity-type-cards')).toContainText('Rehearsal')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        375,
      )
    }

    // The projects' own types stay theirs: the universe's Types screen shows none of them.
    await page.goto(`/app/universes/${world.id}/types`)
    await expect(page.locator('main')).not.toContainText('Rehearsal')
  })
})
