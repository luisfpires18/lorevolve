import { expect, test, type Locator, type Page } from '@playwright/test'
import { acceptConfirm } from './support/confirm'

/**
 * Product refinement 027: a type is dragged to a new place among its own siblings on a wide screen - by its grip, in one
 * request, never into another parent - or carried there from the keyboard; a phone keeps Up and Down. What the API stores
 * and refuses is proved by its own tests (`NestedTypeTests.Reorder`); this is what only a browser shows.
 */
const PASSWORD = 'Test-password-123!'
const RUNES = [
  'Original Runes',
  'Corrupted Runes',
  'Primal Runes',
  'Purified Runes',
  'Material Runes',
  'Animal Runes',
  'Elemental Runes',
  'Nature Runes',
  'Technic Runes',
]

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('orderer')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

interface TypeRead {
  id: string
  name: string
  parentId: string | null
  displayOrder: number
  fields: unknown[]
}

/** Runes with nine children, Primal holding Ancient Primal Runes; returns the universe and the ids by name. */
async function runeWorld(page: Page) {
  const created = await page.request.post('/api/universes', {
    data: { name: unique('Order World '), description: null, accentColor: null },
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
    expect(response.ok()).toBe(true)
    return ((await response.json()) as { id: string }).id
  }
  const runes = await type('Runes', null)
  const ids = new Map<string, string>([['Runes', runes]])
  for (const name of RUNES) ids.set(name, await type(name, runes))
  ids.set('Ancient Primal Runes', await type('Ancient Primal Runes', ids.get('Primal Runes')!))
  return { u, ids }
}

async function stored(page: Page, u: string) {
  return (await (await page.request.get(`/api/universes/${u}/entity-types`)).json()) as TypeRead[]
}

/** The rows in the order shown, once the list is there. */
async function rows(page: Page) {
  await page.locator('.types__row').first().waitFor()
  return page
    .locator('.types__row')
    .evaluateAll((all) => all.map((row) => row.getAttribute('data-type-name')))
}
const row = (page: Page, name: string) => page.locator(`.types__row[data-type-name="${name}"]`)
const runesOrder = async (page: Page) => {
  const all = await rows(page)
  // Runes is the last root here, so everything after it is its branch.
  return all.slice(all.indexOf('Runes') + 1)
}

/** Every request that changes order, counted from now. */
function orderWrites(page: Page) {
  const writes: string[] = []
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      /\/entity-types\/[^/]+\/(move|reorder)$/.test(request.url())
    ) {
      writes.push(request.url().split('/').pop()!)
    }
  })
  return writes
}

/** A mouse drag by a type's grip, released over the top or the bottom edge of another row. */
async function drag(page: Page, name: string, onto: Locator, edge: 'top' | 'bottom' = 'top') {
  const handle = page.getByTestId(`reorder-${name}`)
  // A grip is disabled while the last reorder is still on its way: one at a time.
  await expect(handle).not.toHaveAttribute('aria-disabled', 'true')
  await handle.scrollIntoViewIfNeeded()
  const from = (await handle.boundingBox())!
  const x = from.x + from.width / 2
  await page.mouse.move(x, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, from.y + from.height / 2 + 8, { steps: 2 })
  const to = (await onto.boundingBox())!
  await page.mouse.move(x, edge === 'top' ? to.y + 4 : to.y + to.height - 4, { steps: 12 })
  await page.mouse.up()
}

