import { expect, test, type Page } from '@playwright/test'
import { chooseLoreType } from './support/lore'
import { acceptConfirm, answerConfirms, confirmDialog } from './support/confirm'

/**
 * Mass create: "I have 40 names. Put them in LorEvolve." A secondary action on Lore opens one page inside the workspace:
 * defaults, a paste target, the rows to review, and one Create that makes every entry or none. Pastes are real
 * clipboard pastes (Ctrl+V into the box), so what is tested is what an author does.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('mass')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

/** A universe with the starter types, plus a Starship whose Registry is required. */
async function world(page: Page) {
  const created = await page.request.post('/api/universes', {
    data: { name: unique('Mass World '), description: null, accentColor: null },
  })
  const id = ((await created.json()) as { id: string }).id
  const starship = await typeNamed(page, id, 'Starship')
  const field = await page.request.post(`/api/universes/${id}/entity-types/${starship}/fields`, {
    data: {
      name: 'Registry',
      kind: 0,
      isRequired: true,
      displayOrder: null,
      defaultValue: null,
      options: null,
    },
  })
  expect(field.ok()).toBe(true)

  const types = (await (await page.request.get(`/api/universes/${id}/entity-types`)).json()) as {
    id: string
    name: string
  }[]
  return { id, type: new Map(types.map((type) => [type.name, type.id])) }
}

async function typeNamed(page: Page, universeId: string, name: string) {
  const response = await page.request.post(`/api/universes/${universeId}/entity-types`, {
    data: { name, description: null, icon: null, accentColor: null, displayOrder: null },
  })
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { id: string }).id
}

/** Puts `text` on the clipboard and pastes it into the empty box, as an author would. */
async function paste(page: Page, text: string) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate((value) => navigator.clipboard.writeText(value), text)
  await page.getByTestId('mass-paste').click()
  await page.keyboard.press('ControlOrMeta+V')
}

const rows = (page: Page) => page.getByTestId('mass-row')
const row = (page: Page, index: number) => rows(page).nth(index)
const submit = (page: Page) => page.getByTestId('mass-create-submit')

async function names(page: Page) {
  return page
    .getByTestId('mass-row-name')
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value))
}

async function entryCount(page: Page, universeId: string, query = '') {
  const response = await page.request.get(
    `/api/universes/${universeId}/entities?pageSize=1${query}`,
  )
  return ((await response.json()) as { totalCount: number }).totalCount
}

