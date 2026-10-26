import { expect, test, type Browser, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * Refinement 034: Lore narrowed by the chosen type's own fields. A filter starts from a field's name, is applied whole or
 * not at all, lives in the address (so refresh, Back and Forward and a shared link all keep it), and leaves with the type.
 * The API's own rules - every kind's comparisons, missing values, refusals - are the API tests'; this proves what a person
 * does and sees. Every test builds its own world through the API, so nothing depends on shared data.
 */

const PASSWORD = makeTestPassword()

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function post<T = { id: string }>(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data })
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()) as T
}

async function signUp(page: Page, prefix = 'filterer') {
  const username = unique(prefix)
  await post(page, '/api/auth/register', {
    username,
    email: `${username}@example.test`,
    password: PASSWORD,
  })
  return username
}

interface Field {
  id: string
  name: string
  options: { id: string; value: string }[]
}

/**
 * Hero, with a field of every kind but Date filterable, and Squire beneath it with no fields. Aria, Bran and Cato carry
 * values, Dax none. Two Realms are called Arkazia. Hero gets enough plain entries to need a second page.
 */
async function world(page: Page) {
  const u = (
    await post(page, '/api/universes', {
      name: unique('Filter World '),
      description: null,
      accentColor: null,
    })
  ).id
  const type = async (name: string, parent: string | null = null) =>
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
  const hero = await type('Hero')
  const squire = await type('Squire', hero)
  const realm = await type('Realm')
  const dated = await type('Chronicle')

  const field = async (
    typeId: string,
    name: string,
    kind: number,
    options: string[] | null = null,
  ) => {
    const read = await post<{ fields: Field[] }>(
      page,
      `/api/universes/${u}/entity-types/${typeId}/fields`,
      {
        name,
        kind,
        isRequired: false,
        displayOrder: null,
        defaultValue: null,
        options,
      },
    )
    return read.fields.find((each) => each.name === name)!
  }
  const title = await field(hero, 'Title', 0)
  const age = await field(hero, 'Age', 2)
  const alive = await field(hero, 'Alive', 3)
  const house = await field(hero, 'House', 5, ['Amber', 'Basalt'])
  const element = await field(hero, 'Element', 6, ['Fire', 'Water', 'Earth'])
  const kingdom = await field(hero, 'Kingdom', 7)
  await field(dated, 'Founded', 4)
  const option = (f: Field, value: string) => f.options.find((each) => each.value === value)!.id

  const entry = async (typeId: string, name: string, fields: unknown[] = []) =>
    (
      await post(page, `/api/universes/${u}/entities`, {
        entityTypeId: typeId,
        name,
        summary: null,
        canonStatus: 0,
        aliases: [],
        tags: [],
        fields,
      })
    ).id
  const value = (fieldDefinitionId: string, rest: Record<string, unknown>) => ({
    fieldDefinitionId,
    text: null,
    number: null,
    boolean: null,
    date: null,
    optionIds: null,
    referencedEntityId: null,
    ...rest,
  })

  const arkazia = await entry(realm, 'Arkazia')
  const otherArkazia = await entry(realm, 'Arkazia')
  await entry(hero, 'Aria', [
    value(title.id, { text: 'Queen of %Ash_' }),
    value(age.id, { number: 34.5 }),
    value(alive.id, { boolean: true }),
    value(house.id, { optionIds: [option(house, 'Amber')] }),
    value(element.id, { optionIds: [option(element, 'Fire'), option(element, 'Water')] }),
    value(kingdom.id, { referencedEntityId: arkazia }),
  ])
  await entry(hero, 'Bran', [
    value(title.id, { text: 'Smith' }),
    value(age.id, { number: 20 }),
    value(alive.id, { boolean: false }),
    value(house.id, { optionIds: [option(house, 'Basalt')] }),
    value(element.id, { optionIds: [option(element, 'Water')] }),
  ])
  await entry(hero, 'Cato', [
    value(title.id, { text: 'queen of ash' }),
    value(age.id, { number: 41 }),
    value(alive.id, { boolean: true }),
    value(element.id, { optionIds: [option(element, 'Earth')] }),
    value(kingdom.id, { referencedEntityId: otherArkazia }),
  ])
  await entry(hero, 'Dax')
  await entry(squire, 'Eli')

  return {
    u,
    hero,
    squire,
    realm,
    dated,
    title,
    age,
    alive,
    house,
    element,
    kingdom,
    option,
    arkazia,
  }
}

