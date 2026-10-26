import { expect, test, type Page } from '@playwright/test'

/**
 * Product refinement 025. Lore's type navigation is the wrapped row it had before 022 - a menu on a phone - with every type
 * in the hierarchy's order and no "All": bare Lore chooses nothing and reads no entries. And a type grows a branch from its
 * own row: Add child opens the one type drawer with that type already its parent, and comes back to the same button so the
 * next sibling is one press away.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('brancher')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function post<T = { id: string }>(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data })
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()) as T
}

interface TypeRead {
  id: string
  name: string
  parentId: string | null
  familyTreeEligible: boolean
  fields: unknown[]
}

async function typesOf(page: Page, u: string) {
  return (await (await page.request.get(`/api/universes/${u}/entity-types`)).json()) as TypeRead[]
}

/** A universe with Runes ▸ Material Runes, an entry on each, and an entry on Location. */
async function world(page: Page) {
  const u = (
    await post(page, '/api/universes', {
      name: unique('Branch World '),
      description: null,
      accentColor: null,
    })
  ).id
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
  const entry = (typeId: string, name: string) =>
    post(page, `/api/universes/${u}/entities`, {
      entityTypeId: typeId,
      name,
      summary: null,
      canonStatus: 0,
      aliases: [],
      tags: [],
      fields: [],
    })
  const runes = await type('Runes', null)
  const material = await type('Material Runes', runes)
  const location = (await typesOf(page, u)).find((each) => each.name === 'Location')!.id
  await entry(runes, 'Rune of beginnings')
  await entry(material, 'Iron rune')
  await entry(location, 'Rune hill')
  return { u, runes, material, type }
}

const lore = (u: string, query = '') => `/app/universes/${u}/lore${query}`
const row = (page: Page) => page.getByRole('navigation', { name: 'Lore types' })
const typeCard = (page: Page, name: string) =>
  page.locator(`[data-testid="lore-type-card"][data-type-name="${name}"]`)
const typeLink = (page: Page, name: string) => row(page).getByRole('link', { name, exact: true })
const cards = (page: Page) => page.getByTestId('entity-card')
const heading = (page: Page) => page.getByRole('heading', { level: 1 })
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

