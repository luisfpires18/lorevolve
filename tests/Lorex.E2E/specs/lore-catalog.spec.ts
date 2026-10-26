import { expect, test, type Browser, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * Lore's front page (Issue #60): with no type chosen, Lore is a catalog of the universe's own types - a card each, in the
 * hierarchy's order, with its icon, name, where it sits and how many entries its list holds - and above the cards a
 * "Browse by group" choice that narrows them by the groups' real membership. A card opens the same `?type=` list as
 * ever; Back, Forward, the Lore crumb and direct links all still land where they did.
 *
 * Each test registers its own account and builds its own universe.
 */

const PASSWORD = makeTestPassword()

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function post<T = { id: string }>(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data })
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
  return (await response.json()) as T
}

async function signUp(page: Page, prefix = 'catalog') {
  const username = unique(prefix)
  await post(page, '/api/auth/register', {
    username,
    email: `${username}@example.test`,
    password: PASSWORD,
  })
  return username
}

/**
 * The starter types, then Runes (described, with an icon and a colour) > Nature Runes > Verdant Runes and Corrupted Runes
 * beneath Runes, Kingdoms, a type with a very long name and one with nothing in it. Magic holds Runes and Nature Runes,
 * Realms holds Nature Runes and Kingdoms, so Nature Runes is in two groups and Verdant Runes in none. Lost is a group with
 * no type in it. Three Characters, one of them in the Trash.
 */
async function world(page: Page) {
  const u = (await post(page, '/api/universes', { name: unique('Arkhos '), description: null })).id
  const type = async (name: string, extra: Record<string, unknown> = {}) =>
    (
      await post(page, `/api/universes/${u}/entity-types`, {
        name,
        description: null,
        icon: null,
        accentColor: null,
        displayOrder: null,
        ...extra,
      })
    ).id
  const entry = async (entityTypeId: string, name: string) =>
    (
      await post(page, `/api/universes/${u}/entities`, {
        entityTypeId,
        name,
        summary: null,
        canonStatus: 2,
        aliases: [],
        tags: [],
        fields: [],
      })
    ).id
  const groupId = async (name: string) =>
    (
      (await (await page.request.get(`/api/universes/${u}/entity-type-groups`)).json()) as {
        id: string
        name: string
      }[]
    ).find((group) => group.name === name)!.id

  const runes = await type('Runes', {
    description: 'Marks of power carved into stone, steel and skin.',
    icon: 'sparkles',
    accentColor: '#7a4fb3',
    groups: [{ name: 'Magic' }],
  })
  const magic = await groupId('Magic')
  const kingdoms = await type('Kingdoms', { icon: 'crown', groups: [{ name: 'Realms' }] })
  const realms = await groupId('Realms')
  const nature = await type('Nature Runes', {
    parent: { id: runes },
    groups: [{ id: magic }, { id: realms }],
  })
  const verdant = await type('Verdant Runes', { parent: { id: nature } })
  const corrupted = await type('Corrupted Runes', { parent: { id: runes } })
  const long = await type(
    'The Ancient Order of the Long-Remembered Northern Watchtowers of the Drowned Coast',
  )
  const empty = await type('Empty Hollow', { groups: [{ name: 'Lost' }] })
  const lost = await groupId('Lost')
  // Out of Lost again: the group stays, with nothing in it.
  expect(
    (
      await page.request.put(`/api/universes/${u}/entity-types/${empty}`, {
        data: {
          name: 'Empty Hollow',
          description: null,
          icon: null,
          accentColor: null,
          displayOrder: null,
          groups: [],
        },
      })
    ).ok(),
  ).toBe(true)

  const types = (await (await page.request.get(`/api/universes/${u}/entity-types`)).json()) as {
    id: string
    name: string
  }[]
  const character = types.find((each) => each.name === 'Character')!.id
  await entry(character, 'Aragorn')
  await entry(character, 'Mara')
  const gone = await entry(character, 'Oren')
  expect((await page.request.delete(`/api/universes/${u}/entities/${gone}`)).ok()).toBe(true)
  await entry(runes, 'Old Rune')
  await entry(nature, 'Life Rune')
  await entry(verdant, 'Moss Rune')
  await entry(kingdoms, 'Arkazia')

  return {
    u,
    order: types.map((each) => each.name),
    ids: { character, runes, nature, verdant, corrupted, kingdoms, long, empty },
    groups: { magic, realms, lost },
    lore: (search = '') => `/app/universes/${u}/lore${search}`,
  }
}

