import { expect, test, type Page } from '@playwright/test'
import { acceptConfirm, answerConfirms, confirmDialog, dismissConfirm } from './support/confirm'

/**
 * Product refinement 020. The Lore Types list reads as types - a picture, a name, a count, Edit, Fields and a menu - with
 * a type's settings in its editor; an existing type is renamed and re-iconed in place; deleting says why it cannot happen
 * when an entry, in Lore or in the Trash, still uses the type; Lore's types wrap instead of scrolling sideways; and Lore
 * can select entries on the page on screen and move them to the Trash together.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('types')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

interface StoredType {
  id: string
  name: string
  icon: string | null
  description: string | null
  familyTreeEligible: boolean
  entityCount: number
}

async function world(page: Page) {
  const created = await page.request.post('/api/universes', {
    data: { name: unique('Types World '), description: null, accentColor: null },
  })
  return ((await created.json()) as { id: string }).id
}

async function types(page: Page, universeId: string) {
  const response = await page.request.get(`/api/universes/${universeId}/entity-types`)
  return (await response.json()) as StoredType[]
}

async function typeNamed(page: Page, universeId: string, name: string) {
  return (await types(page, universeId)).find((type) => type.name === name)!
}

async function newType(page: Page, universeId: string, name: string) {
  const response = await page.request.post(`/api/universes/${universeId}/entity-types`, {
    data: { name, description: null, icon: null, accentColor: null, displayOrder: null },
  })
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { id: string }).id
}

async function entry(page: Page, universeId: string, typeId: string, name: string) {
  const response = await page.request.post(`/api/universes/${universeId}/entities`, {
    data: {
      entityTypeId: typeId,
      name,
      summary: null,
      canonStatus: 1,
      aliases: [],
      tags: [],
      fields: [],
    },
  })
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { id: string }).id
}

async function trashCount(page: Page, universeId: string) {
  const response = await page.request.get(`/api/universes/${universeId}/trash?pageSize=100`)
  return ((await response.json()) as { totalCount: number }).totalCount
}

async function liveCount(page: Page, universeId: string) {
  const response = await page.request.get(`/api/universes/${universeId}/entities?pageSize=1`)
  return ((await response.json()) as { totalCount: number }).totalCount
}

function sideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

/** Answers every confirmation with `accept` and records what it said. */
async function answer(page: Page, accept: boolean | (() => boolean)) {
  const asked: string[] = []
  await answerConfirms(page, () => (typeof accept === 'function' ? accept() : accept), asked)
  return asked
}

const row = (page: Page, name: string) => page.locator(`.types__row[data-type-name="${name}"]`)