test.describe('Lore: the type row again, without All', () => {
  test('bare Lore reads its types and no entries, and shows the catalog as the way to choose', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    const reads = entryReads(page)
    const typeReads: string[] = []
    page.on('request', (request) => {
      if (request.url().endsWith('/entity-types')) typeReads.push(request.url())
    })

    await page.goto(lore(w.u))
    await expect(typeCard(page, 'Runes')).toBeVisible()
    expect(typeReads.length).toBeGreaterThan(0)
    await expect(heading(page)).toHaveText('Lore')

    // The catalog (Issue #60): a card per type, no All, no row yet - and no entry card, list control or read.
    await expect(typeCard(page, 'Material Runes')).toContainText('In Runes')
    await expect(page.getByRole('link', { name: 'All', exact: true })).toHaveCount(0)
    await expect(row(page)).toHaveCount(0)
    await expect(cards(page)).toHaveCount(0)
    await expect(page.locator('.lore__skeleton')).toHaveCount(0)
    await expect(page.getByTestId('lore-filters-toggle')).toHaveCount(0)
    await expect(page.getByTestId('lore-filters')).toBeHidden()
    await expect(page.getByTestId('lore-select')).toHaveCount(0)
    await expect(page.getByTestId('lore-choose')).toHaveCount(0)
    await expect(page.getByText('Choose a type to browse your lore.')).toHaveCount(0)
    await expect(page.locator('.lore__pager, [data-testid="lore-pager"]')).toHaveCount(0)
    await page.waitForTimeout(400)
    expect(reads).toEqual([])

    // Choosing a parent reads its branch: its own entries and every type nested in it, never a sibling's.
    await typeCard(page, 'Runes').click()
    await expect(typeLink(page, 'Runes')).toHaveAttribute('aria-current', 'page')
    await expect(cards(page)).toHaveCount(2)
    await expect(cards(page).filter({ hasText: 'Rune hill' })).toHaveCount(0)
    await expect(page.getByLabel('Filter entries')).toBeVisible()
    await expect(page.getByTestId('lore-select')).toBeVisible()
    expect(reads.length).toBeGreaterThan(0)

    // A child says where it hangs; the Lore crumb is Lore again, with no type and no read.
    await typeLink(page, 'Material Runes').click()
    await expect(page.getByTestId('lore-path')).toHaveText('Lore›Runes')
    await expect(cards(page)).toHaveCount(1)
    const before = reads.length
    await page.getByTestId('lore-path-root').click()
    await expect(page).toHaveURL(/\/lore$/)
    await expect(cards(page)).toHaveCount(0)
    await page.waitForTimeout(400)
    expect(reads.length).toBe(before)

    // A type this universe does not have leaves nothing chosen, and reads nothing.
    await page.goto(lore(w.u, '?type=00000000-0000-0000-0000-000000000000'))
    await expect(page).toHaveURL(/\/lore$/)
    await expect(row(page).locator('[aria-current="page"]')).toHaveCount(0)
    await page.waitForTimeout(400)
    expect(reads.length).toBe(before)
  })

  test('many types wrap on a desktop, at 200% too, and nothing scrolls sideways', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    for (const name of [
      'Starship',
      'Language',
      'Ritual Circle',
      'Very Long Type Name of the Northern Marches',
      'עידן האור',
      'Guild',
      'Relic',
      'Prophecy',
    ]) {
      await w.type(name, null)
    }

    for (const [width, height] of [
      [1440, 900],
      [1024, 768],
      [820, 1180],
      [720, 450],
    ] as const) {
      await page.setViewportSize({ width, height })
      // The catalog fits too; the row is a type's navigation, so it is measured on a type's list.
      await page.goto(lore(w.u))
      await expect(typeCard(page, 'Prophecy')).toBeVisible()
      expect(await sideways(page), `${width} catalog`).toBeLessThanOrEqual(0)
      await page.goto(lore(w.u, `?type=${w.runes}`))
      const links = row(page).getByRole('link')
      await expect(links.first()).toBeVisible()
      const shape = await page.getByTestId('lore-types').evaluate((element) => {
        const boxes = [...element.querySelectorAll('a')].map((link) => link.getBoundingClientRect())
        const bounds = element.getBoundingClientRect()
        return {
          rows: new Set(boxes.map((box) => Math.round(box.top))).size,
          fits: element.scrollWidth <= element.clientWidth,
          inside: boxes.every(
            (box) => box.left >= bounds.left - 1 && box.right <= bounds.right + 1,
          ),
        }
      })
      expect(shape.rows, `${width}`).toBeGreaterThan(1)
      expect(shape.fits, `${width}`).toBe(true)
      expect(shape.inside, `${width}`).toBe(true)
      expect(await sideways(page), `${width}`).toBeLessThanOrEqual(0)
    }
  })

  for (const width of [390, 360]) {
    test(`a phone at ${width}px: a Category menu of real top-level types, then a menu inside the chosen one`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 })
      await signUp(page)
      const w = await world(page)
      await page.goto(lore(w.u))

      // The catalog first (Issue #60): no menu until a category is open.
      await expect(typeCard(page, 'Runes')).toBeVisible()
      await expect(page.getByTestId('lore-type-menu')).toHaveCount(0)
      await expect(cards(page)).toHaveCount(0)
      expect(await sideways(page)).toBeLessThanOrEqual(0)
      await typeCard(page, 'Location').click()

      const trigger = page.getByTestId('lore-type-menu')
      await expect(row(page)).toBeHidden()
      await expect(trigger).toHaveAccessibleName('Category: Location')
      await expect(page.getByTestId('lore-subtype-menu')).toHaveCount(0)
      await trigger.click()
      const menu = page.getByTestId('lore-type-menu-panel')
      const items = await menu
        .getByRole('link')
        .evaluateAll((links) => links.map((link) => link.textContent?.trim()))
      expect(items).not.toContain('All')
      // Top-level types only: what is inside Runes waits for Runes.
      expect(items).toContain('Runes')
      expect(items).not.toContain('Material Runes')
      const box = (await menu.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(width)

      await menu.getByRole('link', { name: 'Runes', exact: true }).click()
      await expect(trigger).toHaveAccessibleName('Category: Runes')
      const inside = page.getByTestId('lore-subtype-menu')
      await expect(inside).toHaveAccessibleName('In Runes: All Runes')
      await expect(cards(page)).toHaveCount(2)
      await inside.click()
      await page
        .getByTestId('lore-subtype-menu-panel')
        .getByRole('link', { name: 'Material Runes', exact: true })
        .click()
      await expect(inside).toHaveAccessibleName('In Runes: Material Runes')
      await expect(trigger).toHaveAccessibleName('Category: Runes')
      await expect(cards(page)).toHaveCount(1)
      expect(await sideways(page)).toBeLessThanOrEqual(0)
    })
  }
})