const catalog = (page: Page) => page.getByTestId('lore-catalog')
const typeCards = (page: Page) => page.getByTestId('lore-type-card')
const typeCard = (page: Page, name: string) =>
  page.locator(`[data-testid="lore-type-card"][data-type-name="${name}"]`)
const chip = (page: Page, name: string) =>
  page.locator(`[data-testid="lore-browse-group"][data-group-name="${name}"]`)
const heading = (page: Page) => page.getByRole('heading', { level: 1 })
const entryCards = (page: Page) => page.getByTestId('entity-card')
const cardNames = (page: Page) =>
  typeCards(page).evaluateAll((cards) => cards.map((card) => card.getAttribute('data-type-name')))
const entryNames = (page: Page) =>
  entryCards(page)
    .evaluateAll((cards) => cards.map((card) => card.getAttribute('data-entity-name')))
    .then((names) => names.sort())
const sideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/** Every request the page makes for entries, counted from now. */
function entryReads(page: Page) {
  const reads: string[] = []
  page.on('request', (request) => {
    if (/\/entities\?/.test(request.url())) reads.push(request.url())
  })
  return reads
}

test.describe('Lore front page: the types as cards', () => {
  test('every type is a card in the hierarchy’s order; a card opens its list, and Back, Forward and the crumb return', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    const reads = entryReads(page)

    await page.goto(w.lore())
    await expect(heading(page)).toHaveText('Lore')
    await expect(catalog(page)).toBeVisible()
    // Every type the universe has - starters, custom, nested, empty, the long name - once each, in the hierarchy's order.
    await expect.poll(() => cardNames(page)).toEqual(w.order)
    // The cards are the way in: the type row and the group row wait for a choice, and no entry is read.
    await expect(page.getByTestId('lore-types')).toHaveCount(0)
    await expect(page.getByTestId('lore-groups')).toHaveCount(0)
    await expect(page.getByTestId('lore-filters-toggle')).toHaveCount(0)
    await expect(entryCards(page)).toHaveCount(0)
    await page.waitForTimeout(400)
    expect(reads).toEqual([])

    // A card says what it is: its name is the link's name; its icon, place, description and count are its details.
    const runes = typeCard(page, 'Runes')
    await expect(runes).toHaveAccessibleName('Runes')
    await expect(runes).toHaveAccessibleDescription(
      /Marks of power carved into stone, steel and skin\.\s*3 entries · 2 nested types/,
    )
    await expect(runes.locator('svg')).toHaveAttribute('data-icon', 'sparkles')
    await expect(typeCard(page, 'Kingdoms').locator('svg')).toHaveAttribute('data-icon', 'crown')
    await expect(typeCard(page, 'Empty Hollow').locator('svg')).toHaveAttribute(
      'data-icon',
      'fallback',
    )
    // The count is what the list will show: the Trash left out, nested types' entries in.
    await expect(typeCard(page, 'Character')).toContainText('2 entries')
    await expect(typeCard(page, 'Nature Runes')).toContainText('In Runes')
    await expect(typeCard(page, 'Nature Runes')).toContainText('2 entries · 1 nested type')
    await expect(typeCard(page, 'Verdant Runes')).toContainText('In Runes › Nature Runes')
    await expect(typeCard(page, 'Verdant Runes')).toContainText('1 entry')
    await expect(typeCard(page, 'Empty Hollow')).toContainText('No entries yet')
    await expect(typeCard(page, 'Corrupted Runes')).toContainText('No entries yet')
    const long = typeCard(
      page,
      'The Ancient Order of the Long-Remembered Northern Watchtowers of the Drowned Coast',
    )
    await expect(long).toHaveAccessibleName(
      'The Ancient Order of the Long-Remembered Northern Watchtowers of the Drowned Coast',
    )
    expect(await sideways(page)).toBeLessThanOrEqual(0)

    // Runes opens the list Lore always had: its branch, its filters, its row with Runes current.
    await runes.click()
    await expect(page).toHaveURL(new RegExp(`/lore\\?type=${w.ids.runes}$`))
    await expect(heading(page)).toHaveText('Runes')
    await expect.poll(() => entryNames(page)).toEqual(['Life Rune', 'Moss Rune', 'Old Rune'])
    await expect(
      page.getByTestId('lore-categories').locator('[data-type-name="Runes"]'),
    ).toHaveAttribute('aria-current', 'page')
    await expect(page.getByLabel('Filter entries')).toHaveAttribute('placeholder', 'Search Runes')
    await expect(page.getByRole('group', { name: 'Status' })).toBeVisible()
    await expect(page.getByTestId('lore-select')).toBeVisible()
    await expect(page.getByTestId('new-entity')).toHaveAccessibleName('New Runes')
    await expect(catalog(page)).toHaveCount(0)

    // Back is the catalog again, Forward the list, and a reload keeps it.
    await page.goBack()
    await expect(page).toHaveURL(/\/lore$/)
    await expect(heading(page)).toHaveText('Lore')
    await expect(typeCards(page)).toHaveCount(w.order.length)
    await page.goForward()
    await expect(heading(page)).toHaveText('Runes')
    await page.reload()
    await expect(heading(page)).toHaveText('Runes')

    // A nested type's crumb: Lore leads back to the catalog.
    await page.goto(w.lore(`?type=${w.ids.verdant}`))
    await expect(page.getByTestId('lore-path')).toHaveText('Lore›Runes›Nature Runes')
    await expect.poll(() => entryNames(page)).toEqual(['Moss Rune'])
    await page.getByTestId('lore-path-root').click()
    await expect(page).toHaveURL(/\/lore$/)
    await expect(catalog(page)).toBeVisible()

    // Direct links with the list's own state open that state: a status, a search, an empty type.
    await page.goto(w.lore(`?type=${w.ids.character}&status=2&q=ara`))
    await expect(heading(page)).toHaveText('Character')
    await expect(page.getByRole('button', { name: 'Canon', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect.poll(() => entryNames(page)).toEqual(['Aragorn'])
    await page.goto(w.lore(`?type=${w.ids.empty}`))
    await expect(page.getByTestId('entity-empty')).toContainText('No entries in this category yet.')

    // A type this universe does not have leaves the catalog, and still reads nothing for it.
    await page.goto(w.lore('?type=00000000-0000-0000-0000-000000000000'))
    await expect(page).toHaveURL(/\/lore$/)
    await expect(catalog(page)).toBeVisible()
  })

  test('Browse by group narrows the cards by membership, keeps ungrouped types under All types, and leads into the group’s list', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    const reads = entryReads(page)
    await page.goto(w.lore())

    const browse = page.getByRole('group', { name: 'Browse by group' })
    await expect(browse).toBeVisible()
    const all = page.getByTestId('lore-browse-all')
    await expect(all).toHaveAttribute('aria-pressed', 'true')
    // A group is told from a type by more than its name: a pressed chip, its own icon, "(group)" when read out.
    await expect(chip(page, 'Magic')).toHaveAccessibleName('Magic (group)')
    await expect(chip(page, 'Magic')).toHaveAttribute('aria-pressed', 'false')
    await expect(chip(page, 'Magic').locator('svg')).toBeVisible()

    // Magic: exactly its members, in the hierarchy's order; the address says so without a new history entry.
    await chip(page, 'Magic').click()
    await expect(page).toHaveURL(new RegExp(`/lore\\?browse=${w.groups.magic}$`))
    await expect(chip(page, 'Magic')).toHaveAttribute('aria-pressed', 'true')
    await expect(all).toHaveAttribute('aria-pressed', 'false')
    await expect.poll(() => cardNames(page)).toEqual(['Runes', 'Nature Runes'])
    await expect(page.getByTestId('lore-catalog-status')).toContainText('2 types in Magic.')

    // Realms overlaps Magic: Nature Runes is under both.
    await chip(page, 'Realms').click()
    await expect.poll(() => cardNames(page)).toEqual(['Nature Runes', 'Kingdoms'])

    // A card opens its list; Back finds the cards as they were narrowed.
    await typeCard(page, 'Kingdoms').click()
    await expect(heading(page)).toHaveText('Kingdoms')
    await expect.poll(() => entryNames(page)).toEqual(['Arkazia'])
    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`browse=${w.groups.realms}`))
    await expect(chip(page, 'Realms')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => cardNames(page)).toEqual(['Nature Runes', 'Kingdoms'])
    await page.waitForTimeout(400)
    const catalogReads = reads.length

    // The group's own list is one link away, and still the list a group link always opened.
    await page.getByTestId('lore-browse-group-entries').click()
    await expect(page).toHaveURL(new RegExp(`/lore\\?group=${w.groups.realms}$`))
    await expect(heading(page)).toHaveText('Realms')
    await expect.poll(() => entryNames(page)).toEqual(['Arkazia', 'Life Rune'])
    expect(reads.length).toBeGreaterThan(catalogReads)
    await expect(
      page.getByTestId('lore-groups').locator('[data-group-name="Realms"]'),
    ).toHaveAttribute('aria-current', 'page')
    await page.getByTestId('lore-path-root').click()
    await expect(page).toHaveURL(/\/lore$/)
    await expect(all).toHaveAttribute('aria-pressed', 'true')

    // All types: every type again, the ungrouped ones included.
    await chip(page, 'Magic').click()
    await all.click()
    await expect(page).toHaveURL(/\/lore$/)
    await expect.poll(() => cardNames(page)).toEqual(w.order)
    await expect(typeCard(page, 'Verdant Runes')).toBeVisible()
    await expect(typeCard(page, 'Corrupted Runes')).toBeVisible()

    // A group with no type in it says so and where to add one.
    await chip(page, 'Lost').click()
    await expect(typeCards(page)).toHaveCount(0)
    await expect(page.getByTestId('lore-catalog-status')).toContainText('No type is in Lost yet.')
    await expect(
      page.getByTestId('lore-catalog-status').getByRole('link', { name: 'Types' }),
    ).toHaveAttribute('href', `/app/universes/${w.u}/types`)

    // A group the universe does not have is taken out of the address; every type shows.
    await page.goto(w.lore('?browse=00000000-0000-0000-0000-000000000000'))
    await expect(page).toHaveURL(/\/lore$/)
    await expect(typeCards(page)).toHaveCount(w.order.length)

    // A saved group link opens the group's list directly.
    await page.goto(w.lore(`?group=${w.groups.magic}`))
    await expect(heading(page)).toHaveText('Magic')
    // Exactly the group's member types: Verdant Runes, beneath a member but not one itself, is not in it.
    await expect.poll(() => entryNames(page)).toEqual(['Life Rune', 'Old Rune'])
  })

  test('from the keyboard: the groups are pressed toggles, a card opens with Enter, and focus is drawn', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await page.goto(w.lore())
    await expect(catalog(page)).toBeVisible()

    await page.getByTestId('lore-browse-all').focus()
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('lore-browse-group').first()).toBeFocused()
    await chip(page, 'Magic').focus()
    await page.keyboard.press('Space')
    await expect(chip(page, 'Magic')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => cardNames(page)).toEqual(['Runes', 'Nature Runes'])

    const card = typeCard(page, 'Runes')
    await card.focus()
    expect(await card.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
      'none',
    )
    await page.keyboard.press('Tab')
    await expect(typeCard(page, 'Nature Runes')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(heading(page)).toHaveText('Nature Runes')
  })

  test('a Viewer browses the same catalog and creates nothing; another account sees none of it', async ({
    browser,
    page,
  }) => {
    await signUp(page, 'catalogowner')
    const w = await world(page)
    const viewer = await member(browser, page, w.u, 1)

    await viewer.goto(w.lore())
    await expect.poll(() => cardNames(viewer)).toEqual(w.order)
    await expect(typeCard(viewer, 'Character')).toContainText('2 entries')
    await expect(viewer.getByTestId('new-entity')).toHaveCount(0)
    await expect(viewer.getByTestId('mass-create')).toHaveCount(0)
    await typeCard(viewer, 'Runes').click()
    await expect.poll(() => entryNames(viewer)).toEqual(['Life Rune', 'Moss Rune', 'Old Rune'])
    await viewer.context().close()

    // Someone outside the universe: no catalog, no type name, no count.
    const outsider = await (await browser.newContext()).newPage()
    await signUp(outsider, 'catalogoutsider')
    const reading = await outsider.request.get(`/api/universes/${w.u}/entity-types`)
    expect(reading.ok()).toBe(false)
    await outsider.goto(w.lore())
    await expect(outsider.getByTestId('lore-catalog')).toHaveCount(0)
    await expect(outsider.getByText('Nature Runes')).toHaveCount(0)
    await expect(outsider.getByText('2 entries')).toHaveCount(0)
    await outsider.context().close()
  })

  test('a failed read of the types says so and recovers, and a world without types says where to add one', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    // Reads of the types are lost, as on a poor connection, until the author tries again.
    let offline = true
    await page.route(
      (url) => url.pathname.endsWith(`/api/universes/${w.u}/entity-types`),
      (route) => (offline ? route.abort('failed') : route.continue()),
    )

    await page.goto(w.lore())
    await expect(page.getByTestId('lore-types-error')).toBeVisible()
    await expect(catalog(page)).toHaveCount(0)
    await expect(page.getByTestId('lore-no-types')).toHaveCount(0)
    offline = false
    await page.getByTestId('lore-types-error').getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByTestId('lore-types-error')).toHaveCount(0)
    await expect.poll(() => cardNames(page)).toEqual(w.order)

    // A fresh universe with every type deleted: one line to Types, no catalog.
    const bare = (await post(page, '/api/universes', { name: unique('Bare '), description: null }))
      .id
    const starters = (await (
      await page.request.get(`/api/universes/${bare}/entity-types`)
    ).json()) as { id: string }[]
    for (const each of starters)
      expect(
        (await page.request.delete(`/api/universes/${bare}/entity-types/${each.id}`)).ok(),
      ).toBe(true)
    await page.goto(`/app/universes/${bare}/lore`)
    await expect(page.getByTestId('lore-no-types')).toBeVisible()
    await expect(catalog(page)).toHaveCount(0)
  })
})

