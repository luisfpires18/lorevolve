import { expect, test, type Page } from '@playwright/test'
import { acceptConfirm } from './support/confirm'

/**
 * Product refinement 027: Lore's type navigation has a row of its own. Select - and the page size - act on the list, so they
 * sit with the list's controls under the types, never beside them: going from a type with entries to one without must not
 * move a single type link from one line to another. What follows is that, at three widths, and that every list control
 * still does what it did.
 */
const PASSWORD = 'Test-password-123!'
const EXTRA = [
  'Runes',
  'Original Runes',
  'Corrupted Runes',
  'Primal Runes',
  'Purified Runes',
  'Material Runes',
  'Ritual Circle',
  'Starship',
  'Language of the Very Long Northern Marches',
  'עידן האור',
  'Guild',
]

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('steady')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

/** A universe whose types wrap onto several rows: Character with `entries` entries, Location with none. */
async function world(page: Page, entries = 3) {
  const created = await page.request.post('/api/universes', {
    data: { name: unique('Steady World '), description: null, accentColor: null },
  })
  const u = ((await created.json()) as { id: string }).id
  const type = async (name: string, parent: string | null) => {
    const response = await page.request.post(`/api/universes/${u}/entity-types`, {
      data: {
        name,
        description: null,
        icon: null,
        accentColor: null,
        displayOrder: null,
        parent: { id: parent },
      },
    })
    return ((await response.json()) as { id: string }).id
  }
  // Runes and the types nested in it come one after another, as the hierarchy's order lists them.
  const runes = await type('Runes', null)
  for (const name of EXTRA.slice(1)) await type(name, name.endsWith('Runes') ? runes : null)
  const types = (await (await page.request.get(`/api/universes/${u}/entity-types`)).json()) as {
    id: string
    name: string
  }[]
  const character = types.find((each) => each.name === 'Character')!.id
  const location = types.find((each) => each.name === 'Location')!.id
  for (let index = 1; index <= entries; index++) {
    await page.request.post(`/api/universes/${u}/entities`, {
      data: {
        entityTypeId: character,
        name: `Wanderer ${String(index).padStart(2, '0')}`,
        summary: null,
        canonStatus: 0,
        aliases: [],
        tags: [],
        fields: [],
      },
    })
  }
  const lore = (typeId: string) => `/app/universes/${u}/lore?type=${typeId}`
  return { u, character: lore(character), location: lore(location) }
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Lore types' })
const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/** Each type link's row (by its top, rounded to a line) and left edge, plus the row's own box. */
function layout(page: Page) {
  return page.getByTestId('lore-types').evaluate((element) => {
    const box = element.getBoundingClientRect()
    const links = [...element.querySelectorAll<HTMLElement>('[data-testid="lore-type"]')]
    const tops = [
      ...new Set(links.map((link) => Math.round(link.getBoundingClientRect().top))),
    ].sort((a, b) => a - b)
    return {
      width: Math.round(box.width),
      rows: tops.length,
      links: links.map((link) => {
        const rect = link.getBoundingClientRect()
        return {
          name: link.dataset.typeName,
          line: tops.indexOf(Math.round(rect.top)),
          left: Math.round(rect.left - box.left),
        }
      }),
    }
  })
}

test.describe('Lore controls: the types keep their row whatever the list holds', () => {
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [820, 1180],
  ] as const) {
    test(`${width}px: a type with entries and one without lay the type row out the same`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height })
      await signUp(page)
      const w = await world(page)

      await page.goto(w.character)
      await expect(page.getByTestId('entity-card')).toHaveCount(3)
      const select = page.getByTestId('lore-select')
      await expect(select).toBeVisible()
      // Select is a list action: with the list's controls, not in the navigation.
      await expect(page.getByTestId('lore-result-actions').getByTestId('lore-select')).toBeVisible()
      await expect(nav(page).getByTestId('lore-select')).toHaveCount(0)
      await expect(page.locator('.lore__nav').getByTestId('lore-select')).toHaveCount(0)
      const withEntries = await layout(page)
      expect(withEntries.rows).toBeGreaterThan(1)

      await page.goto(w.location)
      await expect(page.getByTestId('entity-empty')).toBeVisible()
      await expect(select).toHaveCount(0)
      const empty = await layout(page)

      await page.goto(w.character)
      await expect(page.getByTestId('entity-card')).toHaveCount(3)
      const again = await layout(page)

      // Same width, same lines, same places - within a pixel or two for rounding.
      for (const other of [empty, again]) {
        expect(Math.abs(other.width - withEntries.width)).toBeLessThanOrEqual(1)
        expect(other.rows).toBe(withEntries.rows)
        other.links.forEach((link, index) => {
          const before = withEntries.links[index]!
          expect(link.name).toBe(before.name)
          expect(link.line, link.name).toBe(before.line)
          expect(Math.abs(link.left - before.left), link.name).toBeLessThanOrEqual(2)
        })
      }

      // The type row takes the page's whole width: from the heading's edge to the header actions' far edge.
      const heading = (await page.getByRole('heading', { level: 1 }).boundingBox())!
      const actions = (await page.getByTestId('new-entity').boundingBox())!
      const row = (await page.getByTestId('lore-types').boundingBox())!
      expect(Math.abs(row.x - heading.x)).toBeLessThanOrEqual(3)
      expect(Math.abs(row.x + row.width - (actions.x + actions.width))).toBeLessThanOrEqual(3)
      expect(await sideways(page)).toBeLessThanOrEqual(0)
    })
  }

  test('Select, the selection, Move to Trash, filters and the page size all still work from their new place', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await signUp(page)
    const w = await world(page, 14)
    await page.goto(w.character)
    const cards = page.getByTestId('entity-card')
    await expect(cards).toHaveCount(12)

    // The page size sits with Select, at the end of the list's controls.
    const size = page.getByTestId('lore-result-actions').getByTestId('lore-page-size')
    await expect(size).toBeVisible()
    await size.selectOption('20')
    await expect(cards).toHaveCount(14)

    // Filters narrow the list and keep their place in the address.
    await page.getByLabel('Filter entries').fill('Wanderer 14')
    await expect(cards).toHaveCount(1)
    await expect(page).toHaveURL(/[?&]q=Wanderer/)
    await page.getByLabel('Filter entries').fill('')
    await expect(cards).toHaveCount(14)

    // Select turns on selecting; a card is chosen; Move to Trash moves it; Done leaves.
    await page.getByTestId('lore-select').click()
    await expect(page.getByTestId('lore-select')).toHaveAttribute('aria-pressed', 'true')
    await cards.first().click()
    await expect(page.getByTestId('lore-selected-count')).toHaveText('1 selected')
    await page.getByTestId('lore-trash-selected').click()
    await acceptConfirm(page)
    await expect(page.getByTestId('lore-trashed')).toContainText('1 entry moved to the Trash.')
    await expect(cards).toHaveCount(13)
    await expect(page.getByTestId('lore-select')).toHaveAttribute('aria-pressed', 'false')
    await page.getByTestId('lore-select').click()
    await page.getByTestId('lore-select').click()
    await expect(page.getByTestId('lore-selectbar')).toHaveCount(0)
  })

  for (const width of [390, 360]) {
    test(`${width}px: the type menu keeps its width, Filters stays beside it, Select stays reachable`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 })
      await signUp(page)
      const w = await world(page)

      await page.goto(w.character)
      await expect(page.getByTestId('entity-card')).toHaveCount(3)
      const trigger = page.getByTestId('lore-type-menu')
      const filters = page.getByTestId('lore-filters-toggle')
      const withEntries = (await trigger.boundingBox())!
      const filtersBox = (await filters.boundingBox())!
      // The menu and Filters share one line; Select is not on it.
      expect(Math.abs(filtersBox.y - withEntries.y)).toBeLessThanOrEqual(2)
      const select = page.getByTestId('lore-select')
      await expect(select).toBeVisible()
      expect((await select.boundingBox())!.y).toBeGreaterThan(withEntries.y + withEntries.height)

      // Filters folded: Select is still there. Filters open and closed on its own.
      await expect(filters).toHaveAttribute('aria-expanded', 'false')
      await expect(page.getByLabel('Filter entries')).toBeHidden()
      await filters.click()
      await expect(page.getByLabel('Filter entries')).toBeVisible()
      await expect(select).toBeVisible()
      await filters.click()
      await expect(page.getByLabel('Filter entries')).toBeHidden()
      await select.click()
      await expect(page.getByTestId('lore-selectbar')).toBeVisible()
      await select.click()

      await page.goto(w.location)
      await expect(page.getByTestId('entity-empty')).toBeVisible()
      await expect(select).toHaveCount(0)
      const empty = (await trigger.boundingBox())!
      expect(Math.abs(empty.width - withEntries.width)).toBeLessThanOrEqual(1)
      expect(Math.abs(empty.x - withEntries.x)).toBeLessThanOrEqual(1)
      expect(await sideways(page)).toBeLessThanOrEqual(0)
    })
  }
})
