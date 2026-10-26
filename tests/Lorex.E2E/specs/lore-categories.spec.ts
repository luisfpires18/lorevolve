import { expect, test, type Page } from '@playwright/test'

/**
 * Product refinement 028: Lore browses the type hierarchy as categories and what is inside them. The top-level types are
 * one row; a category that holds others opens a quieter row beneath it - "All Runes", then each subtype - and a phone gets
 * one menu per level. Nested types never sit beside the top-level ones. Scope drives the breadcrumb, the title, the search
 * placeholder and the New button; the cards, filters, Select and pages are as they were. Browsing writes nothing.
 */
const PASSWORD = 'Test-password-123!'
const RUNES = [
  'Original Runes',
  'Corrupted Runes',
  'Purified Runes',
  'Primal Runes',
  'Material Runes',
  'Animal Runes',
  'Elemental Runes',
  'Nature Runes',
  'Physical Runes',
  'Mystic Runes',
  'Technic Runes',
]

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('loremaster')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data })
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()) as { id: string }
}

/** Arda: Weapons (of Chaos, of Order), Kingdoms, and Runes with eleven subtypes; Order and Chaos are Original Runes. */
async function arda(page: Page) {
  const u = (await post(page, '/api/universes', { name: unique('Arda '), description: null })).id
  const type = async (name: string, parent: string | null) =>
    (
      await post(page, `/api/universes/${u}/entity-types`, {
        name,
        description: null,
        icon: null,
        accentColor: null,
        displayOrder: null,
        parent: { id: parent },
      })
    ).id
  const entry = (typeId: string, name: string, canonStatus = 0) =>
    post(page, `/api/universes/${u}/entities`, {
      entityTypeId: typeId,
      name,
      summary: null,
      canonStatus,
      aliases: [],
      tags: [],
      fields: [],
    })

  const ids = new Map<string, string>()
  ids.set('Weapons', await type('Weapons', null))
  ids.set('Weapons of Chaos', await type('Weapons of Chaos', ids.get('Weapons')!))
  ids.set('Weapons of Order', await type('Weapons of Order', ids.get('Weapons')!))
  ids.set('Kingdoms', await type('Kingdoms', null))
  ids.set('Runes', await type('Runes', null))
  for (const name of RUNES) ids.set(name, await type(name, ids.get('Runes')!))

  await entry(ids.get('Original Runes')!, 'Order', 2)
  await entry(ids.get('Original Runes')!, 'Chaos')
  await entry(ids.get('Elemental Runes')!, 'Fire')
  await entry(ids.get('Weapons of Order')!, 'Andúril')
  await entry(ids.get('Weapons of Chaos')!, 'Morgul-blade')
  const types = (await (await page.request.get(`/api/universes/${u}/entity-types`)).json()) as {
    id: string
    name: string
  }[]
  ids.set('Character', types.find((each) => each.name === 'Character')!.id)
  await entry(ids.get('Character')!, 'Aragorn')
  return {
    u,
    ids,
    lore: (name?: string) => `/app/universes/${u}/lore${name ? `?type=${ids.get(name)}` : ''}`,
  }
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Lore types' })
const categories = (page: Page) => nav(page).getByTestId('lore-categories')
const inside = (page: Page, parent: string) =>
  nav(page).locator(`[data-testid="lore-subtypes"][data-parent-name="${parent}"]`)
const names = (scope: ReturnType<Page['locator']>) =>
  scope
    .getByTestId('lore-type')
    .evaluateAll((all) => all.map((link) => link.getAttribute('data-type-name')))
const cards = (page: Page) => page.getByTestId('entity-card')
const typeCard = (page: Page, name: string) =>
  page.locator(`[data-testid="lore-type-card"][data-type-name="${name}"]`)
const cardNames = (page: Page) =>
  cards(page).evaluateAll((all) => all.map((card) => card.getAttribute('data-entity-name')).sort())
const heading = (page: Page) => page.getByRole('heading', { level: 1 })
const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/** Every request that would change a type or an entry, counted from now: browsing should make none. */
function writes(page: Page) {
  const seen: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET' && /\/(entity-types|entities)\b/.test(request.url())) {
      seen.push(`${request.method()} ${request.url()}`)
    }
  })
  return seen
}

