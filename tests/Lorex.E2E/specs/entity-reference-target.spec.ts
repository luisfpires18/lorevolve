import { expect, test, type Locator, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * A link-to-an-entity field limited to one type (036): a Character's "Kingdom" that offers, accepts and filters by Kingdoms
 * only, chosen on the Types screen by type and never by name. The picker searches that type through the API; the API
 * refuses anything else whatever the picker offered.
 *
 * Each test registers its own account and builds its own universe.
 */

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function account(page: Page) {
  const username = unique('linker')
  const password = makeTestPassword()
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: { username, email: `${username}@example.test`, password },
      })
    ).ok(),
  ).toBe(true)
  expect(
    (
      await page.request.post('/api/auth/login', { data: { usernameOrEmail: username, password } })
    ).ok(),
  ).toBe(true)
}

async function post<T = { id: string }>(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data })
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
  return (await response.json()) as T
}

async function world(page: Page) {
  const u = (await post(page, '/api/universes', { name: unique('Arkhos '), description: null })).id
  const types = (await (await page.request.get(`/api/universes/${u}/entity-types`)).json()) as {
    id: string
    name: string
  }[]
  const character = types.find((type) => type.name === 'Character')!.id
  const type = async (name: string) =>
    (
      await post(page, `/api/universes/${u}/entity-types`, {
        name,
        description: null,
        icon: null,
        accentColor: null,
        displayOrder: null,
      })
    ).id
  const kingdoms = await type('Kingdoms')
  const runes = await type('Runes')
  const entry = async (typeId: string, name: string) =>
    (
      await post(page, `/api/universes/${u}/entities`, {
        entityTypeId: typeId,
        name,
        summary: null,
        canonStatus: 2,
        aliases: [],
        tags: [],
        fields: [],
      })
    ).id
  return {
    u,
    character,
    kingdoms,
    runes,
    arkazia: await entry(kingdoms, 'Arkazia'),
    zandres: await entry(kingdoms, 'Zandres'),
    magnetism: await entry(runes, 'Magnetism Rune'),
    nanite: await entry(runes, 'Nanite Rune'),
    mara: await entry(character, 'Mara'),
  }
}

type World = Awaited<ReturnType<typeof world>>

const typesUrl = (w: World) => `/app/universes/${w.u}/types`

async function selectedText(select: Locator) {
  return select.evaluate((element: HTMLSelectElement) => element.selectedOptions[0]?.text ?? '')
}

/** The names a picker offers right now, once it has settled. */
async function offered(scope: Locator) {
  const list = scope.getByRole('listbox')
  await expect(scope.locator('.picker__none', { hasText: 'Looking' })).toHaveCount(0)
  const names = await list
    .getByRole('option')
    .evaluateAll((options) =>
      options.map((option) =>
        (option.getAttribute('data-testid') ?? '').replace('picker-option-', ''),
      ),
    )
  // The listing's own order is most recently changed first; what matters here is which entries, not their order.
  return names.sort()
}

async function addKingdomField(page: Page, w: World, allowed: string) {
  await page.goto(typesUrl(w))
  await page.getByTestId('fields-Character').click()
  const list = page.getByTestId('type-list')
  await list.getByLabel('Field name').fill('Kingdom')
  await list.getByLabel('Kind', { exact: true }).selectOption({ label: 'Link to an entity' })
  const allowedType = page.getByTestId('new-field-target-Character')
  // Any Lore type is a visible choice from the moment the kind is picked, never a blank.
  expect(await selectedText(allowedType)).toBe('Any Lore type')
  await allowedType.selectOption({ label: allowed })
  await page.getByTestId('add-field-Character').click()
  await expect(page.getByTestId('field-target-Kingdom')).toBeVisible()
}

function noSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.describe('a link field limited to one type', () => {
  test('Kingdom offers, keeps and filters by Kingdoms only, and the API holds the line', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)

    // ---------- The field, on the Types screen ----------
    await addKingdomField(page, w, 'Kingdoms')
    await page.reload()
    await page.getByTestId('fields-Character').click()
    expect(await selectedText(page.getByTestId('field-target-Kingdom'))).toBe('Kingdoms')

    // ---------- The entry's own picker ----------
    await page.goto(`/app/universes/${w.u}/lore/${w.mara}`)
    await page.getByTestId('edit-entity').click()
    const picker = page
      .locator('.picker')
      .filter({ has: page.getByText('Kingdom', { exact: true }) })
    await picker.getByTestId('picker-input').click()
    await expect.poll(() => offered(picker)).toEqual(['Arkazia', 'Zandres'])

    await picker.getByTestId('picker-input').fill('rune')
    await expect(picker.locator('.picker__none')).toHaveText('Nothing here by that name.')

    await picker.getByTestId('picker-input').fill('arka')
    await picker.getByTestId('picker-option-Arkazia').click()
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-fields')).toContainText('Arkazia')
    await page.reload()
    await expect(page.getByTestId('entry-fields')).toContainText('Arkazia')

    // ---------- The Lore filter ----------
    await page.goto(`/app/universes/${w.u}/lore?type=${w.character}`)
    await page.getByTestId('lore-add-field-filter').click()
    await page
      .getByTestId('lore-field-filter-menu')
      .getByRole('button', { name: 'Kingdom', exact: true })
      .click()
    const editor = page.getByTestId('lore-field-filter-editor')
    await editor.getByTestId('picker-input').click()
    await expect.poll(() => offered(editor)).toEqual(['Arkazia', 'Zandres'])
    await editor.getByTestId('picker-input').fill('arka')
    await editor.getByTestId('picker-option-Arkazia').click()
    await editor.getByTestId('lore-field-filter-apply').click()
    await expect(page.getByTestId('entity-card')).toHaveCount(1)
    await expect(page.getByTestId('entity-card')).toHaveAttribute('data-entity-name', 'Mara')

    // ---------- Straight at the API: a rune is refused, and so is another universe's entry ----------
    const types = (await (await page.request.get(`/api/universes/${w.u}/entity-types`)).json()) as {
      id: string
      fields: { id: string; name: string }[]
    }[]
    const kingdom = types
      .find((type) => type.id === w.character)!
      .fields.find((f) => f.name === 'Kingdom')!
    const mara = `/api/universes/${w.u}/entities/${w.mara}`
    const version = async () =>
      ((await (await page.request.get(mara)).json()) as { version: number }).version
    const save = async (referencedEntityId: string) =>
      page.request.put(mara, {
        data: {
          expectedVersion: await version(),
          entityTypeId: w.character,
          name: 'Mara',
          summary: null,
          canonStatus: 2,
          aliases: [],
          tags: [],
          fields: [
            {
              fieldDefinitionId: kingdom.id,
              text: null,
              number: null,
              boolean: null,
              date: null,
              optionIds: null,
              referencedEntityId,
            },
          ],
        },
      })
    expect((await save(w.nanite)).status()).toBe(400)

    const elsewhere = await world(page)
    const foreign = await save(elsewhere.arkazia)
    expect(foreign.status()).toBe(400)
    expect(await foreign.text()).not.toContain(elsewhere.arkazia)

    // ---------- Opened to any type, explicitly ----------
    await page.goto(typesUrl(w))
    await page.getByTestId('fields-Character').click()
    await page.getByTestId('field-target-Kingdom').selectOption({ label: 'Any Lore type' })
    await expect
      .poll(() => selectedText(page.getByTestId('field-target-Kingdom')))
      .toBe('Any Lore type')

    await page.goto(`/app/universes/${w.u}/lore/${w.mara}`)
    await page.getByTestId('edit-entity').click()
    await picker.getByTestId('picker-clear').click()
    await picker.getByTestId('picker-input').fill('rune')
    await expect.poll(() => offered(picker)).toEqual(['Magnetism Rune', 'Nanite Rune'])

    // ---------- Back to Kingdoms, then the type renamed: the field follows the type, not its name ----------
    await page.goto(typesUrl(w))
    await page.getByTestId('fields-Character').click()
    await page.getByTestId('field-target-Kingdom').selectOption({ label: 'Kingdoms' })
    await expect.poll(() => selectedText(page.getByTestId('field-target-Kingdom'))).toBe('Kingdoms')
    expect(
      (
        await page.request.put(`/api/universes/${w.u}/entity-types/${w.kingdoms}`, {
          data: {
            name: 'Realms',
            description: null,
            icon: null,
            accentColor: null,
            displayOrder: null,
          },
        })
      ).ok(),
    ).toBe(true)
    await page.reload()
    await page.getByTestId('fields-Character').click()
    expect(await selectedText(page.getByTestId('field-target-Kingdom'))).toBe('Realms')
  })

  test('a field limited to a type cannot be narrowed past the links it holds, and says why', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)
    await addKingdomField(page, w, 'Any Lore type')

    const types = (await (await page.request.get(`/api/universes/${w.u}/entity-types`)).json()) as {
      id: string
      fields: { id: string; name: string }[]
    }[]
    const kingdom = types
      .find((type) => type.id === w.character)!
      .fields.find((f) => f.name === 'Kingdom')!
    expect(
      (
        await page.request.put(`/api/universes/${w.u}/entities/${w.mara}`, {
          data: {
            expectedVersion: (
              (await (
                await page.request.get(`/api/universes/${w.u}/entities/${w.mara}`)
              ).json()) as {
                version: number
              }
            ).version,
            entityTypeId: w.character,
            name: 'Mara',
            summary: null,
            canonStatus: 2,
            aliases: [],
            tags: [],
            fields: [
              {
                fieldDefinitionId: kingdom.id,
                text: null,
                number: null,
                boolean: null,
                date: null,
                optionIds: null,
                referencedEntityId: w.nanite,
              },
            ],
          },
        })
      ).ok(),
    ).toBe(true)

    await page.reload()
    await page.getByTestId('fields-Character').click()
    await page.getByTestId('field-target-Kingdom').selectOption({ label: 'Kingdoms' })
    await expect(page.getByTestId('types-error')).toContainText(
      'Some entries link this field to entries of another type.',
    )
    await expect
      .poll(() => selectedText(page.getByTestId('field-target-Kingdom')))
      .toBe('Any Lore type')
  })

  for (const width of [390, 360]) {
    test(`at ${width}px the allowed type, the entry picker and the filter picker all fit`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ viewport: { width, height: 800 } })
      const page = await context.newPage()
      await account(page)
      const w = await world(page)
      await addKingdomField(page, w, 'Kingdoms')
      expect(await noSideways(page)).toBeLessThanOrEqual(0)

      await page.goto(`/app/universes/${w.u}/lore/${w.mara}`)
      await page.getByTestId('edit-entity').click()
      const picker = page
        .locator('.picker')
        .filter({ has: page.getByText('Kingdom', { exact: true }) })
      await picker.getByTestId('picker-input').fill('arka')
      await expect(picker.getByTestId('picker-option-Arkazia')).toBeVisible()
      expect(await noSideways(page)).toBeLessThanOrEqual(0)

      await page.goto(`/app/universes/${w.u}/lore?type=${w.character}`)
      // On a phone the filters fold behind Filters.
      await page.getByTestId('lore-filters-toggle').click()
      await page.getByTestId('lore-add-field-filter').click()
      await page
        .getByTestId('lore-field-filter-menu')
        .getByRole('button', { name: 'Kingdom', exact: true })
        .click()
      const editor = page.getByTestId('lore-field-filter-editor')
      await editor.getByTestId('picker-input').fill('zan')
      await expect(editor.getByTestId('picker-option-Zandres')).toBeVisible()
      expect(await noSideways(page)).toBeLessThanOrEqual(0)
      await context.close()
    })
  }
})