test.describe('Lore front page on a phone', () => {
  for (const width of [390, 360]) {
    test(`${width}px: one column of cards, one line of groups, nothing sideways; a card opens the list and its menu`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 })
      await signUp(page)
      const w = await world(page)
      await page.goto(w.lore())

      await expect.poll(() => cardNames(page)).toEqual(w.order)
      expect(await sideways(page)).toBeLessThanOrEqual(0)
      // One column: every card starts at the same left edge.
      const lefts = await typeCards(page).evaluateAll((cards) => [
        ...new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left))),
      ])
      expect(lefts).toHaveLength(1)
      // The groups keep to one line that scrolls inside itself.
      const groups = page.getByTestId('lore-browse-groups')
      const tops = await groups
        .locator('button')
        .evaluateAll((chips) => [
          ...new Set(chips.map((each) => Math.round(each.getBoundingClientRect().top))),
        ])
      expect(tops).toHaveLength(1)
      const scroll = await groups.evaluate((element) => ({
        client: element.clientWidth,
        scroll: element.scrollWidth,
      }))
      expect(scroll.scroll).toBeGreaterThan(scroll.client)
      await chip(page, 'Lost').scrollIntoViewIfNeeded()
      await chip(page, 'Lost').click()
      await expect(typeCards(page)).toHaveCount(0)
      expect(await sideways(page)).toBeLessThanOrEqual(0)
      await page.getByTestId('lore-browse-all').scrollIntoViewIfNeeded()
      await page.getByTestId('lore-browse-all').click()

      await typeCard(page, 'Runes').click()
      await expect(heading(page)).toHaveText('Runes')
      await expect(page.getByTestId('lore-type-menu')).toHaveAccessibleName('Category: Runes')
      await expect.poll(() => entryNames(page)).toEqual(['Life Rune', 'Moss Rune', 'Old Rune'])
      expect(await sideways(page)).toBeLessThanOrEqual(0)
    })
  }
})

/** Someone else, invited with this role and accepted, in a browser of their own. */
async function member(browser: Browser, owner: Page, universeId: string, role: number) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const username = await signUp(page, 'catalogviewer')
  const invitation = await owner.request.post(`/api/universes/${universeId}/invitations`, {
    data: { email: `${username}@example.test`, role },
  })
  expect(invitation.ok()).toBe(true)
  const { claimToken } = (await invitation.json()) as { claimToken: string }
  const accepted = await page.request.post(
    `/api/invitations/claim/${encodeURIComponent(claimToken)}/accept`,
  )
  expect(accepted.ok(), await accepted.text()).toBe(true)
  return page
}