type World = Awaited<ReturnType<typeof world>>

async function openLore(page: Page, w: World, typeId = w.hero, extra = '') {
  await page.goto(`/app/universes/${w.u}/lore?type=${typeId}${extra}`)
}

/** The names on the grid, in order, once the list has settled on exactly these. */
async function expectNames(page: Page, names: string[]) {
  const cards = page.getByTestId('entity-card')
  if (names.length === 0) {
    await expect(page.getByTestId('entity-empty')).toBeVisible()
    await expect(cards).toHaveCount(0)
    return
  }
  await expect
    .poll(async () =>
      (
        await cards.evaluateAll((all) => all.map((card) => card.getAttribute('data-entity-name')))
      ).sort(),
    )
    .toEqual([...names].sort())
}

/** Add field filter → the field → how → the value → Apply. */
async function addFilter(
  page: Page,
  field: string,
  how: string | null,
  value: string | { option: string },
) {
  await page.getByTestId('lore-add-field-filter').click()
  await page
    .getByTestId('lore-field-filter-menu')
    .getByRole('button', { name: field, exact: true })
    .click()
  const editor = page.getByTestId('lore-field-filter-editor')
  await expect(editor).toBeVisible()
  if (how !== null) await editor.getByTestId('lore-field-filter-op').selectOption({ label: how })
  const control = editor.getByTestId('lore-field-filter-value')
  if (typeof value === 'string') await control.fill(value)
  else await control.selectOption({ label: value.option })
  await editor.getByTestId('lore-field-filter-apply').click()
  await expect(editor).toHaveCount(0)
}

function addressFilters(page: Page) {
  return new URL(page.url()).searchParams.getAll('field')
}

