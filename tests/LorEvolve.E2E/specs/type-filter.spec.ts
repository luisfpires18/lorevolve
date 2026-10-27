import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Lore's types as local navigation, and the icon an entity type carries.
 *
 * What a type may be given, and what the API refuses, is settled by the API tests. What only a
 * browser can show is that an author picks an icon where types are managed and sees it where lore
 * is browsed; that a type nobody gave an icon to gets the neutral shape rather than a guess from its
 * name; that the chosen type is an address - reloaded, walked back and forward, kept by an opened
 * entry and by a new one - custom types included; that Lore lists nothing until a type is chosen (there
 * is no "All" since Product refinement 022); that the filter and status narrow within it; and that it
 * works from a keyboard, in one wrapped row on a desktop and one menu under a thumb (refinement 025).
 *
 * Types are made through the screen, because that is part of what is being proved. Entries are
 * made through the API: they are only the grid the bar filters.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('cartographer')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function newUniverse(page: Page) {
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(unique('Tidewatch '))
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

async function typeIds(page: Page, universeId: string) {
  const response = await page.request.get(`/api/universes/${universeId}/entity-types`)
  expect(response.ok()).toBeTruthy()
  const types = (await response.json()) as Array<{ id: string; name: string }>
  return new Map(types.map((type) => [type.name, type.id]))
}

async function createType(page: Page, universeId: string, name: string) {
  const response = await page.request.post(`/api/universes/${universeId}/entity-types`, {
    data: { name, description: null, icon: null, accentColor: null, displayOrder: null },
  })
  expect(response.ok()).toBeTruthy()
}

async function createEntry(
  page: Page,
  universeId: string,
  entityTypeId: string,
  name: string,
  summary: string,
) {
  const response = await page.request.post(`/api/universes/${universeId}/entities`, {
    data: {
      entityTypeId,
      name,
      summary,
      canonStatus: 0,
      aliases: [],
      tags: [],
      fields: [],
    },
  })
  expect(response.ok()).toBeTruthy()
  return ((await response.json()) as { id: string }).id
}

function typeNav(page: Page) {
  return page.getByRole('navigation', { name: 'Lore types' })
}

function typeLink(page: Page, name: string) {
  return typeNav(page).getByRole('link', { name, exact: true })
}

function typeCard(page: Page, name: string) {
  return page.locator(`[data-testid="lore-type-card"][data-type-name="${name}"]`)
}

function card(page: Page, name: string) {
  return page.locator(`[data-testid="entity-card"][data-entity-name="${name}"]`)
}

function rowIcon(page: Page, typeName: string) {
  return page.getByTestId(`type-icon-${typeName}`).locator('svg')
}

function title(page: Page) {
  return page.getByRole('heading', { level: 1 })
}

function statusChoice(page: Page, name: string) {
  return page.getByRole('group', { name: 'Status' }).getByRole('button', { name, exact: true })
}

/** Types beyond the seven starters, so the row has more than it can show at once. */
const MANY_TYPES = [
  'Kingdom',
  'Starship',
  'Dynasty',
  'Artifact',
  'Ritual Circle',
  'Rumour of the Tide',
]

/** How far the document scrolls sideways. One pixel of rounding is not a defect. */
function pageOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.describe('lore types', () => {
  test('are places in the address: chosen, reloaded, walked back and forward, and opened into', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page)

    // ---------- Icons are chosen where types are managed ----------

    await page.getByTestId('workspace-types').click()
    await page.waitForURL(/\/types$/)

    // A starter type arrives with the icon it was seeded with.
    await expect(rowIcon(page, 'Character')).toHaveAttribute('data-icon', 'character')

    await page.getByTestId('new-type').click()
    await page.getByTestId('type-name').fill('Starship')
    // Every choice says what it shows, in words on screen.
    await expect(page.getByTestId('type-icon').getByText('Ship', { exact: true })).toBeVisible()
    await page.getByTestId('type-icon').getByRole('radio', { name: 'Ship', exact: true }).check()
    await expect(
      page.getByTestId('type-icon').getByRole('radio', { name: 'Ship', exact: true }),
    ).toBeChecked()
    await page.getByTestId('save-type').click()
    await expect(rowIcon(page, 'Starship')).toHaveAttribute('data-icon', 'ship')

    // Named like something a crown would suit, and given nothing: it gets the neutral shape.
    await page.getByTestId('new-type').click()
    await page.getByTestId('type-name').fill('Kingdom')
    await page.getByTestId('save-type').click()
    await expect(rowIcon(page, 'Kingdom')).toHaveAttribute('data-icon', 'fallback')

    // An icon can be chosen later, by editing the type, and taken away again.
    await page.getByTestId('edit-type-Kingdom').click()
    const picker = page.getByTestId('type-icon')
    await picker.getByRole('radio', { name: 'Crown', exact: true }).check()
    await page.getByTestId('save-type').click()
    await expect(rowIcon(page, 'Kingdom')).toHaveAttribute('data-icon', 'crown')
    await page.getByTestId('edit-type-Kingdom').click()
    await expect(picker.getByRole('radio', { name: 'Crown', exact: true })).toBeChecked()
    await picker.getByRole('radio', { name: 'No icon' }).check()
    await page.getByTestId('save-type').click()
    await expect(rowIcon(page, 'Kingdom')).toHaveAttribute('data-icon', 'fallback')

    // ---------- A world with entries in several types ----------

    const ids = await typeIds(page, universeId)
    await createEntry(
      page,
      universeId,
      ids.get('Character')!,
      'Alenna Vance',
      'Warden of the drowned coast.',
    )
    const brannoch = await createEntry(
      page,
      universeId,
      ids.get('Character')!,
      'Brannoch Hale',
      'Keeper of the tide ledger.',
    )
    await createEntry(
      page,
      universeId,
      ids.get('Location')!,
      'Tidewatch Keep',
      'Where the warden sleeps.',
    )
    await createEntry(
      page,
      universeId,
      ids.get('Starship')!,
      'The Kestrel',
      'Once carried the warden.',
    )

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)

    // ---------- Nothing is listed until a type is chosen ----------

    // The catalog of types is the way to choose (Issue #60): no panel asks, no row yet, and no entry is read.
    await expect(page.getByTestId('lore-catalog')).toBeVisible()
    await expect(typeNav(page)).toHaveCount(0)
    await expect(page.getByTestId('lore-choose')).toHaveCount(0)
    await expect(page.getByTestId('entity-card')).toHaveCount(0)
    await expect(page.getByTestId('lore-filters-toggle')).toHaveCount(0)
    await expect(title(page)).toHaveText('Lore')

    // ---------- Every type the world has, starters and custom, and nothing else ----------

    const labels = await page
      .getByTestId('lore-type-card')
      .evaluateAll((cards) => cards.map((each) => each.getAttribute('data-type-name')))
    expect(labels).toEqual([
      'Character',
      'Location',
      'Organization',
      'Event',
      'Item',
      'Species',
      'Concept',
      'Starship',
      'Kingdom',
    ])

    // The chosen icon, the seeded one, and the fallback - drawn where the lore is browsed.
    await expect(typeCard(page, 'Starship').locator('svg')).toHaveAttribute('data-icon', 'ship')
    await expect(typeCard(page, 'Location').locator('svg')).toHaveAttribute('data-icon', 'location')
    await expect(typeCard(page, 'Kingdom').locator('svg')).toHaveAttribute('data-icon', 'fallback')

    // ---------- A type is a place: the address says it ----------

    await typeCard(page, 'Character').click()
    await expect(typeLink(page, 'Starship').locator('svg')).toHaveAttribute('data-icon', 'ship')
    await expect(page).toHaveURL(new RegExp(`/lore\\?type=${ids.get('Character')}$`))
    await expect(typeLink(page, 'Character')).toHaveAttribute('aria-current', 'page')
    await expect(title(page)).toHaveText('Character')
    await expect(page.getByTestId('entity-card')).toHaveCount(2)
    await expect(card(page, 'Tidewatch Keep')).toBeHidden()

    // Current is drawn, not only announced.
    const background = async (name: string) =>
      typeLink(page, name).evaluate((element) => getComputedStyle(element).backgroundColor)
    expect(await background('Character')).not.toEqual(await background('Location'))

    await typeLink(page, 'Location').click()
    await expect(title(page)).toHaveText('Location')
    await expect(card(page, 'Tidewatch Keep')).toBeVisible()

    // Back returns to Character, Forward to Location, and a reload stays where it is.
    await page.goBack()
    await expect(title(page)).toHaveText('Character')
    await expect(typeLink(page, 'Character')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('entity-card')).toHaveCount(2)
    await page.goForward()
    await expect(title(page)).toHaveText('Location')
    await page.reload()
    await expect(title(page)).toHaveText('Location')
    await expect(typeLink(page, 'Location')).toHaveAttribute('aria-current', 'page')
    await expect(card(page, 'Tidewatch Keep')).toBeVisible()

    // ---------- Opening an entry, and coming back to the same type ----------

    await card(page, 'Tidewatch Keep').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await page.goBack()
    await expect(title(page)).toHaveText('Location')
    await expect(card(page, 'Tidewatch Keep')).toBeVisible()

    // The entry's type crumb leads back to that type too.
    await card(page, 'Tidewatch Keep').click()
    await page.getByTestId('entry-type').click()
    await expect(page).toHaveURL(new RegExp(`/lore\\?type=${ids.get('Location')}$`))

    // ---------- A custom type works exactly like a starter ----------

    await typeLink(page, 'Starship').click()
    await expect(title(page)).toHaveText('Starship')
    await expect(card(page, 'The Kestrel')).toBeVisible()
    const shipUrl = page.url()
    await page.goto('/app')
    await page.goto(shipUrl)
    await expect(typeLink(page, 'Starship')).toHaveAttribute('aria-current', 'page')

    // ---------- The filter and the status narrow within the type, and keep it ----------

    await typeLink(page, 'Character').click()
    await expect(title(page)).toHaveText('Character')
    await page.getByLabel('Filter entries').fill('warden')
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(card(page, 'Alenna Vance')).toBeVisible()

    // Changing type keeps the filter: Location's warden, not the whole list.
    await typeLink(page, 'Location').click()
    await expect(page.getByLabel('Filter entries')).toHaveValue('warden')
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(card(page, 'Tidewatch Keep')).toBeVisible()

    // Nothing matching says so, and offers to clear the filters - not to write a first entry.
    await statusChoice(page, 'Canon').click()
    await expect(statusChoice(page, 'Canon')).toHaveAttribute('aria-pressed', 'true')
    const empty = page.getByTestId('entity-empty')
    await expect(empty).toContainText('Nothing matches that.')
    await empty.getByRole('link', { name: 'Clear filters' }).click()
    await expect(page.getByLabel('Filter entries')).toHaveValue('')
    await expect(statusChoice(page, 'Any status')).toHaveAttribute('aria-pressed', 'true')
    await expect(title(page)).toHaveText('Location')
    await expect(card(page, 'Tidewatch Keep')).toBeVisible()

    // ---------- An empty type invites its first entry, in that type ----------

    await typeLink(page, 'Kingdom').click()
    await expect(empty).toContainText('No entries in this category yet.')
    await expect(empty).toContainText('Nothing is filed under Kingdom yet.')
    const create = page.getByTestId('new-entity')
    await expect(create).toHaveAccessibleName('New Kingdom')
    await empty.getByRole('link', { name: 'New Kingdom' }).click()
    await page.waitForURL(new RegExp(`/lore/new\\?type=${ids.get('Kingdom')}$`))
    await expect(page.getByLabel('Entry type')).toHaveValue(ids.get('Kingdom')!)
    // Still the author's choice: the type can be changed before the entry exists.
    await page.getByLabel('Entry type').selectOption({ label: 'Character' })
    await expect(page.getByLabel('Entry type')).toHaveValue(ids.get('Character')!)
    await page.goBack()

    // ---------- An id this universe does not have chooses nothing - never every entry ----------

    const requests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/entities?')) requests.push(request.url())
    })
    await page.goto(`/app/universes/${universeId}/lore?type=00000000-0000-0000-0000-000000000000`)
    await expect(page).toHaveURL(/\/lore$/)
    await expect(page.getByTestId('lore-catalog')).toBeVisible()
    await expect(page.getByTestId('entity-card')).toHaveCount(0)
    expect(requests).toEqual([])

    // ---------- The Trash stays out of it ----------

    expect(
      (await page.request.delete(`/api/universes/${universeId}/entities/${brannoch}`)).ok(),
    ).toBeTruthy()
    await typeCard(page, 'Character').click()
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(card(page, 'Brannoch Hale')).toHaveCount(0)

    // ---------- From the keyboard ----------

    // In the tab order straight after the page's create action: the first type, there being no All.
    await page.getByTestId('new-entity').focus()
    await page.keyboard.press('Tab')
    await expect(typeLink(page, 'Character')).toBeFocused()
    // A visible focus ring, not only a focused element.
    expect(
      await typeLink(page, 'Character').evaluate(
        (element) => getComputedStyle(element).outlineStyle,
      ),
    ).not.toBe('none')
    await page.keyboard.press('ArrowRight')
    await expect(typeLink(page, 'Location')).toBeFocused()
    await page.keyboard.press('End')
    await expect(typeLink(page, 'Kingdom')).toBeFocused()
    await page.keyboard.press('Home')
    await expect(typeLink(page, 'Character')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await expect(title(page)).toHaveText('Location')

    // A card is one link, opened from the keyboard, holding nothing else to press.
    const keep = card(page, 'Tidewatch Keep')
    await expect(keep.locator('a, button, input')).toHaveCount(0)
    await keep.focus()
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await expect(page.getByTestId('entry-name')).toHaveText('Tidewatch Keep')
  })

  test('wrap onto more rows on a desktop when a world has many - nothing scrolls sideways', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await signUp(page)
    const universeId = await newUniverse(page)

    for (const name of MANY_TYPES) await createType(page, universeId, name)
    const ids = await typeIds(page, universeId)
    await createEntry(page, universeId, ids.get('Character')!, 'Alenna Vance', 'Warden.')
    await createEntry(
      page,
      universeId,
      ids.get('Rumour of the Tide')!,
      'The Tide Vigil',
      'At dusk.',
    )

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)

    await expect(page.getByTestId('entity-card')).toHaveCount(0)
    // The catalog holds every type, a card each, and nothing scrolls sideways (Issue #60).
    await expect(page.getByTestId('lore-type-card')).toHaveCount(7 + MANY_TYPES.length)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)
    await typeCard(page, 'Character').click()
    await expect(title(page)).toHaveText('Character')

    // The seven starters and every added type - no All - over more than one row, every one inside the row's box.
    const links = typeNav(page).getByRole('link')
    await expect(links).toHaveCount(7 + MANY_TYPES.length)
    await expect(typeLink(page, 'All')).toHaveCount(0)
    const tops = await links.evaluateAll((all) =>
      all.map((link) => Math.round(link.getBoundingClientRect().top)),
    )
    expect(new Set(tops).size).toBeGreaterThan(1)
    const row = page.getByTestId('lore-types')
    expect(await row.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
    expect(await row.evaluate((element) => getComputedStyle(element).overflowX)).toBe('visible')
    const inside = await links.evaluateAll((all) => {
      const bounds = all[0].closest('ul')!.getBoundingClientRect()
      return all.every((link) => {
        const box = link.getBoundingClientRect()
        return box.left >= bounds.left - 1 && box.right <= bounds.right + 1
      })
    })
    expect(inside).toBe(true)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)

    // The last type, chosen by address, is simply there and marked current.
    await page.goto(`/app/universes/${universeId}/lore?type=${ids.get('Rumour of the Tide')}`)
    const last = typeLink(page, 'Rumour of the Tide')
    await expect(last).toHaveAttribute('aria-current', 'page')
    await expect(last).toBeInViewport()
    await expect(card(page, 'The Tide Vigil')).toBeVisible()
  })

  test('fills the workspace column on every screen, and the Lore grid turns that into columns', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await signUp(page)
    const universeId = await newUniverse(page)
    const ids = await typeIds(page, universeId)
    await createEntry(page, universeId, ids.get('Character')!, 'Alenna Vance', 'Warden.')

    // What the shell leaves a page - the column from the end of the sidebar to the edge of the
    // window - and what the canvas takes of it, with the rail and sidebar measured in their own
    // rem so this says nothing about one screen's pixels.
    const column = () =>
      page.locator('main.canvas').evaluate((element) => {
        const box = element.getBoundingClientRect()
        const rail = document.querySelector('.rail')!.getBoundingClientRect()
        const sidebar = document.querySelector('.sidebar')!.getBoundingClientRect()
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
        return {
          left: box.left - sidebar.right,
          right: document.documentElement.clientWidth - box.right,
          width: box.width,
          railRem: rail.width / rem,
          sidebarRem: sidebar.width / rem,
        }
      })

    // Every section fills that column, edge to edge, and none of them moves the chrome.
    for (const section of [
      'workspace-lore',
      'workspace-timeline',
      'workspace-world-rules',
      'workspace-canon',
      'workspace-types',
      'workspace-trash',
      'workspace-settings',
    ]) {
      await page.getByTestId(section).click()
      await expect.poll(async () => Math.round((await column()).left)).toBe(0)

      const box = await column()
      expect(Math.abs(box.right), section).toBeLessThanOrEqual(1)
      expect(box.railRem, section).toBeCloseTo(3.5, 1)
      expect(box.sidebarRem, section).toBeCloseTo(15, 1)
      expect(await pageOverflow(page), section).toBeLessThanOrEqual(1)
    }

    // ---------- The Lore browser ----------

    await page.goto(`/app/universes/${universeId}/lore?type=${ids.get('Character')}`)
    await expect(card(page, 'Alenna Vance')).toBeVisible()

    const grid = page.getByTestId('entity-grid')
    const columns = await grid.evaluate(
      (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
    )
    expect(columns).toBeGreaterThanOrEqual(4)

    // More columns rather than wider cards: none is as wide as two of the grid's narrowest.
    const first = (await card(page, 'Alenna Vance').boundingBox())!
    const narrowest = await grid.evaluate(
      (element) => parseFloat(getComputedStyle(element).fontSize) * 18,
    )
    expect(first.width).toBeLessThan(narrowest * 2)

    // Heading, types, filter and grid share one content area: the same left edge. The types' row
    // runs the content's whole width; Select acts on the list, so it sits under the types with the
    // list's controls, ending where the cards end (refinement 027).
    const heading = (await title(page).boundingBox())!
    const filter = (await page.getByLabel('Filter entries').boundingBox())!
    const types = (await page.getByTestId('lore-types').boundingBox())!
    const cards = (await grid.boundingBox())!
    for (const left of [heading.x, filter.x, types.x]) {
      expect(Math.abs(left - cards.x)).toBeLessThanOrEqual(3)
    }
    const select = (await page.getByTestId('lore-select').boundingBox())!
    expect(Math.abs(types.x + types.width - (cards.x + cards.width))).toBeLessThanOrEqual(3)
    expect(select.y).toBeGreaterThanOrEqual(types.y + types.height)
    expect(Math.abs(select.x + select.width - (cards.x + cards.width))).toBeLessThanOrEqual(3)

    // The primary action still answers to its name - the type in view - with an icon beside it.
    await expect(page.getByRole('link', { name: 'New Character', exact: true })).toBeVisible()

    // ---------- An entry's own page ----------

    await card(page, 'Alenna Vance').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await expect(page.getByTestId('entry-name')).toBeVisible()

    const entry = await column()
    expect(Math.abs(entry.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(entry.right)).toBeLessThanOrEqual(1)

    // The page fills the column, but its prose does not: a summary still reads at its own measure.
    const summary = (await page.getByTestId('entry-summary').boundingBox())!
    expect(summary.width).toBeLessThan(entry.width * 0.8)

    // ---------- A tablet is as it was ----------

    await page.setViewportSize({ width: 768, height: 1024 })
    await expect.poll(async () => Math.round((await column()).right)).toBe(0)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)

    await page.getByTestId('workspace-nav-toggle').click()
    await page.getByTestId('workspace-types').click()
    await page.waitForURL(/\/types$/)
    await expect.poll(async () => (await column()).width).toBeGreaterThan(700)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)
  })
})