test.describe('Lore types', () => {
  test('a type row is its picture, name, count and actions; its settings wait in its editor', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await world(page)
    await page.goto(`/app/universes/${universeId}/types`)

    const character = row(page, 'Character')
    await expect(character.getByTestId('edit-type-Character')).toHaveAccessibleName(
      'Edit Character',
    )
    await expect(character.getByTestId('fields-Character')).toBeVisible()
    await expect(character.getByTestId('type-actions-Character')).toHaveAccessibleName(
      'More actions for Character',
    )
    await expect(character.getByTestId('type-count-Character')).toHaveText('0 entries')
    // No row carries the Family Tree switch any more.
    await expect(page.getByText('Entries of this type can appear in Family Tree')).toHaveCount(0)

    // A new type still says whether its entries take part in the Family Tree.
    await page.getByTestId('new-type').click()
    const dialog = page.getByTestId('new-type-dialog')
    await expect(dialog.getByRole('heading', { name: 'New type' })).toBeVisible()
    await expect(dialog.getByTestId('type-family')).not.toBeChecked()
    await expect(dialog.getByText('Entries of this type can appear in Family Tree')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('new-type')).toBeFocused()

    // Editing a type is its name and icon only: the Family Tree choice is not offered there.
    await page.getByTestId('edit-type-Character').click()
    const edit = page.getByTestId('edit-type-dialog')
    await expect(edit.getByLabel('Name', { exact: true })).toHaveValue('Character')
    await expect(edit.getByTestId('type-icon')).toBeVisible()
    await expect(edit.getByTestId('type-family')).toHaveCount(0)
    await expect(edit.getByText('Entries of this type can appear in Family Tree')).toHaveCount(0)
    await edit.getByTestId('cancel-type').click()
    await expect(edit).toHaveCount(0)
  })

  test('editing a type renames it and changes its icon in place, keeps what it does not edit, and refuses a taken name', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await world(page)
    const location = await typeNamed(page, universeId, 'Location')
    const rivendell = await entry(page, universeId, location.id, 'Rivendell')
    await page.goto(`/app/universes/${universeId}/types`)

    // Opens with what is stored, focus in the name, and returns focus to Edit on the way out.
    const edit = page.getByTestId('edit-type-Location')
    await edit.click()
    const dialog = page.getByTestId('edit-type-dialog')
    await expect(dialog.getByRole('heading', { name: 'Edit type' })).toBeVisible()
    const name = dialog.getByLabel('Name', { exact: true })
    await expect(name).toHaveValue('Location')
    await expect(name).toBeFocused()
    await expect(dialog.getByRole('radio', { name: 'Map pin', exact: true })).toBeChecked()

    // Cancel after a change asks, and leaving it stores nothing.
    await name.fill('Somewhere else')
    const asked = await answer(page, true)
    await dialog.getByTestId('cancel-type').click()
    await expect(dialog).toHaveCount(0)
    await expect.poll(() => asked).toHaveLength(1)
    await expect(edit).toBeFocused()
    expect((await typeNamed(page, universeId, 'Location')).icon).toBe('location')

    // A name another type has is refused on the field, and the form keeps what was typed.
    await edit.click()
    await name.fill('Character')
    await dialog.getByTestId('save-type').click()
    await expect(dialog.getByTestId('type-dialog-error')).toBeVisible()
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await expect(name).toHaveValue('Character')

    // Renamed and re-iconed, by id: the row, Lore's types and the entry all follow.
    await name.fill('Region')
    await dialog.getByRole('radio', { name: 'Globe', exact: true }).check()
    await dialog.getByTestId('save-type').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('types-notice')).toHaveText('Saved the type “Region”.')
    await expect(
      row(page, 'Region').getByTestId('type-icon-Region').locator('svg'),
    ).toHaveAttribute('data-icon', 'globe')
    const stored = await typeNamed(page, universeId, 'Region')
    expect(stored.id).toBe(location.id)
    expect(stored.description).toBe(location.description)
    expect(stored.familyTreeEligible).toBe(false)

    await page.reload()
    await expect(row(page, 'Region')).toBeVisible()
    await expect(row(page, 'Location')).toHaveCount(0)

    await page.goto(`/app/universes/${universeId}/lore?type=${location.id}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Region')
    await expect(
      page.getByTestId('lore-types').getByRole('link', { name: 'Region' }),
    ).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await page.getByTestId('entity-card').click()
    await page.waitForURL(new RegExp(`/lore/${rivendell}$`))

    // A rename of the one starter eligible for the Family Tree keeps it eligible.
    await page.goto(`/app/universes/${universeId}/types`)
    await page.getByTestId('edit-type-Character').click()
    await dialog.getByLabel('Name', { exact: true }).fill('Person')
    await dialog.getByTestId('save-type').click()
    await expect(row(page, 'Person')).toBeVisible()
    expect((await typeNamed(page, universeId, 'Person')).familyTreeEligible).toBe(true)
  })

  test('Location emptied by moving its entry to Kingdom deletes, asks first, and stays deleted', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await world(page)
    const location = await typeNamed(page, universeId, 'Location')
    const kingdom = await newType(page, universeId, 'Kingdom')
    const gondor = await entry(page, universeId, location.id, 'Gondor')

    // The move, as an author makes it.
    await page.goto(`/app/universes/${universeId}/lore/${gondor}`)
    await page.getByTestId('edit-entity').click()
    await page.getByLabel('Entry type').selectOption(kingdom)
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-form-status')).toHaveCount(0)

    await page.goto(`/app/universes/${universeId}/types`)
    await expect(row(page, 'Location').getByTestId('type-count-Location')).toHaveText('0 entries')

    // Declined, nothing happens; accepted, it goes, and a reload does not bring it back.
    const decisions = [false, true]
    const asked = await answer(page, () => decisions.shift() ?? false)
    await page.getByTestId('type-actions-Location').click()
    await page.getByTestId('delete-type-Location').click()
    await expect.poll(() => asked[0]).toContain('Delete the type “Location”?')
    await expect(row(page, 'Location')).toBeVisible()

    await page.getByTestId('type-actions-Location').click()
    await page.getByTestId('delete-type-Location').click()
    await expect(row(page, 'Location')).toHaveCount(0)
    await expect(page.getByTestId('types-notice')).toHaveText('Deleted the type “Location”.')
    await page.reload()
    await expect(row(page, 'Kingdom')).toBeVisible()
    await expect(row(page, 'Location')).toHaveCount(0)
    expect((await types(page, universeId)).some((type) => type.name === 'Location')).toBe(false)
  })

  test('a world whose every type was deleted stays without types, and a new entry says so', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await world(page)
    for (const type of await types(page, universeId)) {
      expect(
        (await page.request.delete(`/api/universes/${universeId}/entity-types/${type.id}`)).ok(),
      ).toBe(true)
    }

    // Reading the list, and reading it again, writes nothing back.
    await page.goto(`/app/universes/${universeId}/types`)
    await expect(page.getByTestId('type-list').locator('.types__row')).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('type-list').locator('.types__row')).toHaveCount(0)
    expect(await types(page, universeId)).toEqual([])

    await page.goto(`/app/universes/${universeId}/lore/new`)
    const empty = page.getByTestId('entity-no-types')
    await expect(empty).toContainText('This world has no types yet.')
    await empty.getByRole('link', { name: 'Go to Types' }).click()
    await page.waitForURL(/\/types$/)
    expect(await types(page, universeId)).toEqual([])
  })

  test('a type still used, in Lore or only in the Trash, says why it cannot be deleted and where to go', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await world(page)
    const location = await typeNamed(page, universeId, 'Location')
    const moria = await entry(page, universeId, location.id, 'Moria')
    await entry(page, universeId, location.id, 'Rohan')
    expect((await page.request.delete(`/api/universes/${universeId}/entities/${moria}`)).ok()).toBe(
      true,
    )
    await page.goto(`/app/universes/${universeId}/types`)
    let accept = false
    const asked = await answer(page, () => accept)

    await expect(row(page, 'Location').getByTestId('type-count-Location')).toHaveText(
      '2 entries, 1 in the Trash',
    )
    await page.getByTestId('type-actions-Location').click()
    await page.getByTestId('delete-type-Location').click()
    const blocked = page.getByTestId('type-blocked-Location')
    await expect(blocked).toHaveRole('alert')
    await expect(blocked).toContainText(
      "Location can't be deleted because 2 entries still use it, 1 of them in the Trash.",
    )
    await expect(blocked.getByRole('link', { name: 'Show its entries in Lore' })).toHaveAttribute(
      'href',
      new RegExp(`/lore\\?type=${location.id}$`),
    )
    await expect(blocked.getByRole('link', { name: 'Open the Trash' })).toBeVisible()
    // No confirmation it could only fail, and nothing sent.
    await expect.poll(() => asked).toEqual([])
    await expect(row(page, 'Location')).toBeVisible()

    // Out of Lore is not unused: every entry in the Trash still blocks it.
    await page.goto(`/app/universes/${universeId}/lore?type=${location.id}`)
    await page.getByTestId('lore-select').click()
    await page.getByTestId('lore-select-page').click()
    accept = true
    await page.getByTestId('lore-trash-selected').click()
    await expect(page.getByTestId('lore-trashed')).toContainText('1 entry moved to the Trash.')
    await page.goto(`/app/universes/${universeId}/types`)
    await page.getByTestId('type-actions-Location').click()
    await page.getByTestId('delete-type-Location').click()
    await expect(page.getByTestId('type-blocked-Location')).toContainText(
      "Location can't be deleted because 2 entries still use it, all of them in the Trash.",
    )
    await expect(
      page
        .getByTestId('type-blocked-Location')
        .getByRole('link', { name: 'Show its entries in Lore' }),
    ).toHaveCount(0)
  })

  test('many types wrap instead of scrolling sideways, a phone keeps its Type menu, in both themes and at 200%', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await signUp(page)
    const universeId = await world(page)
    const names = [
      'Kingdom',
      'Starship',
      'Dynasty',
      'Artifact',
      'Ritual Circle',
      'Rumour of the Tide',
      'עידן האור',
      'The Ancient Order of the Long-Remembered Northern Watchtowers',
      'Language',
      'Religion',
      'Guild',
    ]
    for (const name of names) await newType(page, universeId, name)
    const all = 7 + names.length
    const kingdom = (await typeNamed(page, universeId, 'Kingdom')).id

    for (const [width, height, colorScheme] of [
      [1920, 1080, 'light'],
      [1440, 900, 'dark'],
      [1024, 768, 'light'],
      [820, 1000, 'dark'],
      [640, 450, 'light'],
      [390, 844, 'dark'],
      [360, 780, 'light'],
    ] as const) {
      const at = `${width}px ${colorScheme}`
      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width, height })
      await page.goto(`/app/universes/${universeId}/lore`)
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme)

      // No type chosen: no entry card and nothing scrolls - the catalog of types to choose from (Issue #60).
      await expect(page.getByTestId('entity-card')).toHaveCount(0)
      await expect(page.getByTestId('lore-type-card')).toHaveCount(all)
      await expect(
        page.locator('[data-testid="lore-type-card"][data-type-name="עידן האור"] bdi').first(),
      ).toBeVisible()
      expect(await sideways(page), at).toBeLessThanOrEqual(1)

      // The type navigation, once a type is open.
      await page.goto(`/app/universes/${universeId}/lore?type=${kingdom}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Kingdom')
      expect(await sideways(page), at).toBeLessThanOrEqual(1)

      if (width > 640) {
        const typeRow = page.getByTestId('lore-types')
        const links = typeRow.getByRole('link')
        await expect(links).toHaveCount(all)
        const shape = await typeRow.evaluate((element) => {
          const bounds = element.getBoundingClientRect()
          const boxes = [...element.querySelectorAll('a')].map((link) =>
            link.getBoundingClientRect(),
          )
          return {
            overflowX: getComputedStyle(element).overflowX,
            fits: element.scrollWidth <= element.clientWidth,
            rows: new Set(boxes.map((box) => Math.round(box.top))).size,
            inside: boxes.every(
              (box) => box.left >= bounds.left - 1 && box.right <= bounds.right + 1,
            ),
          }
        })
        expect(shape.overflowX, at).toBe('visible')
        expect(shape.fits, at).toBe(true)
        expect(shape.inside, at).toBe(true)
        expect(shape.rows, at).toBeGreaterThanOrEqual(2)
        // The right-to-left name keeps its own direction inside Lorex's order.
        await expect(typeRow.locator('bdi', { hasText: 'עידן האור' })).toBeVisible()
      } else {
        await expect(page.getByTestId('lore-types')).toBeHidden()
        const trigger = page.getByTestId('lore-type-menu')
        await expect(trigger).toHaveAccessibleName('Category: Kingdom')
        await trigger.click()
        const menu = page.getByTestId('lore-type-menu-panel')
        await expect(menu.locator('a[data-type-name]')).toHaveCount(all)
        await menu.getByRole('link', { name: 'Guild' }).click()
        await expect(page).toHaveURL(/\?type=/)
        await expect(trigger).toContainText('Guild')
        expect(await sideways(page), at).toBeLessThanOrEqual(1)
      }
    }
  })
})