test.describe('reordering types on a wide screen', () => {
  test.use({ viewport: { width: 1440, height: 1800 } })

  test('a grip on every row, Up and Down only in the menu, and every other row action as it was', async ({
    page,
  }) => {
    await signUp(page)
    const { u } = await runeWorld(page)
    await page.goto(`/app/universes/${u}/types`)

    const grip = page.getByTestId('reorder-Technic Runes')
    await expect(grip).toBeVisible()
    await expect(grip).toHaveAccessibleName('Reorder Technic Runes')
    await expect(page.getByTestId('move-up-Technic Runes')).toBeHidden()
    await expect(page.getByTestId('move-down-Original Runes')).toBeHidden()
    // Alone among its siblings, a grip has nowhere to go and says so.
    await expect(page.getByTestId('reorder-Ancient Primal Runes')).toHaveAttribute(
      'aria-disabled',
      'true',
    )

    // The row's other tools are where they were.
    await expect(page.getByTestId('add-child-Runes')).toBeVisible()
    await expect(page.getByTestId('edit-type-Runes')).toBeVisible()
    await expect(page.getByTestId('fields-Runes')).toBeVisible()

    // The menu holds the plain alternative: Move up and Move down, only where there is somewhere to go.
    await page.getByTestId('type-actions-Primal Runes').click()
    await expect(page.getByTestId('move-up-item-Primal Runes')).toBeVisible()
    await expect(page.getByTestId('move-down-item-Primal Runes')).toBeVisible()
    await expect(page.getByTestId('add-child-item-Primal Runes')).toBeHidden()
    await page.getByTestId('move-up-item-Primal Runes').click()
    await expect(page.getByTestId('types-notice')).toHaveText('Moved “Primal Runes” up.')
    expect((await runesOrder(page)).slice(0, 3)).toEqual([
      'Original Runes',
      'Primal Runes',
      'Ancient Primal Runes',
    ])
    await page.getByTestId('type-actions-Original Runes').click()
    await expect(page.getByTestId('move-up-item-Original Runes')).toHaveCount(0)
    await page.getByTestId('move-down-item-Original Runes').click()
    expect((await runesOrder(page)).slice(0, 4)).toEqual([
      'Primal Runes',
      'Ancient Primal Runes',
      'Original Runes',
      'Corrupted Runes',
    ])
  })

  test('one drag is one request, up or down, kept after a reload and followed by Lore', async ({
    page,
  }) => {
    await signUp(page)
    const { u, ids } = await runeWorld(page)
    await page.goto(`/app/universes/${u}/types`)
    const writes = orderWrites(page)

    // Technic, last of nine, to the top of the group: one reorder, no steps.
    await drag(page, 'Technic Runes', row(page, 'Original Runes'))
    await expect
      .poll(() => runesOrder(page))
      .toEqual([
        'Technic Runes',
        'Original Runes',
        'Corrupted Runes',
        'Primal Runes',
        'Ancient Primal Runes',
        'Purified Runes',
        'Material Runes',
        'Animal Runes',
        'Elemental Runes',
        'Nature Runes',
      ])
    await expect(page.getByTestId('types-notice')).toHaveText(
      'Moved “Technic Runes” to place 1 of 9.',
    )
    expect(writes).toEqual(['reorder'])

    // Down: Original below Material.
    await drag(page, 'Original Runes', row(page, 'Material Runes'), 'bottom')
    await expect
      .poll(async () => (await runesOrder(page)).slice(0, 7))
      .toEqual([
        'Technic Runes',
        'Corrupted Runes',
        'Primal Runes',
        'Ancient Primal Runes',
        'Purified Runes',
        'Material Runes',
        'Original Runes',
      ])
    expect(writes).toEqual(['reorder', 'reorder'])

    // Kept, and stored as order only: every child still under Runes, numbered 1..n.
    await page.reload()
    expect((await runesOrder(page))[0]).toBe('Technic Runes')
    const types = await stored(page, u)
    const children = types.filter((each) => each.parentId === ids.get('Runes'))
    expect(children.map((each) => each.displayOrder)).toEqual(children.map((_, index) => index + 1))
    expect(types.find((each) => each.name === 'Ancient Primal Runes')!.parentId).toBe(
      ids.get('Primal Runes'),
    )

    // Lore lists what is inside Runes in the same order, beneath the categories (refinement 028).
    await page.goto(`/app/universes/${u}/lore?type=${ids.get('Runes')}`)
    const inside = page.locator(
      '[data-testid="lore-subtypes"][data-parent-name="Runes"] [data-testid="lore-type"]',
    )
    await inside.first().waitFor()
    const lore = await inside.evaluateAll((all) =>
      all.map((link) => link.getAttribute('data-type-name')),
    )
    expect(lore.slice(0, 2)).toEqual(['Technic Runes', 'Corrupted Runes'])
  })

  test('a branch moves whole, a drop lands only between siblings, and nothing changes parent', async ({
    page,
  }) => {
    await signUp(page)
    const { u, ids } = await runeWorld(page)
    await page.goto(`/app/universes/${u}/types`)

    // Primal carries Ancient Primal Runes with it, as one branch.
    await drag(page, 'Primal Runes', row(page, 'Original Runes'))
    await expect
      .poll(async () => (await runesOrder(page)).slice(0, 3))
      .toEqual(['Primal Runes', 'Ancient Primal Runes', 'Original Runes'])

    // Released over Primal's child, Material lands before Primal's whole branch - never inside it.
    await drag(page, 'Material Runes', row(page, 'Ancient Primal Runes'))
    await expect
      .poll(async () => (await runesOrder(page)).slice(0, 3))
      .toEqual(['Material Runes', 'Primal Runes', 'Ancient Primal Runes'])

    // Released far outside its group, over a root type, it goes to the nearest place among its siblings - still in Runes.
    await drag(page, 'Nature Runes', row(page, 'Character'))
    await expect.poll(async () => (await runesOrder(page))[0]).toBe('Nature Runes')

    const types = await stored(page, u)
    for (const name of RUNES) {
      expect(types.find((each) => each.name === name)!.parentId, name).toBe(ids.get('Runes'))
    }
    expect(types.find((each) => each.name === 'Ancient Primal Runes')!.parentId).toBe(
      ids.get('Primal Runes'),
    )
    expect(types.find((each) => each.name === 'Runes')!.parentId).toBeNull()

    // A root parent moves among the roots with its whole subtree.
    await drag(page, 'Runes', row(page, 'Character'))
    await expect.poll(async () => (await rows(page)).slice(0, 2)).toEqual(['Runes', 'Nature Runes'])
  })

  test('from the keyboard: lift, move among siblings, drop - or put back with Escape', async ({
    page,
  }) => {
    await signUp(page)
    const { u } = await runeWorld(page)
    await page.goto(`/app/universes/${u}/types`)
    const writes = orderWrites(page)
    const notice = page.getByTestId('types-notice')
    const grip = page.getByTestId('reorder-Technic Runes')

    // Escape puts it back: nothing sent, nothing moved.
    await grip.focus()
    await page.keyboard.press('Space')
    await expect(grip).toHaveAttribute('aria-pressed', 'true')
    await expect(notice).toContainText('Lifted “Technic Runes”, at place 9 of 9')
    await page.keyboard.press('ArrowUp')
    await expect(notice).toHaveText('“Technic Runes”: place 8 of 9 among its siblings.')
    await expect(row(page, 'Nature Runes')).toHaveAttribute('data-drop', 'before')
    await page.keyboard.press('Escape')
    await expect(notice).toHaveText(
      'Put back. “Technic Runes” stays at place 9 of 9 among its siblings.',
    )
    await expect(grip).toHaveAttribute('aria-pressed', 'false')
    expect(writes).toEqual([])
    expect((await runesOrder(page)).at(-1)).toBe('Technic Runes')

    // Lifted, moved three places up, and dropped: one request, and the focus stays on the grip.
    await page.keyboard.press('Enter')
    for (let press = 0; press < 3; press++) await page.keyboard.press('ArrowUp')
    await expect(notice).toHaveText('“Technic Runes”: place 6 of 9 among its siblings.')
    await page.keyboard.press('Enter')
    await expect(notice).toHaveText('Moved “Technic Runes” to place 6 of 9.')
    expect(writes).toEqual(['reorder'])
    expect((await runesOrder(page)).slice(5, 8)).toEqual([
      'Material Runes',
      'Technic Runes',
      'Animal Runes',
    ])
    await expect(grip).toBeFocused()
  })

  test('a refused reorder puts the order back and says so', async ({ page }) => {
    await signUp(page)
    const { u } = await runeWorld(page)
    await page.goto(`/app/universes/${u}/types`)
    const before = await rows(page)

    await page.route('**/reorder', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/problem+json',
        body: JSON.stringify({ title: 'That type could not be moved.' }),
      }),
    )
    await drag(page, 'Technic Runes', row(page, 'Original Runes'))
    await expect(page.getByTestId('types-error')).toBeVisible()
    await expect.poll(() => rows(page)).toEqual(before)
    await page.unroute('**/reorder')
  })

  test('Add child, Edit and reparent, Fields and Delete still work beside the grip', async ({
    page,
  }) => {
    await signUp(page)
    const { u, ids } = await runeWorld(page)
    await page.goto(`/app/universes/${u}/types`)
    const dialog = page.getByTestId('new-type-dialog')

    await page.getByTestId('add-child-Runes').click()
    await dialog.getByTestId('type-name').fill('Shadow Runes')
    await dialog.getByTestId('save-type').click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(async () => (await runesOrder(page)).at(-1)).toBe('Shadow Runes')

    await page.getByTestId('edit-type-Shadow Runes').click()
    const edit = page.getByTestId('edit-type-dialog')
    await edit.getByTestId('type-parent').selectOption(ids.get('Primal Runes')!)
    await edit.getByTestId('save-type').click()
    await expect(edit).toHaveCount(0)
    await expect(row(page, 'Shadow Runes')).toHaveAttribute('data-depth', '2')

    await page.getByTestId('fields-Shadow Runes').click()
    await expect(page.getByTestId('fields-Shadow Runes')).toHaveAttribute('aria-expanded', 'true')

    await page.getByTestId('type-actions-Nature Runes').click()
    await page.getByTestId('delete-type-Nature Runes').click()
    await acceptConfirm(page)
    await expect(row(page, 'Nature Runes')).toHaveCount(0)
  })
})