test.describe('Lore categories on a desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('top-level categories only; Runes and Weapons open what is inside them; scope names everything', async ({
    page,
  }) => {
    await signUp(page)
    const w = await arda(page)
    const changes = writes(page)
    await page.goto(w.lore())

    // Bare Lore is the catalog (Issue #60): every category a card, a nested one saying where it sits, the row waiting.
    await expect(typeCard(page, 'Runes')).toBeVisible()
    for (const nested of RUNES) await expect(typeCard(page, nested)).toContainText('In Runes')
    await expect(typeCard(page, 'Weapons of Order')).toContainText('In Weapons')
    await expect(typeCard(page, 'Runes')).toContainText(`3 entries · ${RUNES.length} nested types`)
    await expect(nav(page)).toHaveCount(0)
    await expect(heading(page)).toHaveText('Lore')
    await expect(page.getByTestId('new-entity')).toHaveAccessibleName('New entry')

    // Runes: current, its subtypes beneath in their order, "All Runes" first and current, its whole branch listed.
    await typeCard(page, 'Runes').click()
    await expect(heading(page)).toHaveText('Runes')
    await expect(categories(page).locator('[data-type-name="Runes"]')).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(await names(inside(page, 'Runes'))).toEqual(RUNES)
    await expect(inside(page, 'Runes').getByTestId('lore-type-all')).toHaveText('All Runes')
    await expect(inside(page, 'Runes').getByTestId('lore-type-all')).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect.poll(() => cardNames(page)).toEqual(['Chaos', 'Fire', 'Order'])
    await expect(page.getByTestId('lore-path')).toHaveText('Lore')
    await expect(page.getByLabel('Filter entries')).toHaveAttribute('placeholder', 'Search Runes')
    await expect(page.getByTestId('new-entity')).toHaveAccessibleName('New Runes')

    // Original Runes: Order and Chaos, under Lore › Runes; Runes stays marked as the category it sits in.
    await inside(page, 'Runes').getByRole('link', { name: 'Original Runes' }).click()
    await expect(heading(page)).toHaveText('Original Runes')
    await expect.poll(() => cardNames(page)).toEqual(['Chaos', 'Order'])
    await expect(page.getByTestId('lore-path')).toHaveText('Lore›Runes')
    await expect(categories(page).locator('[data-type-name="Runes"]')).toHaveAttribute(
      'aria-current',
      'true',
    )
    await expect(
      inside(page, 'Runes').locator('[data-type-name="Original Runes"]'),
    ).toHaveAttribute('aria-current', 'page')
    await expect(page.getByLabel('Filter entries')).toHaveAttribute(
      'placeholder',
      'Search Original Runes',
    )
    await expect(page.getByTestId('new-entity')).toHaveAccessibleName('New Original Runes')
    await expect(page.getByTestId('new-entity')).toHaveAttribute(
      'href',
      new RegExp(`type=${w.ids.get('Original Runes')}`),
    )

    // "All Runes" goes back up to the whole branch; the breadcrumb's Runes does the same.
    await inside(page, 'Runes').getByTestId('lore-type-all').click()
    await expect(heading(page)).toHaveText('Runes')
    await inside(page, 'Runes').getByRole('link', { name: 'Original Runes' }).click()
    await page.getByTestId('lore-path').getByRole('link', { name: 'Runes' }).click()
    await expect(heading(page)).toHaveText('Runes')

    // Weapons: All Weapons, Weapons of Chaos, Weapons of Order - and the Rune row is gone.
    await categories(page).getByRole('link', { name: 'Weapons', exact: true }).click()
    await expect(heading(page)).toHaveText('Weapons')
    await expect(inside(page, 'Runes')).toHaveCount(0)
    expect(await names(inside(page, 'Weapons'))).toEqual(['Weapons of Chaos', 'Weapons of Order'])
    await expect(inside(page, 'Weapons').getByTestId('lore-type-all')).toHaveText('All Weapons')
    await expect.poll(() => cardNames(page)).toEqual(['Andúril', 'Morgul-blade'])
    await inside(page, 'Weapons').getByRole('link', { name: 'Weapons of Order' }).click()
    await expect(page.getByTestId('lore-path')).toHaveText('Lore›Weapons')
    await expect.poll(() => cardNames(page)).toEqual(['Andúril'])
    await expect(page.getByTestId('new-entity')).toHaveAccessibleName('New Weapons of Order')

    // A category without subtypes opens nothing beneath; an empty one says so and offers its own create.
    await categories(page).getByRole('link', { name: 'Kingdoms' }).click()
    await expect(nav(page).getByTestId('lore-subtypes')).toHaveCount(0)
    await expect(page.getByTestId('entity-empty')).toContainText('No entries in this category yet.')
    await expect(page.getByTestId('empty-new-entity')).toHaveText('New Kingdoms')

    // Browsing changed nothing: no type or entry was written, and every type and entry is still there, once.
    expect(changes).toEqual([])
    const types = (await (await page.request.get(`/api/universes/${w.u}/entity-types`)).json()) as {
      name: string
      parentId: string | null
    }[]
    expect(types.filter((each) => each.name === 'Original Runes')).toHaveLength(1)
    expect(types.filter((each) => each.name === 'Runes')).toHaveLength(1)
    expect(types.find((each) => each.name === 'Original Runes')!.parentId).toBe(w.ids.get('Runes'))
    expect(types.find((each) => each.name === 'Weapons of Order')!.parentId).toBe(
      w.ids.get('Weapons'),
    )
    const all = (await (
      await page.request.get(`/api/universes/${w.u}/entities?pageSize=50`)
    ).json()) as { totalCount: number }
    expect(all.totalCount).toBe(6)
  })

  test('search, status and the page size work inside the chosen scope', async ({ page }) => {
    await signUp(page)
    const w = await arda(page)
    for (let index = 1; index <= 13; index++) {
      await post(page, `/api/universes/${w.u}/entities`, {
        entityTypeId: w.ids.get('Material Runes'),
        name: `Iron ${String(index).padStart(2, '0')}`,
        summary: null,
        canonStatus: 0,
        aliases: [],
        tags: [],
        fields: [],
      })
    }

    await page.goto(w.lore('Runes'))
    await expect(cards(page)).toHaveCount(12)
    const search = page.getByLabel('Filter entries')

    // Search reaches the whole branch, and nothing outside it.
    await search.fill('Fire')
    await expect.poll(() => cardNames(page)).toEqual(['Fire'])
    await search.fill('Andúril')
    await expect(page.getByTestId('entity-empty')).toContainText('Nothing matches that.')
    await search.fill('')

    // Status narrows within the scope.
    await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Canon' }).click()
    await expect.poll(() => cardNames(page)).toEqual(['Order'])
    await page
      .getByRole('group', { name: 'Status' })
      .getByRole('button', { name: 'Any status' })
      .click()

    // Pages and their size, as before.
    await expect(page.locator('.pager__position')).toHaveText('Page 1 of 2')
    await page.getByTestId('lore-page-size').selectOption('16')
    await expect(cards(page)).toHaveCount(16)
    await expect(page.locator('.pager__position')).toHaveCount(0)
  })

  test('from the keyboard: along a row with the arrows, and Tab down into what is inside', async ({
    page,
  }) => {
    await signUp(page)
    const w = await arda(page)
    await page.goto(w.lore('Runes'))
    await expect(inside(page, 'Runes')).toBeVisible()

    const runes = categories(page).locator('[data-type-name="Runes"]')
    await runes.focus()
    await page.keyboard.press('Home')
    await expect(categories(page).getByTestId('lore-type').first()).toBeFocused()
    await page.keyboard.press('End')
    await expect(runes).toBeFocused()
    expect(await runes.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
      'none',
    )

    // Tab leaves the categories for the next row: All Runes, then the arrows walk the subtypes.
    await page.keyboard.press('Tab')
    await expect(inside(page, 'Runes').getByTestId('lore-type-all')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(inside(page, 'Runes').locator('[data-type-name="Original Runes"]')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(heading(page)).toHaveText('Original Runes')

    // The rows are named lists, so a screen reader hears which level it is on.
    await expect(categories(page)).toHaveAttribute('aria-label', 'Categories')
    await expect(inside(page, 'Runes')).toHaveAttribute('aria-label', 'Inside Runes')
  })
})

