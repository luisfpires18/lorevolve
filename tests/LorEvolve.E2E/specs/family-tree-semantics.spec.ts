import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'
import { expectDetails, openDetails } from './support/familyTree'

/**
 * Family Tree eligibility, family that defines no ancestry, and the Types screen's three tabs (ADR 0040). Each test
 * registers its own account and builds its own universe.
 *
 * The invariants: a type takes part in the Family Tree because its author says so, never because of its name; an
 * entry already recorded in a family stays reachable whatever its type; and an "uncle of" is listed as the authored
 * link it is - it never puts anyone in the tree.
 */
const Canon = { idea: 0, draft: 1, canon: 2 } as const
const Family = { none: 0, biological: 1, adoptive: 2, other: 3 } as const

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('kinwright')
  const password = makeTestPassword()
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function newUniverse(page: Page, name: string) {
  const response = await page.request.post('/api/universes', {
    data: { name, description: null, accentColor: null },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

async function typeIds(page: Page, universeId: string) {
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string; familyTreeEligible: boolean }[]
  return new Map(types.map((type) => [type.name, type]))
}

async function seedEntry(page: Page, universeId: string, typeId: string, name: string) {
  const response = await page.request.post(`/api/universes/${universeId}/entities`, {
    data: {
      entityTypeId: typeId,
      name,
      summary: null,
      canonStatus: Canon.canon,
      aliases: [],
      tags: [],
      fields: [],
    },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

async function seedKind(
  page: Page,
  universeId: string,
  name: string,
  inverseName: string | null,
  familySemantic: number,
  isSymmetric = false,
) {
  const response = await page.request.post(`/api/universes/${universeId}/relationship-types`, {
    data: {
      name,
      inverseName,
      isSymmetric,
      description: null,
      displayOrder: null,
      canonConstraints: null,
      familySemantic,
    },
  })
  expect(response.status()).toBe(201)
  return (await response.json()).id as string
}

async function seedLink(page: Page, universeId: string, kindId: string, from: string, to: string) {
  const response = await page.request.post(`/api/universes/${universeId}/relationships`, {
    data: {
      relationshipTypeId: kindId,
      sourceEntityId: from,
      targetEntityId: to,
      canonStatus: Canon.canon,
      startDate: null,
      endDate: null,
      notes: null,
    },
  })
  expect(response.status()).toBe(201)
}

function treeUrl(universeId: string, entityId?: string) {
  const base = `/app/universes/${universeId}/family-tree`
  return entityId ? `${base}/${entityId}` : base
}

function node(page: Page, name: string) {
  return page.getByTestId(`family-node-${name}`)
}

function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

/** Types a search into the picker on the page and waits for its answer to settle. */
async function search(page: Page, text: string) {
  const input = page.getByTestId('picker-input').first()
  await input.click()
  await input.fill(text)
  await expect(page.locator('.picker__none', { hasText: 'Looking' })).toHaveCount(0)
}

test.describe('family tree semantics', () => {
  test('only entries of a type enabled for Family Tree get its action and its picker', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Middle-earth '))
    const types = await typeIds(page, universeId)
    const frodo = await seedEntry(page, universeId, types.get('Character')!.id, 'Frodo')
    const men = await seedEntry(page, universeId, types.get('Species')!.id, 'Men')
    await seedEntry(page, universeId, types.get('Location')!.id, 'Rivendell')

    await page.goto(`/app/universes/${universeId}/lore/${frodo}`)
    await expect(page.getByTestId('entity-family-tree')).toBeVisible()

    await page.goto(`/app/universes/${universeId}/lore/${men}`)
    await expect(page.getByTestId('entry-name')).toHaveText('Men')
    await expect(page.getByTestId('edit-entity')).toBeVisible()
    await expect(page.getByTestId('entity-family-tree')).toHaveCount(0)

    await page.goto(treeUrl(universeId))
    await search(page, 'Frodo')
    await expect(page.getByTestId('picker-option-Frodo')).toBeVisible()
    await search(page, 'Men')
    await expect(page.locator('.picker__none')).toHaveText('Nothing here by that name.')
    await search(page, 'Rivendell')
    await expect(page.locator('.picker__none')).toHaveText('Nothing here by that name.')
  })

  test('an entry already in a family stays reachable, and says its type is not enabled', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Legacy kin '))
    const types = await typeIds(page, universeId)
    const bore = await seedKind(page, universeId, 'bore', 'born to', Family.biological)
    const men = await seedEntry(page, universeId, types.get('Species')!.id, 'Men')
    const aragorn = await seedEntry(page, universeId, types.get('Character')!.id, 'Aragorn')
    await seedLink(page, universeId, bore, men, aragorn)

    // Recorded before eligibility existed: its page still offers the tree, and the tree still opens.
    await page.goto(`/app/universes/${universeId}/lore/${men}`)
    await page.getByTestId('entity-family-tree').click()
    await page.waitForURL(`**/family-tree/${men}`)
    await expect(page.getByTestId('family-type-not-enabled')).toContainText(
      'is not currently enabled for Family Tree',
    )
    await expectDetails(page, 'Aragorn', 'Biological child')

    // No way out to a switch the Types screen does not offer for an existing type.
    await expect(page.getByTestId('family-type-not-enabled').getByRole('link')).toHaveCount(0)
    expect((await typeIds(page, universeId)).get('Species')!.familyTreeEligible).toBe(false)

    // It is not offered for new connections.
    await page.goto(treeUrl(universeId, aragorn))
    await expect(page.getByTestId('family-type-not-enabled')).toHaveCount(0)
    await expectDetails(page, 'Men', 'Biological parent')
    // The family is found from Aragorn's side, and the character picker beside it does not offer Men either.
    await page.goto(treeUrl(universeId))
    await expect(page.getByTestId('family-card')).toHaveText(['Aragorn, Men2 members'])
    await page.getByTestId('family-find-character').click()
    await search(page, 'Men')
    await expect(page.locator('.picker__none')).toHaveText('Nothing here by that name.')
  })

  test('with no enabled type the tree says so, and sends the author to Lore Types', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('No kin '))
    const character = (await typeIds(page, universeId)).get('Character')!
    const turnedOff = await page.request.put(
      `/api/universes/${universeId}/entity-types/${character.id}`,
      {
        data: {
          name: 'Character',
          description: null,
          icon: 'character',
          accentColor: null,
          displayOrder: null,
          familyTreeEligible: false,
        },
      },
    )
    expect(turnedOff.status()).toBe(200)

    await page.goto(treeUrl(universeId))
    const notice = page.getByTestId('family-no-types')
    await expect(notice).toContainText('No Lore Type is enabled for Family Tree yet.')
    await expect(page.getByTestId('family-no-kinds')).toHaveCount(0)
    await notice.getByRole('link', { name: 'Types → Lore Types' }).click()
    await page.waitForURL(/\/types$/)
    await expect(page.getByTestId('types-tab-lore')).toHaveAttribute('aria-selected', 'true')
  })

  test('Types is three tabs: lore types with a New type dialog and the Family Tree switch, relation kinds, and event kinds', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Vocabulary '))
    const typesPath = `/app/universes/${universeId}/types`

    await page.goto(typesPath)
    const tabs = page.getByTestId('types-tabs')
    await expect(tabs.getByRole('tab')).toHaveText([
      'Lore Types',
      'Relation Kinds',
      'Event Kinds & Methods',
    ])
    await expect(page.getByTestId('types-tab-lore')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('types-panel-relations')).toBeHidden()
    await expect(page.getByTestId('types-panel-events')).toBeHidden()
    // The old always-open creator is gone.
    await expect(page.getByLabel('New type')).toHaveCount(0)

    // ---- The Family Tree choice: made when a type is created, never on a row or in Edit ----

    await expect(page.getByText('Entries of this type can appear in Family Tree')).toHaveCount(0)
    for (const [name, eligible] of [
      ['Character', true],
      ['Species', false],
    ] as const) {
      await page.getByTestId(`edit-type-${name}`).click()
      const edit = page.getByTestId('edit-type-dialog')
      await expect(edit.getByTestId('type-family')).toHaveCount(0)
      await expect(edit.getByText('Family Tree')).toHaveCount(0)
      // A new name and icon keep the stored choice, whichever it is.
      await edit.getByLabel('Name', { exact: true }).fill(`${name} renamed`)
      await edit.getByRole('radio', { name: 'Star', exact: true }).check()
      await edit.getByTestId('save-type').click()
      await expect(edit).toHaveCount(0)
      await expect
        .poll(
          async () => (await typeIds(page, universeId)).get(`${name} renamed`)?.familyTreeEligible,
        )
        .toBe(eligible)
      await page.getByTestId(`edit-type-${name} renamed`).click()
      await edit.getByLabel('Name', { exact: true }).fill(name)
      await edit.getByTestId('save-type').click()
      await expect(page.getByTestId(`edit-type-${name}`)).toBeVisible()
      expect((await typeIds(page, universeId)).get(name)!.familyTreeEligible).toBe(eligible)
    }

    // ---- New type: a dialog, focus in and back out, and the list updated in place ----

    await page.evaluate(() => {
      ;(window as unknown as { stayed: boolean }).stayed = true
    })
    const trigger = page.getByTestId('new-type')
    await trigger.click()
    const dialog = page.getByTestId('new-type-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()

    await trigger.click()
    await dialog.getByTestId('save-type').click()
    await expect(dialog.getByText('Give the type a name.')).toBeVisible()
    await dialog.getByLabel('Name', { exact: true }).fill('Hobbit-kin')
    await dialog.getByTestId('type-family').check()
    await dialog.getByTestId('save-type').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.locator('[data-type-name="Hobbit-kin"]')).toBeVisible()
    await expect
      .poll(async () => (await typeIds(page, universeId)).get('Hobbit-kin')!.familyTreeEligible)
      .toBe(true)
    expect(await page.evaluate(() => (window as unknown as { stayed?: boolean }).stayed)).toBe(true)
    await expect(page).toHaveURL(new RegExp(`${typesPath}$`))

    // ---- Relation Kinds: the same manager, in its own tab, in the address ----

    await page.getByTestId('types-tab-relations').click()
    await expect(page).toHaveURL(/\?tab=relations$/)
    await expect(page.getByTestId('types-panel-lore')).toBeHidden()
    await page.getByTestId('add-relationship-type').click()
    const form = page.getByTestId('relationship-type-form')
    await form.getByLabel('Reads as', { exact: true }).fill('married to')
    await form.getByTestId('reltype-symmetric').check()
    await form
      .getByLabel('Family meaning')
      .selectOption({ label: 'Family relationship, does not define ancestry' })
    await page.getByTestId('save-relationship-type').click()
    await expect(page.getByTestId('reltype-family-married to')).toHaveText(
      'Family: listed on the Family Tree, defines no ancestry',
    )
    await page.reload()
    await expect(page.getByTestId('types-tab-relations')).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('[data-reltype-name="married to"]')).toBeVisible()

    // ---- Event Kinds & Methods, reached by the keyboard ----

    await page.getByTestId('types-tab-relations').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('types-tab-events')).toBeFocused()
    await expect(page).toHaveURL(/\?tab=events$/)
    const terms = page.getByTestId('validation-terms')
    await expect(terms).toBeVisible()
    await terms.getByTestId('new-term-name').fill('Coronation')
    await terms.getByTestId('add-term').click()
    await expect(terms.locator('[data-term-name="Coronation"]')).toBeVisible()
  })

  test('Types tabs are steps of history, Settings tabs still are not', async ({ page }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('History '))
    const base = `/app/universes/${universeId}`
    const selected = (id: string) =>
      expect(page.getByTestId(`types-tab-${id}`)).toHaveAttribute('aria-selected', 'true')

    await page.goto(`${base}/types`)
    await selected('lore')
    await page.getByTestId('types-tab-relations').click()
    await expect(page).toHaveURL(`${base}/types?tab=relations`)
    await page.getByTestId('types-tab-events').click()
    await expect(page).toHaveURL(`${base}/types?tab=events`)
    await expect(page.getByTestId('validation-terms')).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(`${base}/types?tab=relations`)
    await selected('relations')
    await expect(page.getByTestId('add-relationship-type')).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(`${base}/types`)
    await selected('lore')
    await expect(page.getByTestId('type-list')).toBeVisible()

    await page.goForward()
    await expect(page).toHaveURL(`${base}/types?tab=relations`)
    await selected('relations')

    await page.reload()
    await selected('relations')
    await expect(page.getByTestId('add-relationship-type')).toBeVisible()

    await page.goto(`${base}/types?tab=events`)
    await selected('events')
    await expect(page.getByTestId('validation-terms')).toBeVisible()

    // Clicking the tab already open adds no step.
    await page.getByTestId('types-tab-events').click()
    await page.goBack()
    await expect(page).toHaveURL(`${base}/types?tab=relations`)

    // Settings keeps replacing: its tabs are one entry, and Back leaves Settings.
    await page.goto(`${base}/trash`)
    await page.goto(`${base}/settings`)
    await page.getByTestId('settings-tab-appearance').click()
    await expect(page).toHaveURL(`${base}/settings?tab=appearance`)
    await page.getByTestId('settings-tab-data').click()
    await expect(page).toHaveURL(`${base}/settings?tab=data`)
    await page.reload()
    await expect(page.getByTestId('settings-tab-data')).toHaveAttribute('aria-selected', 'true')
    await page.goBack()
    await expect(page).toHaveURL(`${base}/trash`)
  })

  test('an uncle is created without leaving the tree, and is listed as authored family with no ancestry', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Bag End '))
    const character = (await typeIds(page, universeId)).get('Character')!.id
    await seedKind(page, universeId, 'raised', 'raised by', Family.adoptive)
    const bilbo = await seedEntry(page, universeId, character, 'Bilbo')
    const frodo = await seedEntry(page, universeId, character, 'Frodo')

    await page.goto(treeUrl(universeId, bilbo))
    await page.getByTestId('add-family-link').click()
    const form = page.getByTestId('family-link-form')

    // A parent kind keeps asking which side is the parent.
    await expect(form.getByTestId('family-link-kind')).toHaveValue(/.+/)
    await expect(form.getByTestId('family-link-side')).toBeVisible()
    await expect(form.getByTestId('family-link-side').locator('option')).toHaveText([
      'Bilbo is the parent',
      'Bilbo is the child',
    ])

    // ---- The kind, made in place ----

    const url = page.url()
    await form.getByTestId('new-family-kind').click()
    const dialog = page.getByTestId('family-kind-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Name', { exact: true })).toBeFocused()
    await expect(dialog.getByTestId('family-kind-meaning')).toHaveValue(String(Family.other))
    await dialog.getByLabel('Name', { exact: true }).fill('uncle of')
    await dialog.getByLabel('Inverse name').fill('nephew or niece of')
    await dialog.getByTestId('create-family-kind').click()
    await expect(dialog).toHaveCount(0)
    expect(page.url()).toBe(url)
    await expect(form.getByTestId('new-family-kind')).toBeFocused()

    // Chosen at once, and read the way any relation is - not as a parent.
    await expect(form.getByTestId('family-link-kind').locator('option:checked')).toHaveText(
      'uncle of',
    )
    await expect(form.getByTestId('family-link-side')).toHaveCount(0)
    await expect(form.getByTestId('family-link-reading').locator('option')).toHaveText([
      'uncle of',
      'nephew or niece of',
    ])
    await form.getByTestId('picker-input').click()
    await form.getByTestId('picker-input').fill('Frodo')
    await form.getByTestId('picker-option-Frodo').click()
    await expect(page.getByTestId('family-link-preview')).toHaveText('Bilbo uncle of Frodo')
    await page.getByTestId('save-family-link').click()
    await expect(form).toHaveCount(0)

    // ---- In Bilbo's details, and beside him in the tree, with no generation of its own ----

    // No separate list below the tree any more: the link is with the member it belongs to.
    await expect(page.getByTestId('family-other-connections')).toHaveCount(0)
    let details = await openDetails(page, 'Bilbo')
    // Written as an Idea, the form's default, and said so in words.
    await expect(details.getByTestId('family-details-connection')).toHaveText([
      'uncle of Frodo (Idea connection)',
    ])
    await expect(details).toContainText('place nobody in a generation')
    await page.keyboard.press('Escape')
    await expect(details).toHaveCount(0)
    await expect(node(page, 'Frodo')).toHaveCount(1)
    await expect(page.locator('.familytree__linelabel')).toHaveText('Bilbo uncle of Frodo')

    await page.goto(treeUrl(universeId, frodo))
    details = await openDetails(page, 'Frodo')
    await expect(details.getByTestId('family-details-connection')).toHaveText([
      'nephew or niece of Bilbo (Idea connection)',
    ])
    // The relative not drawn in the tree is one link away, at its entry.
    await details.getByRole('link', { name: 'Bilbo' }).click()
    await page.waitForURL(`**/lore/${bilbo}**`)
    await expect(page.getByTestId('entry-name')).toHaveText('Bilbo')
    await page.goBack()
    // The tree holds the entry in focus and, beside it, the uncle it recorded.
    await expect(node(page, 'Bilbo')).toHaveCount(1)
    await expect(page.locator('.familynode')).toHaveCount(2)

    // An ordinary relation on the entry, in its own words.
    const relations = (await (
      await page.request.get(`/api/universes/${universeId}/entities/${bilbo}/relationships`)
    ).json()) as { label: string; relatedEntityName: string }[]
    expect(relations).toEqual([
      expect.objectContaining({
        label: 'uncle of',
        relatedEntityName: 'Frodo',
      }),
    ])
  })

  test('a universe with no family kind offers one on the spot', async ({ page }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Shire '))
    const character = (await typeIds(page, universeId)).get('Character')!.id
    const sam = await seedEntry(page, universeId, character, 'Samwise')
    await seedEntry(page, universeId, character, 'Rosie')

    await page.goto(treeUrl(universeId, sam))
    const notice = page.getByTestId('family-no-kinds')
    await expect(notice).toContainText('Family Tree needs a family relation kind')
    await expect(page.getByTestId('add-family-link')).toHaveCount(0)

    await notice.getByTestId('family-new-kind').click()
    const dialog = page.getByTestId('family-kind-dialog')
    await dialog.getByLabel('Name', { exact: true }).fill('married to')
    await dialog.getByTestId('family-kind-symmetric').check()
    await expect(dialog.getByLabel('Inverse name')).toHaveCount(0)
    await expect(dialog.getByTestId('family-kind-meaning').locator('option')).toHaveText([
      'Family relationship, does not define ancestry',
    ])
    await dialog.getByTestId('create-family-kind').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('family-no-kinds')).toHaveCount(0)

    await page.getByTestId('add-family-link').click()
    const form = page.getByTestId('family-link-form')
    await expect(form.getByTestId('family-link-reading')).toHaveCount(0)
    await form.getByTestId('picker-input').click()
    await form.getByTestId('picker-input').fill('Rosie')
    await form.getByTestId('picker-option-Rosie').click()
    await page.getByTestId('save-family-link').click()
    const details = await openDetails(page, 'Samwise')
    await expect(details.getByTestId('family-details-connection')).toHaveText([
      'married to Rosie (Idea connection)',
    ])
  })

  test('tabs, dialogs and the family lists fit every width, light and dark, and at 200%', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Wide shire '))
    const character = (await typeIds(page, universeId)).get('Character')!.id
    const uncle = await seedKind(page, universeId, 'uncle of', 'nephew or niece of', Family.other)
    const bilbo = await seedEntry(page, universeId, character, 'بيلبو باجنز')
    for (const name of ['Frodo Baggins of Bag End and the Shire', 'Merry', 'Pippin']) {
      await seedLink(
        page,
        universeId,
        uncle,
        bilbo,
        await seedEntry(page, universeId, character, name),
      )
    }

    // 640 × 450 is a 1280 × 900 window at 200% zoom.
    for (const [width, height, colorScheme] of [
      [1440, 900, 'light'],
      [1024, 768, 'dark'],
      [820, 1000, 'light'],
      [390, 844, 'dark'],
      [360, 780, 'light'],
      [640, 450, 'dark'],
    ] as const) {
      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width, height })
      const at = `${width}px ${colorScheme}`

      await page.goto(`/app/universes/${universeId}/types`)
      await expect(page.getByTestId('types-tab-events')).toBeVisible()
      expect(await scrollsSideways(page), `types at ${at}`).toBe(false)
      await page.getByTestId('new-type').click()
      await expect(page.getByTestId('save-type')).toBeInViewport()
      expect(await scrollsSideways(page), `new type at ${at}`).toBe(false)
      await page.keyboard.press('Escape')

      await page.goto(treeUrl(universeId, bilbo))
      const details = await openDetails(page, 'بيلبو باجنز')
      await expect(details.getByTestId('family-details-connection')).toHaveCount(3)
      await expect(details.locator('bdi', { hasText: 'بيلبو باجنز' }).first()).toBeVisible()
      await expect(details.getByRole('link', { name: 'Open entry' })).toBeInViewport()
      expect(await scrollsSideways(page), `family details at ${at}`).toBe(false)
      await page.keyboard.press('Escape')
      await expect(details).toHaveCount(0)
      expect(await scrollsSideways(page), `family tree at ${at}`).toBe(false)

      await page.getByTestId('add-family-link').click()
      await page.getByTestId('new-family-kind').click()
      await expect(page.getByTestId('create-family-kind')).toBeInViewport()
      expect(await scrollsSideways(page), `family kind dialog at ${at}`).toBe(false)
      await page.keyboard.press('Escape')
      await expect(page.getByTestId('family-kind-dialog')).toHaveCount(0)
    }
  })
})