test.describe('reordering types on a phone keeps Up and Down', () => {
  for (const width of [640, 390, 360]) {
    test(`${width}px: no grip, Up and Down on the row, and they persist`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await signUp(page)
      const { u } = await runeWorld(page)
      await page.goto(`/app/universes/${u}/types`)
      const writes = orderWrites(page)

      await expect(page.getByTestId('reorder-Technic Runes')).toBeHidden()
      const up = page.getByTestId('move-up-Technic Runes')
      await up.scrollIntoViewIfNeeded()
      await expect(up).toBeVisible()
      await expect(page.getByTestId('move-down-Original Runes')).toBeVisible()
      await up.click()
      await expect(page.getByTestId('types-notice')).toHaveText('Moved “Technic Runes” up.')
      expect(writes).toEqual(['move'])
      await page.reload()
      expect((await runesOrder(page)).slice(-2)).toEqual(['Technic Runes', 'Nature Runes'])

      // Add child from the row's menu, as on any phone since 025; the menu has no Move items here.
      await page.getByTestId('type-actions-Runes').click()
      await expect(page.getByTestId('move-down-item-Runes')).toBeHidden()
      await page.getByTestId('add-child-item-Runes').click()
      await page.getByTestId('new-type-dialog').getByTestId('type-name').fill('Deep Runes')
      await page.getByTestId('new-type-dialog').getByTestId('save-type').click()
      await expect(row(page, 'Deep Runes')).toHaveAttribute('data-depth', '1')

      // The page scrolls as a page does, and nothing runs off the side.
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.mouse.wheel(0, 600)
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
      const sideways = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(sideways).toBeLessThanOrEqual(0)
      const fit = await page
        .locator('.types__row')
        .evaluateAll(
          (all, limit) =>
            all.every((each) =>
              [...each.querySelectorAll('button')].every(
                (button) => button.getBoundingClientRect().right <= limit,
              ),
            ),
          width,
        )
      expect(fit).toBe(true)
    })
  }

  test('641px is a wide screen: the grip, and no Up or Down on the row', async ({ page }) => {
    await page.setViewportSize({ width: 641, height: 900 })
    await signUp(page)
    const { u } = await runeWorld(page)
    await page.goto(`/app/universes/${u}/types`)
    await expect(page.getByTestId('reorder-Technic Runes')).toBeVisible()
    await expect(page.getByTestId('move-up-Technic Runes')).toBeHidden()
  })
})