test.describe('moving Lore to the Trash together', () => {
  async function seeded(page: Page, count: number, names?: string[]) {
    await signUp(page)
    const universeId = await world(page)
    const character = (await typeNamed(page, universeId, 'Character')).id
    const all =
      names ??
      Array.from({ length: count }, (_, index) => `Wanderer ${String(index + 1).padStart(2, '0')}`)
    for (const name of all) await entry(page, universeId, character, name)
    return universeId
  }

  const cards = (page: Page) => page.getByTestId('entity-card')
  const checks = (page: Page) => page.getByTestId('entity-select')

  /** Lore on the type every seeded entry has: there is no "All" to browse them in. */
  async function lore(page: Page, universeId: string, query = '') {
    const character = (await typeNamed(page, universeId, 'Character')).id
    return `/app/universes/${universeId}/lore?type=${character}${query}`
  }

  test('ordinary Lore has no checkboxes; Select turns on selecting, one card or the page at a time', async ({
    page,
  }) => {
    const universeId = await seeded(page, 5)
    await page.goto(await lore(page, universeId))

    await expect(cards(page)).toHaveCount(5)
    await expect(checks(page)).toHaveCount(0)
    await expect(page.getByTestId('lore-selectbar')).toHaveCount(0)

    const select = page.getByTestId('lore-select')
    await expect(select).toHaveAttribute('aria-pressed', 'false')
    await select.click()
    await expect(select).toHaveAttribute('aria-pressed', 'true')
    await expect(checks(page)).toHaveCount(5)
    await expect(page.getByTestId('lore-selected-count')).toHaveText(
      'Select entries on this page to move them to the Trash.',
    )
    await expect(page.getByTestId('lore-trash-selected')).toBeDisabled()

    // A card is not a link while selecting: pressing it selects it, and again unselects it.
    await cards(page).first().click()
    await expect(page).toHaveURL(/\/lore\?type=[0-9a-f-]+$/)
    await expect(checks(page).first()).toBeChecked()
    await expect(page.getByTestId('lore-selected-count')).toHaveText('1 selected')
    await expect(checks(page).first()).toHaveAccessibleName(/^Select Wanderer 0\d$/)
    await cards(page).first().click()
    await expect(checks(page).first()).not.toBeChecked()

    await page.getByTestId('lore-select-page').click()
    await expect(page.getByTestId('lore-selected-count')).toHaveText('5 selected')
    await expect(page.getByTestId('lore-trash-selected')).toHaveText('Move 5 to Trash')
    await expect(page.getByTestId('lore-select-page')).toBeDisabled()
    await page.getByTestId('lore-clear-selection').click()
    await expect(page.getByTestId('lore-selected-count')).not.toContainText('selected')

    await page.getByTestId('lore-select-done').click()
    await expect(checks(page)).toHaveCount(0)
    await expect(cards(page).first()).toHaveAttribute('href', /\/lore\/[0-9a-f-]+$/)
  })

  test('Move N to Trash asks and explains; declined changes nothing; accepted moves them all in one request', async ({
    page,
  }) => {
    const universeId = await seeded(page, 13)
    await page.goto(await lore(page, universeId, '&page=2'))
    await expect(cards(page)).toHaveCount(1)

    const writes: string[] = []
    page.on('request', (request) => {
      if (request.method() !== 'GET' && request.url().includes('/entities')) {
        writes.push(new URL(request.url()).pathname)
      }
    })
    const decisions = [false, true]
    const asked = await answer(page, () => decisions.shift() ?? false)

    await page.getByTestId('lore-select').click()
    await page.getByTestId('lore-select-page').click()
    await page.getByTestId('lore-trash-selected').click()
    await expect.poll(() => asked[0]).toContain('Move 1 entry to the Trash?')
    await expect.poll(() => asked[0]).toContain('nothing is erased')
    await expect.poll(() => asked[0]).toContain('restored from the Trash')
    expect(writes).toEqual([])
    await expect(checks(page).first()).toBeChecked()

    // The last entry of page 2 goes, so the list lands on the page that is left.
    await page.getByTestId('lore-trash-selected').click()
    await expect(page.getByTestId('lore-trashed')).toContainText('1 entry moved to the Trash.')
    expect(writes).toEqual([`/api/universes/${universeId}/entities/bulk-trash`])
    await expect(page).not.toHaveURL(/page=2/)
    await expect(cards(page)).toHaveCount(12)
    await expect(page.getByTestId('lore-trashed')).toContainText('1 entry moved to the Trash.')
    await expect(page.getByTestId('lore-selectbar')).toHaveCount(0)

    // Twelve at once, named in no giant list.
    await page.getByTestId('lore-select').click()
    await page.getByTestId('lore-select-page').click()
    decisions.push(true)
    await page.getByTestId('lore-trash-selected').click()
    await expect.poll(() => asked[2]).toContain('Move 12 entries to the Trash?')
    await expect.poll(() => asked[2]).not.toContain('“')
    await expect(page.getByTestId('lore-trashed')).toContainText('12 entries moved to the Trash.')
    await expect(page.getByTestId('entity-empty')).toBeVisible()
    expect(await liveCount(page, universeId)).toBe(0)
    expect(await trashCount(page, universeId)).toBe(13)

    await page.getByTestId('lore-trashed').getByRole('link', { name: 'Open the Trash' }).click()
    await page.waitForURL(/\/trash$/)
    await expect(page.getByText('Wanderer 13')).toBeVisible()
  })

  test('a failure keeps the selection; another page or filter starts with none selected', async ({
    page,
  }) => {
    const universeId = await seeded(page, 14)
    await page.goto(await lore(page, universeId))

    await page.getByTestId('lore-select').click()
    await checks(page).nth(0).check()
    await checks(page).nth(1).check()

    await page.route('**/entities/bulk-trash', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/problem+json',
        body: JSON.stringify({ title: 'An error occurred while processing your request.' }),
      }),
    )
    await page.getByTestId('lore-trash-selected').click()
    // The confirmation stays open and says why (Issue #50); Cancel leaves everything as it was.
    await acceptConfirm(page)
    await expect(confirmDialog(page).getByTestId('confirm-dialog-error')).toContainText(
      'Nothing was moved.',
    )
    await dismissConfirm(page)
    await expect(checks(page).nth(0)).toBeChecked()
    await expect(checks(page).nth(1)).toBeChecked()
    await expect(cards(page)).toHaveCount(12)
    expect(await liveCount(page, universeId)).toBe(14)
    await page.unroute('**/entities/bulk-trash')

    // Nothing is carried to a list the author cannot see.
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page).toHaveURL(/page=2/)
    await expect(page.getByTestId('lore-selected-count')).not.toContainText('selected')
    await page.getByRole('button', { name: 'Previous' }).click()
    await expect(checks(page).nth(0)).not.toBeChecked()
    await checks(page).nth(0).check()
    await page.getByLabel('Filter entries').fill('Wanderer')
    await expect(page.getByTestId('lore-selected-count')).not.toContainText('selected')
  })

  test('from the keyboard, on a phone, in both themes and at 200%, with a right-to-left name', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    const universeId = await seeded(page, 0, ['فرودو باغنز', 'Samwise Gamgee', 'Peregrin Took'])
    await answer(page, true)

    for (const [width, height, colorScheme] of [
      [1440, 900, 'dark'],
      [640, 450, 'light'],
      [390, 844, 'dark'],
      [360, 780, 'light'],
    ] as const) {
      const at = `${width}px ${colorScheme}`
      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width, height })
      await page.goto(await lore(page, universeId))
      await page.getByTestId('lore-select').click()
      await expect(checks(page)).toHaveCount(3)
      expect(await sideways(page), at).toBeLessThanOrEqual(1)

      // The right-to-left name is its own direction; the box stays in Lorex's corner.
      const rtl = cards(page).filter({ hasText: 'فرودو باغنز' })
      await expect(rtl.locator('bdi', { hasText: 'فرودو باغنز' })).toBeVisible()
      const card = (await rtl.boundingBox())!
      const box = (await rtl.getByTestId('entity-select').boundingBox())!
      expect(box.x, at).toBeGreaterThan(card.x + card.width / 2)

      // Space on the focused box selects it; the bar and its actions are in reach and inside the screen.
      await rtl.getByTestId('entity-select').focus()
      await page.keyboard.press('Space')
      await expect(rtl.getByTestId('entity-select')).toBeChecked()
      await expect(rtl).toHaveAttribute('data-selected', 'true')
      const trash = page.getByTestId('lore-trash-selected')
      await expect(trash).toBeInViewport()
      const bar = (await page.getByTestId('lore-selectbar').boundingBox())!
      expect(bar.x + bar.width, at).toBeLessThanOrEqual(width + 1)
      expect(await sideways(page), at).toBeLessThanOrEqual(1)
      await page.getByTestId('lore-select-done').click()
    }

    // And moved, by the keyboard alone.
    await page.getByTestId('lore-select').click()
    await cards(page).filter({ hasText: 'فرودو باغنز' }).getByTestId('entity-select').focus()
    await page.keyboard.press('Space')
    await page.getByTestId('lore-trash-selected').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('lore-trashed')).toContainText('1 entry moved to the Trash.')
    await expect(cards(page)).toHaveCount(2)
  })
})