/** How far the page reaches past the right edge of the window. */
function sideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.describe('Mass create', () => {
  test('is a secondary action beside New on Lore, opens in the workspace, and starts on the type being browsed', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await page.goto(`/app/universes/${w.id}/lore`)

    // Easy to find, and quieter than the everyday way in.
    const mass = page.getByTestId('mass-create')
    await expect(mass).toHaveText('Mass create')
    await expect(mass).toHaveClass(/button--secondary/)
    await expect(page.getByTestId('new-entity')).not.toHaveClass(/button--secondary/)
    const order = await page
      .locator('.pageheader__actions')
      .evaluate((actions) =>
        Array.from(actions.children).map((child) => child.getAttribute('data-testid')),
      )
    expect(order).toEqual(['mass-create', 'new-entity'])

    await mass.click()
    await page.waitForURL(new RegExp(`/universes/${w.id}/lore/mass-create$`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mass create')
    await expect(
      page.getByText(
        'Create the basic entries now. Add articles, images, fields and relationships later.',
      ),
    ).toBeVisible()
    // The same workspace, not a second shell.
    await expect(page.getByTestId('workspace-name')).toBeVisible()

    // The normal new entry's default: the first type. Idea, as a new entry is.
    await expect(page.getByTestId('mass-default-type')).toHaveValue(w.type.get('Character')!)
    await expect(
      page.getByTestId('mass-default-status').getByRole('button', { name: 'Idea' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(submit(page)).toHaveAttribute('aria-disabled', 'true')
    await expect(page.getByTestId('mass-create-status')).toHaveText('Nothing to create yet.')

    // Blank, so leaving asks nothing.
    await page.getByTestId('mass-create-back').click()
    await page.waitForURL(new RegExp(`/universes/${w.id}/lore$`))
    await expect(confirmDialog(page)).toHaveCount(0)

    // Opened from a type, that type is the default, and Back returns to it.
    await chooseLoreType(page, 'Location')
    await page.getByTestId('mass-create').click()
    await page.waitForURL(new RegExp(`/lore/mass-create\\?type=${w.type.get('Location')}$`))
    await expect(page.getByTestId('mass-default-type')).toHaveValue(w.type.get('Location')!)
    await page.getByTestId('mass-create-back').click()
    await page.waitForURL(new RegExp(`/lore\\?type=${w.type.get('Location')}$`))

    // A type a name alone cannot create is never the default, and says why.
    await page.goto(`/app/universes/${w.id}/lore/mass-create?type=${w.type.get('Starship')}`)
    await expect(page.getByTestId('mass-starting-blocked')).toHaveText(
      'Starship has required fields, so its entries are created one at a time.',
    )
    await expect(page.getByTestId('mass-default-type')).toHaveValue(w.type.get('Character')!)
    await expect(
      page.getByTestId('mass-default-type').locator(`option[value="${w.type.get('Starship')}"]`),
    ).toBeDisabled()
  })

  test('names pasted one per line become rows: blank lines skipped, spacing trimmed, spelling kept', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await page.goto(`/app/universes/${w.id}/lore/mass-create`)

    await paste(page, '  Frodo Baggins \n\n\nsamwise GAMGEE\n\t\nPeregrin Took\n')

    await expect(rows(page)).toHaveCount(3)
    expect(await names(page)).toEqual(['Frodo Baggins', 'samwise GAMGEE', 'Peregrin Took'])
    for (let index = 0; index < 3; index++) {
      await expect(row(page, index).getByTestId('mass-row-type')).toHaveValue(
        w.type.get('Character')!,
      )
      await expect(row(page, index).getByTestId('mass-row-status')).toHaveValue('0')
    }
    // The box is ready for the next paste, and the page says what happened.
    await expect(page.getByTestId('mass-paste')).toHaveValue('')
    await expect(page.getByTestId('mass-announcement')).toHaveText('Added 3 rows.')
    await expect(page.getByTestId('mass-count')).toHaveText('3 of 100')
    await expect(submit(page)).toHaveText('Create 3 entries')
    await expect(submit(page)).not.toHaveAttribute('aria-disabled')
  })

  test('forty names are created in one request, and Lore says so and finds them', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await page.goto(`/app/universes/${w.id}/lore/mass-create`)

    // The defaults apply to what is pasted after them.
    await page.getByTestId('mass-default-type').selectOption({ label: 'Location' })
    await page.getByTestId('mass-default-status').getByRole('button', { name: 'Draft' }).click()

    const forty = Array.from(
      { length: 40 },
      (_, index) => `Wayfarer ${String(index + 1).padStart(2, '0')}`,
    )
    await paste(page, forty.join('\n'))
    await expect(rows(page)).toHaveCount(40)
    await expect(submit(page)).toHaveText('Create 40 entries')

    const writes: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/entities')) {
        writes.push(new URL(request.url()).pathname)
      }
    })
    // A successful create leaves nothing unsaved behind it, so nothing asks.
    await submit(page).click()
    await page.waitForURL(new RegExp(`/universes/${w.id}/lore$`))
    await expect(page.getByTestId('lore-mass-created')).toHaveText('Created 40 entries.')
    expect(writes).toEqual([`/api/universes/${w.id}/entities/bulk`])
    await expect(confirmDialog(page)).toHaveCount(0)

    // All of them, as Location and Draft; the grid shows the newest; the filter finds any one of them.
    expect(await entryCount(page, w.id)).toBe(40)
    expect(
      await entryCount(page, w.id, `&entityTypeId=${w.type.get('Location')}&canonStatus=1`),
    ).toBe(40)
    // Lore has no "All" to show a mixed batch in: it lands with no type chosen and says what was made; a type is chosen
    // from its type navigation.
    await expect(page.getByTestId('lore-mass-created')).toBeVisible()
    await expect(page.getByTestId('entity-card')).toHaveCount(0)
    await chooseLoreType(page, 'Location')
    await expect(page.getByTestId('entity-card').first()).toBeVisible()
    await page.getByLabel('Filter entries').fill('Wayfarer 23')
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(page.getByTestId('entity-card')).toContainText('Wayfarer 23')

    // Said once: moving on, or coming back, does not say it again.
    await expect(page.getByTestId('lore-mass-created')).toHaveCount(0)
    await page.reload()
    await expect(page.getByTestId('lore-mass-created')).toHaveCount(0)
  })

  test('a spreadsheet paste reads Type, Name and Status, and says exactly what it could not read', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await page.goto(`/app/universes/${w.id}/lore/mass-create`)

    await paste(
      page,
      [
        'Type\tName\tStatus',
        'Character\tFrodo Baggins\tCanon',
        'location\tRivendell\tdraft',
        'Ships\tBlack Pearl\tCanon',
        'Character\tMeriadoc Brandybuck\tFinal',
      ].join('\n'),
    )

    // The header is a spreadsheet's own, and is skipped. Types and statuses match exactly, ignoring case.
    await expect(rows(page)).toHaveCount(4)
    await expect(row(page, 0).getByTestId('mass-row-type')).toHaveValue(w.type.get('Character')!)
    await expect(row(page, 0).getByTestId('mass-row-status')).toHaveValue('2')
    await expect(row(page, 1).getByTestId('mass-row-type')).toHaveValue(w.type.get('Location')!)
    await expect(row(page, 1).getByTestId('mass-row-status')).toHaveValue('1')

    // Nothing is guessed: each problem is on its own row, in its own words.
    await expect(row(page, 2).getByTestId('mass-row-messages')).toHaveText(
      'Unknown type “Ships”. Choose one of this world’s types.',
    )
    await expect(row(page, 2).getByTestId('mass-row-type')).toHaveAttribute('aria-invalid', 'true')
    await expect(row(page, 3).getByTestId('mass-row-messages')).toHaveText(
      'Unknown status “Final”. Use Idea, Draft or Canon.',
    )
    await expect(page.getByTestId('mass-create-status')).toHaveText(
      '2 rows need a fix. Nothing is created until every row is ready.',
    )
    await expect(submit(page)).toHaveText('Create 2 entries')
    await expect(submit(page)).toHaveAttribute('aria-disabled', 'true')

    // Create with rows unready sends nothing and goes to the first problem.
    let sent = false
    page.on('request', (request) => {
      if (request.url().includes('/entities/bulk')) sent = true
    })
    // Unready is aria-disabled, not disabled: it keeps the focus, and pressing it goes to the first problem.
    await submit(page).click({ force: true })
    await expect(row(page, 2).getByTestId('mass-row-type')).toBeFocused()
    expect(sent).toBe(false)

    await row(page, 2).getByTestId('mass-row-type').selectOption({ label: 'Item' })
    await row(page, 3).getByTestId('mass-row-status').selectOption({ label: 'Canon' })
    await expect(rows(page).getByTestId('mass-row-messages')).toHaveCount(0)
    await expect(submit(page)).toHaveText('Create 4 entries')

    // A new default is for what comes next; rewriting the rows is its own, explicit action.
    await page.getByTestId('mass-default-type').selectOption({ label: 'Concept' })
    await expect(row(page, 0).getByTestId('mass-row-type')).toHaveValue(w.type.get('Character')!)
    await page.getByTestId('mass-apply-defaults').click()
    for (let index = 0; index < 4; index++) {
      await expect(row(page, index).getByTestId('mass-row-type')).toHaveValue(
        w.type.get('Concept')!,
      )
      await expect(row(page, index).getByTestId('mass-row-status')).toHaveValue('0')
    }
  })

  test('two columns cannot be read safely, so the paste is kept whole to fix; a comma is part of a name', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await page.goto(`/app/universes/${w.id}/lore/mass-create`)

    await paste(page, 'Character\tFrodo\nCharacter\tSam')
    await expect(page.getByTestId('mass-paste-message')).toHaveText(
      'Line 1 has two columns, which could be read more than one way. Paste one name per line, or three columns separated by tabs, in the order Type, Name, Status.',
    )
    await expect(page.getByTestId('mass-paste')).toHaveValue('Character\tFrodo\nCharacter\tSam')
    await expect(rows(page)).toHaveCount(0)

    // Typed, not pasted: added with Add to list, or Ctrl+Enter.
    await page.getByTestId('mass-paste').fill('Baggins, Frodo\nGamgee, Samwise')
    await page.getByTestId('mass-paste').press('ControlOrMeta+Enter')
    expect(await names(page)).toEqual(['Baggins, Frodo', 'Gamgee, Samwise'])
    await expect(page.getByTestId('mass-paste-message')).toHaveCount(0)
  })

  test('rows are edited, added and removed by hand, and the keyboard never creates by accident', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await page.goto(`/app/universes/${w.id}/lore/mass-create`)

    let sent = 0
    page.on('request', (request) => {
      if (request.url().includes('/entities/bulk')) sent++
    })

    await paste(page, 'Frodo\nSam')
    await page.getByTestId('mass-add-row').click()
    await expect(rows(page)).toHaveCount(3)
    await expect(row(page, 2).getByTestId('mass-row-name')).toBeFocused()
    await page.keyboard.type('Pippin')

    // Across a row in reading order: name, type, status, Remove - and Remove says whose row it is.
    await page.keyboard.press('Tab')
    await expect(row(page, 2).getByTestId('mass-row-type')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(row(page, 2).getByTestId('mass-row-status')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Remove row 3: Pippin' })).toBeFocused()

    // Enter in a row is not Create.
    await row(page, 0).getByTestId('mass-row-name').press('Enter')
    await expect(rows(page)).toHaveCount(3)
    expect(sent).toBe(0)

    await row(page, 1).getByTestId('mass-row-name').fill('Samwise Gamgee')
    await row(page, 1).getByTestId('mass-row-type').selectOption({ label: 'Location' })
    await row(page, 1).getByTestId('mass-row-status').selectOption({ label: 'Canon' })

    await page.getByRole('button', { name: 'Remove row 1: Frodo' }).click()
    expect(await names(page)).toEqual(['Samwise Gamgee', 'Pippin'])
    // The focus stays where the author was working: on the row that took its place.
    await expect(page.getByRole('button', { name: 'Remove row 1: Samwise Gamgee' })).toBeFocused()

    // A row left without a name is found for the author, not sent.
    await page.getByTestId('mass-add-row').click()
    await expect(submit(page)).toHaveText('Create 2 entries')
    await submit(page).click({ force: true })
    await expect(row(page, 2).getByTestId('mass-row-name')).toBeFocused()
    await expect(row(page, 2).getByTestId('mass-row-messages')).toHaveText('Name is required.')
    expect(sent).toBe(0)
    await page.getByRole('button', { name: 'Remove row 3' }).click()

    // The one action, reached and visibly focused from the keyboard: past Add row, straight to Create.
    await expect(page.getByRole('button', { name: 'Remove row 2: Pippin' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('mass-add-row')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(submit(page)).toBeFocused()
    expect(await submit(page).evaluate((button) => getComputedStyle(button).outlineStyle)).not.toBe(
      'none',
    )
    await page.keyboard.press('Enter')
    await page.waitForURL(new RegExp(`/universes/${w.id}/lore$`))
    await expect(page.getByTestId('lore-mass-created')).toHaveText('Created 2 entries.')
    expect(sent).toBe(1)
    expect(
      await entryCount(
        page,
        w.id,
        `&search=Samwise&entityTypeId=${w.type.get('Location')}&canonStatus=2`,
      ),
    ).toBe(1)
  })

  test('the same type and name twice is a warning, never a refusal', async ({ page }) => {
    await signUp(page)
    const w = await world(page)
    await page.goto(`/app/universes/${w.id}/lore/mass-create`)

    await paste(page, 'Robin\nRobin\nrobin ')
    await expect(row(page, 0).getByTestId('mass-row-messages')).toHaveCount(0)
    for (const index of [1, 2]) {
      await expect(row(page, index).getByTestId('mass-row-messages')).toHaveText(
        'Same type and name as row 1. It will be created twice.',
      )
    }
    // A different type is a different entry.
    await row(page, 2).getByTestId('mass-row-type').selectOption({ label: 'Location' })
    await expect(row(page, 2).getByTestId('mass-row-messages')).toHaveCount(0)

    await expect(submit(page)).toHaveText('Create 3 entries')
    await submit(page).click()
    await expect(page.getByTestId('lore-mass-created')).toHaveText('Created 3 entries.')
    expect(await entryCount(page, w.id, '&search=Robin')).toBe(3)
  })

  test('a type with required fields cannot be mass created, from a paste or a row', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await page.goto(`/app/universes/${w.id}/lore/mass-create`)

    await paste(page, 'Starship\tMillennium Falcon\tIdea\nCharacter\tHan\tIdea')
    await expect(row(page, 0).getByTestId('mass-row-messages')).toHaveText(
      'The type “Starship” has required fields. Create this entry on its own.',
    )
    await expect(submit(page)).toHaveAttribute('aria-disabled', 'true')
    // Another row cannot choose it either.
    await expect(
      row(page, 1)
        .getByTestId('mass-row-type')
        .locator(`option[value="${w.type.get('Starship')}"]`),
    ).toBeDisabled()

    await row(page, 0).getByTestId('mass-row-type').selectOption({ label: 'Item' })
    await expect(submit(page)).toHaveText('Create 2 entries')
    await expect(submit(page)).not.toHaveAttribute('aria-disabled')
  })

  test('a create that fails keeps every row, and says why where it can', async ({ page }) => {
    await signUp(page)
    const w = await world(page)
    const moon = await typeNamed(page, w.id, 'Moon')
    await page.goto(`/app/universes/${w.id}/lore/mass-create`)

    await page.getByTestId('mass-default-type').selectOption({ label: 'Moon' })
    await paste(page, 'Endor\nIthil\nLuna')
    await expect(rows(page)).toHaveCount(3)

    // The type goes while the page is open: only the API can know, and it refuses the batch by row.
    expect((await page.request.delete(`/api/universes/${w.id}/entity-types/${moon}`)).ok()).toBe(
      true,
    )
    await submit(page).click()
    await expect(page.getByTestId('mass-create-failure')).toHaveText(
      'Nothing was created. Fix the rows marked below, then create them again.',
    )
    for (let index = 0; index < 3; index++) {
      await expect(row(page, index).getByTestId('mass-row-messages')).toHaveText(
        'Choose a type from this universe.',
      )
    }
    expect(await names(page)).toEqual(['Endor', 'Ithil', 'Luna'])
    expect(await entryCount(page, w.id)).toBe(0)

    // A failure that is not about the rows: still nothing created, still every row.
    await page.getByTestId('mass-default-type').selectOption({ label: 'Location' })
    await page.getByTestId('mass-apply-defaults').click()
    await page.route('**/entities/bulk', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/problem+json',
        body: JSON.stringify({ title: 'An error occurred while processing your request.' }),
      }),
    )
    await submit(page).click()
    await expect(page.getByTestId('mass-create-failure')).toContainText('Nothing was created.')
    await expect(page.getByTestId('mass-create-failure')).toContainText('Your rows are still here.')
    expect(await names(page)).toEqual(['Endor', 'Ithil', 'Luna'])
    await page.unroute('**/entities/bulk')

    await submit(page).click()
    await expect(page.getByTestId('lore-mass-created')).toHaveText('Created 3 entries.')
  })

  test('leaving asks only when there is something to lose, by link and by Back', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await page.goto(`/app/universes/${w.id}/lore`)
    await page.getByTestId('mass-create').click()
    await page.waitForURL(/\/lore\/mass-create$/)
    await paste(page, 'Frodo Baggins')
    await expect(rows(page)).toHaveCount(1)

    // Stays twice, then leaves: a question is recorded once it has been answered.
    const asked: string[] = []
    await answerConfirms(page, () => asked.length >= 2, asked)

    await page.getByTestId('mass-create-back').click()
    await expect(page).toHaveURL(/\/lore\/mass-create$/)
    expect(asked).toEqual(['1 entry has not been created. Leave without creating it?'])
    await expect(rows(page)).toHaveCount(1)

    await page.goBack()
    await expect.poll(() => asked.length).toBe(2)
    await expect(page).toHaveURL(/\/lore\/mass-create$/)
    expect(await names(page)).toEqual(['Frodo Baggins'])

    await page.getByTestId('mass-create-back').click()
    await page.waitForURL(new RegExp(`/universes/${w.id}/lore$`))
    expect(asked).toHaveLength(3)
    expect(await entryCount(page, w.id)).toBe(0)
  })

  test('every width, both themes and 200%: rows stack on a phone and nothing scrolls sideways', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await signUp(page)
    const w = await world(page)
    await typeNamed(page, w.id, 'Ancient Order of the Long-Remembered Northern Watchtowers')
    await answerConfirms(page, () => true, [])

    const ten = [
      'Character\tFrodo Baggins\tCanon',
      'Location\tRivendell\tDraft',
      'Ancient Order of the Long-Remembered Northern Watchtowers\tThe Very Long Authored Name Of A Place That Keeps Going Well Past Any Reasonable Column Width\tDraft',
      'Character\tفرودو باغنز\tIdea',
      'Ships\tBlack Pearl\tCanon',
      'Character\tMeriadoc Brandybuck\tFinal',
      'Starship\tMillennium Falcon\tIdea',
      'Character\tFrodo Baggins\tCanon',
      'Location\t\tIdea',
      'Item\tThe One Ring\tCanon',
    ].join('\n')

    // 640 × 450 at twice the pixels is a 1280 × 900 window at 200%.
    for (const [width, height, colorScheme] of [
      [1920, 1080, 'light'],
      [1440, 900, 'dark'],
      [1024, 768, 'light'],
      [820, 1000, 'dark'],
      [390, 844, 'light'],
      [360, 780, 'dark'],
      [640, 450, 'light'],
    ] as const) {
      const where = `${width}px ${colorScheme}`
      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width, height })
      await page.goto(`/app/universes/${w.id}/lore/mass-create`)
      await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme)
      await expect(page.getByTestId('mass-paste')).toBeVisible()
      expect(await sideways(page), `blank ${where}`).toBeLessThanOrEqual(0)

      await paste(page, ten)
      await expect(rows(page)).toHaveCount(10)
      expect(await sideways(page), `rows ${where}`).toBeLessThanOrEqual(0)

      const longest = row(page, 2)
      const name = (await longest.getByTestId('mass-row-name').boundingBox())!
      const type = (await longest.getByTestId('mass-row-type').boundingBox())!
      const status = (await longest.getByTestId('mass-row-status').boundingBox())!
      const remove = (await longest.getByTestId('mass-row-remove').boundingBox())!
      const typeLabel = (await longest.locator('.masscreate__cell--type label').boundingBox())!
      for (const box of [name, type, status, remove]) {
        expect(box.x + box.width, where).toBeLessThanOrEqual(width)
      }
      if (width <= 640) {
        // A stacked block: the name on its own line, then type, status and Remove under it.
        expect(type.y, where).toBeGreaterThan(name.y + name.height - 1)
        expect(Math.abs(type.y - status.y), where).toBeLessThanOrEqual(2)
        // With no column heads above it, the row says which control is which.
        expect(typeLabel.width, where).toBeGreaterThan(20)
      } else {
        // One line, a table's row.
        expect(Math.abs(type.y - name.y), where).toBeLessThanOrEqual(2)
        expect(Math.abs(status.y - name.y), where).toBeLessThanOrEqual(2)
        expect(type.x, where).toBeGreaterThan(name.x + name.width)
        expect(typeLabel.width, where).toBeLessThanOrEqual(1)
      }
      await expect(submit(page)).toBeVisible()
    }
  })

  test('a right-to-left name reads in its own direction and moves nothing around it', async ({
    page,
  }) => {
    await signUp(page)
    const w = await world(page)
    await page.goto(`/app/universes/${w.id}/lore/mass-create`)

    await paste(page, 'Frodo Baggins\nفرودو باغنز\nעידן האור')
    const ltr = row(page, 0)
    const rtl = row(page, 1)
    await expect(rtl.getByTestId('mass-row-name')).toHaveValue('فرودو باغنز')
    expect(
      await rtl.getByTestId('mass-row-name').evaluate((input) => getComputedStyle(input).direction),
    ).toBe('rtl')

    // The row's controls stay where every other row has them.
    for (const control of [
      'mass-row-name',
      'mass-row-type',
      'mass-row-status',
      'mass-row-remove',
    ]) {
      const a = (await ltr.getByTestId(control).boundingBox())!
      const b = (await rtl.getByTestId(control).boundingBox())!
      expect(Math.abs(a.x - b.x), control).toBeLessThanOrEqual(1)
      expect(Math.abs(a.width - b.width), control).toBeLessThanOrEqual(1)
    }
    expect(
      await rtl
        .getByTestId('mass-row-type')
        .evaluate((select) => getComputedStyle(select).direction),
    ).toBe('ltr')

    await submit(page).click()
    await expect(page.getByTestId('lore-mass-created')).toHaveText('Created 3 entries.')
    await chooseLoreType(page, 'Character')
    await expect(
      page.getByTestId('entity-card').filter({ hasText: 'فرودو باغنز' }).locator('bdi'),
    ).toHaveText('فرودو باغنز')
  })
})