test.describe('Types: Add child from a type’s own row', () => {
  test('every type offers it; it starts inside that type, builds a branch, and comes back for the next', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await page.goto(`/app/universes/${w.u}/types`)

    // Every row, named for its parent.
    const rows = page.locator('.types__row')
    await expect(rows.first()).toBeVisible()
    const rowCount = await rows.count()
    await expect(page.locator('.types__addchild:visible')).toHaveCount(rowCount)
    const add = page.getByTestId('add-child-Runes')
    await expect(add).toHaveAccessibleName('Add child type inside Runes')

    // Runes, Add child: the one drawer, saying so, Runes already chosen.
    await add.click()
    const dialog = page.getByTestId('new-type-dialog')
    await expect(dialog.getByRole('heading', { name: 'New child type' })).toBeVisible()
    await expect(dialog.getByTestId('type-dialog-context')).toHaveText('Inside Runes')
    await expect(dialog.getByTestId('type-parent')).toHaveValue(w.runes)
    // Family Tree is chosen here, on creating, and nothing is taken from the parent.
    await expect(dialog.getByTestId('type-family')).not.toBeChecked()
    await dialog.getByTestId('type-name').fill('Animal Runes')
    await dialog.getByTestId('save-type').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('types-notice')).toHaveText(
      'Created “Animal Runes” inside “Runes”.',
    )

    // Straight back on the same button: the next sibling is one press away.
    await expect(add).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(dialog.getByTestId('type-parent')).toHaveValue(w.runes)
    await dialog.getByTestId('type-name').fill('Elemental Runes')
    await page.keyboard.press('Enter')
    await expect(dialog).toHaveCount(0)
    await expect(add).toBeFocused()

    // Nested under Runes, each new one last among its siblings.
    const order = () =>
      rows.evaluateAll((all) =>
        all.map(
          (each) => `${each.getAttribute('data-depth')}:${each.getAttribute('data-type-name')}`,
        ),
      )
    const after = await order()
    expect(after.slice(after.indexOf('0:Runes'), after.indexOf('0:Runes') + 4)).toEqual([
      '0:Runes',
      '1:Material Runes',
      '1:Animal Runes',
      '1:Elemental Runes',
    ])

    // Deeper, from a child's own row: no limit.
    await page.getByTestId('add-child-Material Runes').click()
    await expect(dialog.getByTestId('type-dialog-context')).toHaveText('Inside Material Runes')
    await dialog.getByTestId('type-name').fill('Ancient Material Runes')
    await dialog.getByTestId('save-type').click()
    await expect(dialog).toHaveCount(0)
    await page.getByTestId('add-child-Ancient Material Runes').click()
    await dialog.getByTestId('type-name').fill('Primal Ancient Runes')
    await dialog.getByTestId('save-type').click()
    await expect(dialog).toHaveCount(0)
    await expect(
      page.locator('.types__row[data-type-name="Primal Ancient Runes"]'),
    ).toHaveAttribute('data-depth', '3')
    const stored = await typesOf(page, w.u)
    const byName = new Map(stored.map((each) => [each.name, each]))
    expect(byName.get('Animal Runes')!.parentId).toBe(w.runes)
    expect(byName.get('Ancient Material Runes')!.parentId).toBe(w.material)
    expect(byName.get('Primal Ancient Runes')!.parentId).toBe(
      byName.get('Ancient Material Runes')!.id,
    )
  })

  test('the parent stays a choice; Cancel changes nothing; New type still starts at the top', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await page.goto(`/app/universes/${w.u}/types`)
    const before = (await typesOf(page, w.u)).length
    const dialog = page.getByTestId('new-type-dialog')

    // Changed to the top, the drawer says so; Cancel leaves everything as it was and hands the focus back.
    const add = page.getByTestId('add-child-Runes')
    await add.click()
    await dialog.getByTestId('type-parent').selectOption('')
    await expect(dialog.getByRole('heading', { name: 'New type', exact: true })).toBeVisible()
    await expect(dialog.getByTestId('type-dialog-context')).toHaveCount(0)
    await dialog.getByTestId('type-parent').selectOption(w.material)
    await expect(dialog.getByTestId('type-dialog-context')).toHaveText('Inside Material Runes')
    // Back where it started is nothing changed, so Cancel needs no question.
    await dialog.getByTestId('type-parent').selectOption(w.runes)
    await dialog.getByTestId('cancel-type').click()
    await expect(dialog).toHaveCount(0)
    await expect(add).toBeFocused()
    expect((await typesOf(page, w.u)).length).toBe(before)

    // Opened and closed untouched: no question, nothing made.
    await add.click()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(add).toBeFocused()
    expect((await typesOf(page, w.u)).length).toBe(before)

    // The page's own New type is a top-level type, as ever.
    await page.getByTestId('new-type').click()
    await expect(dialog.getByRole('heading', { name: 'New type', exact: true })).toBeVisible()
    await expect(dialog.getByTestId('type-parent')).toHaveValue('')
    await dialog.getByTestId('type-name').fill('Starship')
    await dialog.getByTestId('save-type').click()
    await expect(page.getByTestId('types-notice')).toHaveText('Created the type “Starship”.')
    expect((await typesOf(page, w.u)).find((each) => each.name === 'Starship')!.parentId).toBe(null)
  })

  test('a child inherits nothing: not the fields, not Family Tree, which stays a creation-only choice', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    // A parent with a field of its own.
    await post(page, `/api/universes/${w.u}/entity-types/${w.runes}/fields`, {
      name: 'Glyph',
      kind: 0,
      isRequired: false,
      displayOrder: null,
      defaultValue: null,
      options: null,
      semantic: null,
    })
    await page.goto(`/app/universes/${w.u}/types`)

    await page.getByTestId('add-child-Runes').click()
    const dialog = page.getByTestId('new-type-dialog')
    await dialog.getByTestId('type-name').fill('Bone Runes')
    await dialog.getByTestId('save-type').click()
    await expect(dialog).toHaveCount(0)

    const bone = (await typesOf(page, w.u)).find((each) => each.name === 'Bone Runes')!
    expect(bone.parentId).toBe(w.runes)
    expect(bone.fields).toEqual([])
    expect(bone.familyTreeEligible).toBe(false)

    // Editing still moves a type and still has no Family Tree choice.
    await page.getByTestId('edit-type-Bone Runes').click()
    const edit = page.getByTestId('edit-type-dialog')
    await expect(edit.getByTestId('type-family')).toHaveCount(0)
    await edit.getByTestId('type-parent').selectOption('')
    await edit.getByTestId('save-type').click()
    await expect(edit).toHaveCount(0)
    expect((await typesOf(page, w.u)).find((each) => each.name === 'Bone Runes')!.parentId).toBe(
      null,
    )
  })

  test('at 360px Add child waits in the row’s menu, and long nested names still fit', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 780 })
    await signUp(page)
    const w = await world(page)
    await w.type('Province of the Very Long Northern Marches Beyond the Grey Water', w.material)
    await page.goto(`/app/universes/${w.u}/types`)

    await expect(page.getByTestId('add-child-Runes')).toBeHidden()
    await page.getByTestId('type-actions-Runes').click()
    const item = page.getByTestId('add-child-item-Runes')
    await expect(item).toBeVisible()
    await expect(item).toHaveAccessibleName('Add child type inside Runes')
    // The menu opens on it: the only hidden twin is not where the keyboard lands.
    await expect(item).toBeFocused()
    await item.click()
    const dialog = page.getByTestId('new-type-dialog')
    await expect(dialog.getByTestId('type-parent')).toHaveValue(w.runes)
    await dialog.getByTestId('type-name').fill('Sky Runes')
    await dialog.getByTestId('save-type').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('.types__row[data-type-name="Sky Runes"]')).toHaveAttribute(
      'data-depth',
      '1',
    )

    const fit = await page
      .locator('.types__row')
      .evaluateAll((rows) =>
        rows.every((row) =>
          [...row.querySelectorAll('button')].every(
            (button) => button.getBoundingClientRect().right <= 360,
          ),
        ),
      )
    expect(fit).toBe(true)
    expect(await sideways(page)).toBeLessThanOrEqual(0)
  })
})