test.describe('Lore categories on a phone', () => {
  for (const width of [390, 360]) {
    test(`${width}px: a Category menu, then one menu inside it - no wrapping, no sideways scroll`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 })
      await signUp(page)
      const w = await arda(page)
      await page.goto(w.lore())

      // The catalog first (Issue #60); the menus are the navigation once a category is open.
      await expect(page.getByTestId('lore-catalog')).toBeVisible()
      await expect(page.getByTestId('lore-type-menu')).toHaveCount(0)
      expect(await sideways(page)).toBeLessThanOrEqual(0)
      await typeCard(page, 'Kingdoms').click()

      const category = page.getByTestId('lore-type-menu')
      await expect(category).toHaveAccessibleName('Category: Kingdoms')
      await category.click()
      const menu = page.getByTestId('lore-type-menu-panel')
      await expect(menu.locator('[data-type-name="Runes"]')).toBeVisible()
      await expect(menu.locator('[data-type-name="Original Runes"]')).toHaveCount(0)
      await menu.locator('[data-type-name="Runes"]').click()

      const sub = page.getByTestId('lore-subtype-menu')
      await expect(category).toHaveAccessibleName('Category: Runes')
      await expect(sub).toHaveAccessibleName('In Runes: All Runes')
      // The category menu and Filters share a line; the subtype menu has a line of its own beneath.
      const categoryBox = (await category.boundingBox())!
      const filtersBox = (await page.getByTestId('lore-filters-toggle').boundingBox())!
      const subBox = (await sub.boundingBox())!
      expect(Math.abs(filtersBox.y - categoryBox.y)).toBeLessThanOrEqual(2)
      expect(subBox.y).toBeGreaterThan(categoryBox.y + categoryBox.height - 1)
      expect(subBox.height).toBeLessThan(60)

      await sub.click()
      const subMenu = page.getByTestId('lore-subtype-menu-panel')
      const box = (await subMenu.boundingBox())!
      expect(box.x + box.width).toBeLessThanOrEqual(width)
      await subMenu.locator('[data-type-name="Original Runes"]').click()
      await expect(heading(page)).toHaveText('Original Runes')
      await expect.poll(() => cardNames(page)).toEqual(['Chaos', 'Order'])
      await expect(sub).toHaveAccessibleName('In Runes: Original Runes')
      await expect(page.getByTestId('lore-select')).toBeVisible()
      expect(await sideways(page)).toBeLessThanOrEqual(0)
    })
  }
})