test.describe('lore types on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test("are one labelled Type button, and a chosen type's first screen is cards", async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page)

    for (const name of MANY_TYPES) await createType(page, universeId, name)
    const ids = await typeIds(page, universeId)
    await createEntry(page, universeId, ids.get('Character')!, 'Alenna Vance', 'Warden.')
    await createEntry(page, universeId, ids.get('Ritual Circle')!, 'The Tide Vigil', 'At dusk.')

    await page.getByTestId('workspace-nav-toggle').click()
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await expect(page.getByTestId('entity-card')).toHaveCount(0)

    // The catalog first (Issue #60): every type a card a thumb can take, nothing sideways; a card opens its list.
    await expect(page.getByTestId('lore-type-card')).toHaveCount(7 + MANY_TYPES.length)
    expect(
      (await page.getByTestId('lore-type-card').first().boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)
    await typeCard(page, 'Character').tap()

    // One button that says what it chooses.
    const trigger = page.getByTestId('lore-type-menu')
    await expect(trigger).toHaveAccessibleName('Category: Character')
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect((await trigger.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)

    // Every type is in it, and focus lands on the first.
    await trigger.tap()
    const menu = page.getByTestId('lore-type-menu-panel')
    // The types; the starter groups follow them under their own heading (Issue #36).
    await expect(menu.locator('a[data-type-name]')).toHaveCount(7 + MANY_TYPES.length)
    await expect(menu.getByRole('link', { name: 'Character', exact: true })).toBeFocused()

    // Choosing one closes the menu, goes there, and hands the focus back to the button.
    await menu.getByRole('link', { name: 'Ritual Circle', exact: true }).tap()
    await expect(menu).toHaveCount(0)
    await expect(page).toHaveURL(new RegExp(`/lore\\?type=${ids.get('Ritual Circle')}$`))
    await expect(trigger).toHaveAccessibleName('Category: Ritual Circle')
    await expect(trigger).toBeFocused()
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(card(page, 'The Tide Vigil')).toBeVisible()

    // The first card is on the first screen, well above the fold - under the type menu and Filters, and since refinement
    // 027 the list's own row (Select), which a phone keeps out of the Filters panel so it is always reachable.
    const firstCard = (await page.getByTestId('entity-card').first().boundingBox())!
    expect(firstCard.y).toBeLessThanOrEqual(380)
    expect(await pageOverflow(page)).toBeLessThanOrEqual(1)

    // Escape closes it without choosing.
    await trigger.tap()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(trigger).toBeFocused()

    // Filters fold behind one button that counts what is on.
    const filters = page.getByTestId('lore-filters-toggle')
    await expect(page.getByLabel('Filter entries')).toBeHidden()
    await filters.tap()
    await expect(filters).toHaveAttribute('aria-expanded', 'true')
    await page.getByLabel('Filter entries').fill('nothing-like-this')
    await expect(filters).toContainText('1')
    await expect(page.getByTestId('entity-empty')).toContainText('Nothing matches that.')

    // One labelled create, at the bottom edge in reach of a thumb, for the type in view.
    const create = page.getByTestId('new-entity')
    await expect(create).toHaveAccessibleName('New Ritual Circle')
    const box = (await create.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.y + box.height).toBeGreaterThan(844 - 100)
    expect(box.y + box.height).toBeLessThanOrEqual(844)
    await expect(page.getByRole('link', { name: 'New Ritual Circle' })).toHaveCount(1)
  })
})