test.describe('Lore field filters', () => {
  test('a text filter narrows the list, lives in the address, and survives refresh, Back and Forward', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await openLore(page, w)
    await expectNames(page, ['Aria', 'Bran', 'Cato', 'Dax', 'Eli'])

    // Nothing changes while the editor is open and unfinished: Apply waits for a value.
    await page.getByTestId('lore-add-field-filter').click()
    await page
      .getByTestId('lore-field-filter-menu')
      .getByRole('button', { name: 'Title', exact: true })
      .click()
    const editor = page.getByTestId('lore-field-filter-editor')
    await expect(editor.getByTestId('lore-field-filter-value')).toBeFocused()
    await expect(editor.getByTestId('lore-field-filter-apply')).toBeDisabled()
    await editor.getByTestId('lore-field-filter-value').fill('   ')
    await expect(editor.getByTestId('lore-field-filter-apply')).toBeDisabled()
    expect(addressFilters(page)).toEqual([])
    await editor.getByTestId('lore-field-filter-cancel').click()
    await expect(editor).toHaveCount(0)
    await expect(page.getByTestId('lore-add-field-filter')).toBeFocused()

    // Text with the address's own characters in it: & = % _ : # and a space, read as text.
    await addFilter(page, 'Title', 'contains', '%Ash_')
    await expectNames(page, ['Aria'])
    await expect(page.getByTestId('lore-field-filter')).toHaveText(['Title contains %Ash_'])
    expect(addressFilters(page)).toEqual([`${w.title.id}:contains:%Ash_`])

    await addFilter(page, 'Title', 'contains', 'a & b = c#: d')
    await expectNames(page, [])
    expect(addressFilters(page)).toEqual([
      `${w.title.id}:contains:%Ash_`,
      `${w.title.id}:contains:a & b = c#: d`,
    ])

    await page.reload()
    await expectNames(page, [])
    await expect(page.getByTestId('lore-field-filter')).toHaveText([
      'Title contains %Ash_',
      'Title contains a & b = c#: d',
    ])

    await page.goBack()
    await expectNames(page, ['Aria'])
    await page.goBack()
    await expectNames(page, ['Aria', 'Bran', 'Cato', 'Dax', 'Eli'])
    await page.goForward()
    await expectNames(page, ['Aria'])
    await expect(page.getByTestId('lore-field-filter')).toHaveText(['Title contains %Ash_'])
  })

  test('number, yes or no, choose-one and choose-several filters, the same field twice, removing one and clearing all', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await openLore(page, w, w.hero, '&page=2')

    // A filter is a new list: back on its first page.
    await addFilter(page, 'Age', 'is more than', '20')
    expect(new URL(page.url()).searchParams.get('page')).toBeNull()
    await expectNames(page, ['Aria', 'Cato'])

    await addFilter(page, 'Age', 'is less than', '40.5')
    await expectNames(page, ['Aria'])

    await page.getByRole('button', { name: 'Remove filter: Age is less than 40.5' }).click()
    await expectNames(page, ['Aria', 'Cato'])
    await page.getByRole('button', { name: 'Remove filter: Age is more than 20' }).click()

    // Yes or no needs no comparison of its own.
    await page.getByTestId('lore-add-field-filter').click()
    await page
      .getByTestId('lore-field-filter-menu')
      .getByRole('button', { name: 'Alive', exact: true })
      .click()
    await expect(page.getByTestId('lore-field-filter-op')).toHaveCount(0)
    await page.getByTestId('lore-field-filter-value').selectOption({ label: 'No' })
    await page.getByTestId('lore-field-filter-apply').click()
    await expectNames(page, ['Bran'])
    await expect(page.getByTestId('lore-field-filter')).toHaveText(['Alive is No'])
    await page.getByRole('button', { name: 'Remove filter: Alive is No' }).click()

    await addFilter(page, 'House', 'is not', { option: 'Amber' })
    await expectNames(page, ['Bran'])
    await page.getByRole('button', { name: 'Remove filter: House is not Amber' }).click()

    // The same field twice is both.
    await addFilter(page, 'Element', 'includes', { option: 'Water' })
    await expectNames(page, ['Aria', 'Bran'])
    await addFilter(page, 'Element', 'includes', { option: 'Fire' })
    await expectNames(page, ['Aria'])
    await expect(page.getByTestId('lore-field-filter')).toHaveText([
      'Element includes Water',
      'Element includes Fire',
    ])

    // With search and status: Clear filters takes all of them, and keeps the type.
    await page.getByLabel('Filter entries').fill('Bran')
    await expectNames(page, [])
    await page.getByTestId('lore-clear-filters').click()
    await expectNames(page, ['Aria', 'Bran', 'Cato', 'Dax', 'Eli'])
    expect(addressFilters(page)).toEqual([])
    expect(new URL(page.url()).searchParams.get('type')).toBe(w.hero)
    await expect(page.getByLabel('Filter entries')).toHaveValue('')
  })

  test('a linked-entry filter finds the exact entry chosen, never another of the same name', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await openLore(page, w)

    await page.getByTestId('lore-add-field-filter').click()
    await page
      .getByTestId('lore-field-filter-menu')
      .getByRole('button', { name: 'Kingdom', exact: true })
      .click()
    const editor = page.getByTestId('lore-field-filter-editor')
    await editor.getByTestId('picker-input').fill('Arkazia')
    // Two Arkazias, told apart by nothing but which one: choose the first created.
    const options = editor.getByRole('listbox').getByRole('option')
    await expect(options).toHaveCount(2)
    await expect(options.first()).toContainText('Realm')
    await options.first().click()
    await editor.getByTestId('lore-field-filter-apply').click()

    const filter = addressFilters(page)[0]
    expect(filter.startsWith(`${w.kingdom.id}:is:`)).toBe(true)
    const chosen = filter.split(':')[2]
    await expectNames(page, [chosen === w.arkazia ? 'Aria' : 'Cato'])
    await expect(page.getByTestId('lore-field-filter')).toHaveText(['Kingdom is Arkazia (Realm)'])

    // Read back from the address alone, the entry is still named, not shown as an id.
    await page.reload()
    await expect(page.getByTestId('lore-field-filter')).toHaveText(['Kingdom is Arkazia (Realm)'])
  })

  test('another type starts with no field filters; Back brings them back; a type with nothing to filter offers nothing', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await openLore(page, w)
    await addFilter(page, 'Age', 'is more than', '30')
    await expectNames(page, ['Aria', 'Cato'])

    await page.getByTestId('lore-types').getByRole('link', { name: 'Realm', exact: true }).click()
    expect(addressFilters(page)).toEqual([])
    await expectNames(page, ['Arkazia', 'Arkazia'])
    await expect(page.getByTestId('lore-field-filters')).toHaveCount(0)

    await page.goBack()
    await expect(page.getByTestId('lore-field-filter')).toHaveText(['Age is more than 30'])
    await expectNames(page, ['Aria', 'Cato'])

    // No fields of its own (Squire), or only a date (Chronicle): no Add field filter at all.
    await openLore(page, w, w.squire)
    await expectNames(page, ['Eli'])
    await expect(page.getByTestId('lore-add-field-filter')).toHaveCount(0)
    await openLore(page, w, w.dated)
    await expect(page.getByTestId('lore-controls')).toBeVisible()
    await expect(page.getByTestId('lore-add-field-filter')).toHaveCount(0)
  })

  test('scope and narrowing stay apart: a branch and a group say what field filters can do, and Clear filters is one move Back undoes', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)

    // Hero holds Squire: once a field filter is on, it says it matches Hero's own entries only (Issue #49).
    await openLore(page, w)
    await expect(page.getByTestId('lore-branch-field-hint')).toHaveCount(0)
    await expect(page.getByTestId('lore-reset-filters')).toHaveCount(0)
    await addFilter(page, 'Age', 'is more than', '30')
    await page.getByRole('group', { name: 'Status' }).getByRole('button', { name: 'Idea' }).click()
    await expectNames(page, ['Aria', 'Cato'])
    await expect(page.getByTestId('lore-branch-field-hint')).toHaveText(
      'Field filters match Hero entries only. Types filed inside it have their own fields.',
    )

    // Clear filters: status and fields gone at once, the type kept, the focus on the search - and Back brings them back.
    await page.getByTestId('lore-reset-filters').click()
    await expect.poll(() => addressFilters(page)).toEqual([])
    const cleared = new URL(page.url()).searchParams
    expect([cleared.get('type'), cleared.get('status')]).toEqual([w.hero, null])
    await expect(page.getByLabel('Filter entries')).toBeFocused()
    await expect(page.getByTestId('lore-reset-filters')).toHaveCount(0)
    await page.goBack()
    await expect(page.getByTestId('lore-field-filter')).toHaveText(['Age is more than 30'])
    expect(new URL(page.url()).searchParams.get('status')).toBe('0')
    await expectNames(page, ['Aria', 'Cato'])

    // Champions: Knight, with a field, and Herald, with none.
    const typeBody = { description: null, icon: null, accentColor: null, displayOrder: null }
    const knight = (
      await post(page, `/api/universes/${w.u}/entity-types`, {
        ...typeBody,
        name: 'Knight',
        groups: [{ id: null, name: 'Champions' }],
      })
    ).id
    const groups = (await (
      await page.request.get(`/api/universes/${w.u}/entity-type-groups`)
    ).json()) as { id: string; name: string }[]
    const champions = groups.find((group) => group.name === 'Champions')!.id
    await post(page, `/api/universes/${w.u}/entity-types`, {
      ...typeBody,
      name: 'Herald',
      groups: [{ id: champions }],
    })
    await post(page, `/api/universes/${w.u}/entity-types/${knight}/fields`, {
      name: 'Oath',
      kind: 0,
      isRequired: false,
      displayOrder: null,
      defaultValue: null,
      options: null,
    })
    await post(page, `/api/universes/${w.u}/entities`, {
      entityTypeId: knight,
      name: 'Kara',
      summary: null,
      canonStatus: 0,
      aliases: [],
      tags: [],
      fields: [],
    })

    // A field filter left in a group's address is taken out in place, never silently ignored; the group offers no Add
    // field filter, and says which of its types can be filtered by fields instead.
    const field = encodeURIComponent(`${w.age.id}:gt:30`)
    await page.goto(`/app/universes/${w.u}/lore?group=${champions}&status=0&q=Kara&field=${field}`)
    await expectNames(page, ['Kara'])
    await expect.poll(() => addressFilters(page)).toEqual([])
    await expect(page.getByTestId('lore-add-field-filter')).toHaveCount(0)
    const hint = page.getByTestId('lore-group-field-hint')
    await expect(hint).toHaveText('To filter by fields, choose one type: Knight.')

    // The member type is the new scope, search and status kept.
    await hint.getByRole('link', { name: 'Knight' }).click()
    await expect(page.getByTestId('lore-add-field-filter')).toBeVisible()
    await expectNames(page, ['Kara'])
    const scoped = new URL(page.url()).searchParams
    expect(['type', 'group', 'status', 'q'].map((key) => scoped.get(key))).toEqual([
      knight,
      null,
      '0',
      'Kara',
    ])
  })

  test('an address with filters the type cannot answer is cleaned in place, keeping the ones it can', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    const good = `${w.age.id}:gt:30`
    const stale = [
      `${crypto.randomUUID()}:eq:gone`,
      `${w.age.id}:contains:3`,
      `${w.age.id}:gt:thirty`,
      `${w.house.id}:is:${crypto.randomUUID()}`,
      'not-a-filter',
    ]
    const extra = [good, ...stale].map((token) => `&field=${encodeURIComponent(token)}`).join('')
    await openLore(page, w, w.hero, extra)

    await expectNames(page, ['Aria', 'Cato'])
    await expect.poll(() => addressFilters(page)).toEqual([good])
    await expect(page.getByTestId('lore-field-filter')).toHaveText(['Age is more than 30'])
    await expect(page.getByTestId('lore-load-error')).toHaveCount(0)

    // Replaced, not pushed: Back leaves Lore rather than returning to the stale address.
    expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(2)
  })

  test('ten filters is the most, and the Add button says so', async ({ page }) => {
    await signUp(page)
    const w = await world(page)
    const extra = Array.from(
      { length: 10 },
      () => `&field=${encodeURIComponent(`${w.age.id}:gt:1`)}`,
    ).join('')
    await openLore(page, w, w.hero, extra)
    await expectNames(page, ['Aria', 'Bran', 'Cato'])
    await expect(page.getByTestId('lore-add-field-filter')).toHaveCount(0)
    await expect(page.getByTestId('lore-field-filter-limit')).toBeVisible()
  })

  test('a Viewer filters as well as anyone: reading is all it takes', async ({ browser, page }) => {
    await signUp(page, 'filterowner')
    const w = await world(page)
    const viewer = await member(browser, page, w.u, 1)

    await openLore(viewer, w)
    await addFilter(viewer, 'Alive', null, { option: 'Yes' })
    await expectNames(viewer, ['Aria', 'Cato'])
    await viewer.context().close()
  })

  for (const width of [390, 360]) {
    test(`on a ${width}px phone the filters fold behind Filters, which counts them, and nothing scrolls sideways`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 })
      await signUp(page)
      const w = await world(page)
      await openLore(page, w, w.hero, '&status=0')

      const toggle = page.getByTestId('lore-filters-toggle')
      await expect(toggle).toBeVisible()
      await expect(page.getByTestId('lore-add-field-filter')).toBeHidden()
      await toggle.click()

      await addFilter(page, 'Age', 'is more than', '1')
      await addFilter(page, 'Element', 'includes', { option: 'Water' })
      await expectNames(page, ['Aria', 'Bran'])
      await expect(toggle.locator('.lore__filtercount')).toHaveText('3')

      // An editor half filled in counts for nothing, and stacks rather than squeezing onto one line.
      await page.getByTestId('lore-add-field-filter').click()
      await page
        .getByTestId('lore-field-filter-menu')
        .getByRole('button', { name: 'Title', exact: true })
        .click()
      await expect(toggle.locator('.lore__filtercount')).toHaveText('3')
      const name = await page.locator('.lore__fieldeditorname').boundingBox()
      const value = await page.getByTestId('lore-field-filter-value').boundingBox()
      expect(value!.y).toBeGreaterThan(name!.y + name!.height - 1)

      const remove = page.getByTestId('lore-remove-field-filter').first()
      const box = await remove.boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(44)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      ).toBeLessThanOrEqual(0)
    })
  }

  test('bare Lore still reads no entries, field filters in the address or not', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    const reads: string[] = []
    page.on('request', (request) => {
      if (/\/entities\?/.test(request.url())) reads.push(request.url())
    })
    await page.goto(`/app/universes/${w.u}/lore?field=${encodeURIComponent(`${w.age.id}:gt:1`)}`)
    await expect(page.getByTestId('lore-no-category')).toBeVisible()
    await page.waitForTimeout(400)
    expect(reads).toEqual([])
  })
})

/** Someone else, invited with this role and accepted, in a browser of their own. */
async function member(browser: Browser, owner: Page, universeId: string, role: number) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const username = await signUp(page, 'filterviewer')
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
