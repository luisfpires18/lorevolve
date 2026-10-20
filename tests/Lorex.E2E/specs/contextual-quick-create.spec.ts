import { expect, test, type Browser, type Locator, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * Quick Create (Issue #25): a missing entry made from the link field or the relation that needs it, without leaving or
 * saving the form underneath. The new entry is real the moment it is created; the choice is not, until the form it sits in
 * is saved. Offered only to someone who may create Lore, and only in those two places.
 *
 * Each test registers its own account and builds its own universe through the API.
 */

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

const PASSWORD = makeTestPassword()

async function account(page: Page, prefix = 'quick') {
  const username = unique(prefix)
  const email = `${username}@example.test`
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: { username, email, password: PASSWORD },
      })
    ).ok(),
  ).toBe(true)
  expect(
    (
      await page.request.post('/api/auth/login', {
        data: { usernameOrEmail: username, password: PASSWORD },
      })
    ).ok(),
  ).toBe(true)
  return { username, email }
}

async function post<T = { id: string }>(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data })
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
  return (await response.json()) as T
}

interface TypeRow {
  id: string
  name: string
  fields: { id: string; name: string }[]
}

/**
 * Kingdoms (a required Motto, and a required Old seal that is archived), two rune types in a Runes group, and Character
 * with a Title and three link fields: Kingdom (Kingdoms only), Rune (the Runes group) and Ally (any type). Mara has a
 * summary and nothing linked; Vael is a Kingdom already there.
 */
async function world(page: Page) {
  const u = (await post(page, '/api/universes', { name: unique('Quickworld '), description: null }))
    .id
  const types = async () =>
    (await (await page.request.get(`/api/universes/${u}/entity-types`)).json()) as TypeRow[]
  const character = (await types()).find((type) => type.name === 'Character')!.id
  const type = async (name: string, groups?: unknown[]) =>
    (
      await post(page, `/api/universes/${u}/entity-types`, {
        name,
        description: null,
        icon: null,
        accentColor: null,
        displayOrder: null,
        ...(groups ? { groups } : {}),
      })
    ).id
  const field = async (typeId: string, name: string, kind: number, extra: object = {}) => {
    const updated = await post<TypeRow>(page, `/api/universes/${u}/entity-types/${typeId}/fields`, {
      name,
      kind,
      isRequired: false,
      displayOrder: null,
      defaultValue: null,
      options: null,
      ...extra,
    })
    return updated.fields.find((each) => each.name === name)!.id
  }

  const kingdoms = await type('Kingdoms')
  const motto = await field(kingdoms, 'Motto', 0, { isRequired: true })
  const seal = await field(kingdoms, 'Old seal', 0, { isRequired: true })
  expect(
    (
      await page.request.post(`/api/universes/${u}/entity-types/${kingdoms}/fields/${seal}/archive`)
    ).ok(),
  ).toBe(true)

  const elemental = await type('Elemental Runes', [{ name: 'Runes' }])
  const groups = (await (
    await page.request.get(`/api/universes/${u}/entity-type-groups`)
  ).json()) as { id: string; name: string }[]
  const runes = groups.find((group) => group.name === 'Runes')!.id
  const corrupted = await type('Corrupted Runes', [{ id: runes }])

  await field(character, 'Title', 0)
  await field(character, 'Kingdom', 7, { targetEntityTypeId: kingdoms })
  await field(character, 'Rune', 7, { targetGroupId: runes })
  await field(character, 'Ally', 7)
  // Exactly Elemental Runes, which requires nothing: a form that is complete as it opens.
  await field(character, 'Birth rune', 7, { targetEntityTypeId: elemental })

  const entry = async (typeId: string, name: string, extra: object = {}) =>
    (
      await post(page, `/api/universes/${u}/entities`, {
        entityTypeId: typeId,
        name,
        summary: null,
        canonStatus: 0,
        aliases: [],
        tags: [],
        fields: [],
        ...extra,
      })
    ).id
  const mara = await entry(character, 'Mara', { summary: 'Original summary.' })
  const lava = await entry(elemental, 'Lava Rune')
  await entry(kingdoms, 'Vael', {
    fields: [
      {
        fieldDefinitionId: motto,
        text: 'Salt and stone',
        number: null,
        boolean: null,
        date: null,
        optionIds: null,
        referencedEntityId: null,
      },
    ],
  })
  return { u, character, kingdoms, elemental, corrupted, mara, lava, types }
}

/** Entries in the universe under exactly this name, as the API has them. */
async function named(page: Page, universeId: string, name: string) {
  const response = await page.request.get(
    `/api/universes/${universeId}/entities?search=${encodeURIComponent(name)}&pageSize=50`,
  )
  const body = (await response.json()) as {
    items: { id: string; name: string; canonStatus: number }[]
  }
  return body.items.filter((item) => item.name === name)
}

async function stored(page: Page, universeId: string, entityId: string) {
  return (await (
    await page.request.get(`/api/universes/${universeId}/entities/${entityId}`)
  ).json()) as {
    summary: string | null
    fields: { fieldDefinitionId: string; referencedEntityId: string | null }[]
  }
}

function picker(scope: Page | Locator, label: string) {
  const page = 'page' in scope ? scope.page() : scope
  return scope.locator('.picker').filter({ has: page.getByText(label, { exact: true }) })
}

function dialog(page: Page) {
  return page.getByTestId('quick-create-dialog')
}

async function editMara(page: Page, w: { u: string; mara: string }) {
  await page.goto(`/app/universes/${w.u}/lore/${w.mara}`)
  await page.getByTestId('edit-entity').click()
  await expect(page.getByTestId('entry-form')).toBeVisible()
}

function sideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
}

test.describe('Quick Create', () => {
  test('an exact-type link field creates and selects the entry, and the unsaved entry keeps every change', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)
    await editMara(page, w)

    // Several unsaved changes first.
    await page.getByLabel('Summary').fill('Heir of the river crown.')
    await page.getByLabel('Title').fill('Lord of the ford')

    const kingdom = picker(page, 'Kingdom')
    await kingdom.getByTestId('picker-input').fill('Erandor')
    await expect(kingdom.getByTestId('picker-create')).toHaveText(/Create “Erandor”/)
    await kingdom.getByTestId('picker-create').click()

    // Kingdoms only, so the type is taken; its active required field is asked for and the archived one is not.
    const form = dialog(page)
    await expect(form).toBeVisible()
    await expect(form.getByTestId('quick-create-name')).toHaveValue('Erandor')
    await expect(form.getByTestId('quick-create-type')).toContainText('Kingdoms')
    await expect(form.getByTestId('quick-create-type-select')).toHaveCount(0)
    await expect(form.getByLabel('Motto (required)')).toBeVisible()
    await expect(form.getByText('Old seal')).toHaveCount(0)

    // The server's own check: a name alone does not get past a required field.
    await form.getByTestId('quick-create-submit').click()
    await expect(form.getByTestId('quick-create-error')).toBeVisible()
    await expect(form.getByTestId('quick-create-name')).toHaveValue('Erandor')
    expect(await named(page, w.u, 'Erandor')).toHaveLength(0)

    // A dropped connection keeps the form as it was, and the retry goes through once.
    await form.getByLabel('Motto (required)').fill('By the river')
    await page.route(
      '**/api/universes/*/entities',
      (route) => (route.request().method() === 'POST' ? route.abort() : route.fallback()),
      { times: 1 },
    )
    await form.getByTestId('quick-create-submit').click()
    await expect(form.getByTestId('quick-create-error')).toContainText('connection')
    await expect(form.getByLabel('Motto (required)')).toHaveValue('By the river')
    expect(await named(page, w.u, 'Erandor')).toHaveLength(0)
    await form.getByTestId('quick-create-submit').click()
    await expect(form).toHaveCount(0)

    // Chosen, said so, and the focus is on the choice.
    await expect(kingdom.locator('.picker__chosenname')).toHaveText('Erandor')
    await expect(kingdom.getByTestId('picker-clear')).toBeFocused()
    await expect(kingdom.getByTestId('picker-created')).toContainText(
      'Erandor was created. Save this entry to keep the link.',
    )
    const erandor = await named(page, w.u, 'Erandor')
    expect(erandor).toHaveLength(1)
    expect(erandor[0].canonStatus).toBe(0)
    const open = kingdom.getByTestId('picker-created-open')
    await expect(open).toHaveAttribute('target', '_blank')
    await expect(open).toHaveAttribute('href', `/app/universes/${w.u}/lore/${erandor[0].id}`)

    // The entry underneath is still open, unsaved, with every change in place.
    await expect(page.getByTestId('save-entity')).toBeVisible()
    await expect(page.getByLabel('Summary')).toHaveValue('Heir of the river crown.')
    await expect(page.getByLabel('Title')).toHaveValue('Lord of the ford')
    const before = await stored(page, w.u, w.mara)
    expect(before.summary).toBe('Original summary.')
    expect(before.fields.some((value) => value.referencedEntityId === erandor[0].id)).toBe(false)

    // Cancelling the entry lets its changes go and keeps the new Kingdom.
    page.once('dialog', (question) => void question.accept())
    await page.getByTestId('cancel-entity').click()
    await expect(page.getByTestId('entry-summary')).toHaveText('Original summary.')
    expect(await named(page, w.u, 'Erandor')).toHaveLength(1)
    const after = await stored(page, w.u, w.mara)
    expect(after.fields.some((value) => value.referencedEntityId === erandor[0].id)).toBe(false)
  })

  test('a group field offers its member types, any-type offers every type, and duplicates are advice', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)
    await editMara(page, w)

    // ---------- Group: only Runes' members, and the author chooses ----------
    const rune = picker(page, 'Rune')
    await rune.getByTestId('picker-input').fill('Ember')
    await rune.getByTestId('picker-create').click()
    const form = dialog(page)
    const typeSelect = form.getByTestId('quick-create-type-select')
    const offered = async () =>
      (await typeSelect.locator('option').allTextContents()).slice(1).sort()
    await expect(typeSelect).toBeVisible()
    expect(await offered()).toEqual(['Corrupted Runes', 'Elemental Runes'])
    await form.getByTestId('quick-create-submit').click()
    await expect(form.getByText('Choose what kind of entry this is.')).toBeVisible()
    expect(await named(page, w.u, 'Ember')).toHaveLength(0)
    await typeSelect.selectOption({ label: 'Elemental Runes' })
    await form.getByTestId('quick-create-submit').click()
    await expect(form).toHaveCount(0)
    await expect(rune.locator('.picker__chosenname')).toHaveText('Ember')

    // ---------- Any type, by keyboard: an existing Vael is offered first and can be taken instead ----------
    const ally = picker(page, 'Ally')
    const input = ally.getByTestId('picker-input')
    await input.focus()
    await page.keyboard.type('Vael')
    await expect(ally.getByTestId('picker-option-Vael')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await expect(ally.getByTestId('picker-create')).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Enter')
    await expect(form).toBeVisible()
    await expect(form.getByTestId('quick-create-name')).toBeFocused()
    const similar = form.getByTestId('quick-create-similar')
    await expect(similar).toContainText('Vael')
    await expect(similar).toContainText('Kingdoms')
    await similar.getByTestId('quick-create-use-Vael').click()
    await expect(form).toHaveCount(0)
    await expect(ally.locator('.picker__chosenname')).toHaveText('Vael')
    await expect(ally.getByTestId('picker-created')).toBeEmpty()
    expect(await named(page, w.u, 'Vael')).toHaveLength(1)

    // ---------- Or a second Vael on purpose, every type offered, pressed twice, made once ----------
    await ally.getByTestId('picker-clear').click()
    await ally.getByTestId('picker-input').fill('Vael')
    await ally.getByTestId('picker-create').click()
    const all = (await w.types()).map((type) => type.name).sort()
    await expect(typeSelect).toBeVisible()
    expect(await offered()).toEqual(all)
    await typeSelect.selectOption({ label: 'Kingdoms' })
    await form.getByLabel('Motto (required)').fill('The other Vael')
    await form.getByTestId('quick-create-submit').dblclick()
    await expect(form).toHaveCount(0)
    expect(await named(page, w.u, 'Vael')).toHaveLength(2)

    // Saving the entry keeps both links.
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-fields')).toContainText('Ember')
    await expect(page.getByTestId('entry-fields')).toContainText('Vael')
  })

  test('Escape or Cancel makes nothing and gives the search its focus back', async ({ page }) => {
    await account(page)
    const w = await world(page)
    await editMara(page, w)

    const kingdom = picker(page, 'Kingdom')
    await kingdom.getByTestId('picker-input').fill('Nowhere')
    await kingdom.getByTestId('picker-create').click()
    // Once the one type is taken: taking it is not a change, so Escape asks nothing.
    await expect(dialog(page).getByTestId('quick-create-type')).toContainText('Kingdoms')
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    await expect(kingdom.getByTestId('picker-input')).toBeFocused()
    await expect(kingdom.getByTestId('picker-input')).toHaveValue('Nowhere')

    // Something typed in the form: Cancel asks first.
    await kingdom.getByTestId('picker-input').press('ArrowDown')
    await kingdom.getByTestId('picker-create').click()
    await dialog(page).getByLabel('Motto (required)').fill('Lost')
    page.once('dialog', (question) => void question.accept())
    await dialog(page).getByTestId('quick-create-cancel').click()
    await expect(dialog(page)).toHaveCount(0)
    expect(await named(page, w.u, 'Nowhere')).toHaveLength(0)
    await expect(page.getByTestId('save-entity')).toBeVisible()
  })

  test('a relation target is created and chosen, and the relation waits for its own save', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)
    await post(page, `/api/universes/${w.u}/relationship-types`, {
      name: 'Sworn to',
      inverseName: null,
      isSymmetric: true,
      description: null,
      displayOrder: null,
    })
    const relations = async () =>
      (await (
        await page.request.get(`/api/universes/${w.u}/entities/${w.mara}/relationships`)
      ).json()) as { relatedEntityName: string }[]

    await page.goto(`/app/universes/${w.u}/lore/${w.mara}/relations`)
    await page.getByTestId('add-relationship').click()
    const relation = page.getByTestId('relationship-form')
    await relation.getByTestId('relation-notes').fill('Met at the ford.')
    await relation.getByTestId('relation-start').fill('2020-01-02')
    await relation.getByTestId('relation-canon-canon').click()

    const target = picker(relation, 'Connected to')
    await target.getByTestId('picker-input').fill('Kaelen')
    await target.getByTestId('picker-create').click()
    await dialog(page).getByTestId('quick-create-type-select').selectOption({ label: 'Character' })
    await dialog(page).getByTestId('quick-create-submit').click()
    await expect(dialog(page)).toHaveCount(0)

    await expect(target.locator('.picker__chosenname')).toHaveText('Kaelen')
    await expect(target.getByTestId('picker-created')).toContainText(
      'Kaelen was created. Save the relation to connect it.',
    )
    await expect(relation.getByTestId('relationship-preview')).toContainText('Kaelen')
    await expect(relation.getByTestId('relation-notes')).toHaveValue('Met at the ford.')
    await expect(relation.getByTestId('relation-start')).toHaveValue('2020-01-02')
    await expect(relation.getByTestId('relation-canon-canon')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(await relations()).toHaveLength(0)

    await relation.getByTestId('save-relationship').click()
    await expect(page.getByTestId('relationship-list')).toContainText('Kaelen')
    expect((await relations()).map((each) => each.relatedEntityName)).toEqual(['Kaelen'])

    // A relation cancelled after its target was made: the entry stays, no relation is saved.
    await page.getByTestId('add-relationship').click()
    const second = picker(page.getByTestId('relationship-form'), 'Connected to')
    await second.getByTestId('picker-input').fill('Orin')
    await second.getByTestId('picker-create').click()
    await dialog(page).getByTestId('quick-create-type-select').selectOption({ label: 'Character' })
    await dialog(page).getByTestId('quick-create-submit').click()
    await expect(second.locator('.picker__chosenname')).toHaveText('Orin')
    page.once('dialog', (question) => void question.accept())
    await page.getByTestId('relationship-form').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByTestId('relationship-form')).toHaveCount(0)
    expect(await named(page, w.u, 'Orin')).toHaveLength(1)
    expect((await relations()).map((each) => each.relatedEntityName)).toEqual(['Kaelen'])
  })

  test('someone who may only suggest is never offered Create', async ({ page, browser }) => {
    await account(page, 'quickowner')
    const w = await world(page)
    const reviewer = await member(browser, page, w.u, 2)

    await reviewer.goto(`/app/universes/${w.u}/lore/${w.mara}`)
    await reviewer.getByTestId('suggest-entity').click()
    const kingdom = picker(reviewer, 'Kingdom')
    await kingdom.getByTestId('picker-input').fill('Erandor')
    await expect(kingdom.getByText('Nothing here by that name.')).toBeVisible()
    await expect(kingdom.getByTestId('picker-create')).toHaveCount(0)

    // And the API refuses the create a hand-made request would try.
    const refused = await reviewer.request.post(`/api/universes/${w.u}/entities`, {
      data: {
        entityTypeId: w.kingdoms,
        name: 'Erandor',
        summary: null,
        canonStatus: 0,
        aliases: [],
        tags: [],
        fields: [],
      },
    })
    expect(refused.status()).toBe(403)
    await reviewer.context().close()
  })

  test('the form fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await account(page)
    const w = await world(page)
    await editMara(page, w)

    const kingdom = picker(page, 'Kingdom')
    await kingdom.getByTestId('picker-input').fill('An unusually long kingdom name for a phone')
    await kingdom.getByTestId('picker-create').click()
    const form = dialog(page)
    await expect(form.getByTestId('quick-create-submit')).toBeInViewport()
    await expect(form.getByTestId('quick-create-cancel')).toBeInViewport()
    expect(await sideways(page)).toBe(0)
    await form.getByLabel('Motto (required)').fill('Short')
    await form.getByTestId('quick-create-submit').click()
    await expect(form).toHaveCount(0)
    await expect(kingdom.locator('.picker__chosenname')).toHaveText(
      'An unusually long kingdom name for a phone',
    )
    expect(await sideways(page)).toBe(0)
  })
})

/** A second person in their own browser, made a member of the universe with `role` through an accepted invitation. */
async function member(browser: Browser, owner: Page, universeId: string, role: number) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const { email } = await account(page, 'quickmember')
  const invitation = await post(owner, `/api/universes/${universeId}/invitations`, { email, role })
  expect((await page.request.post(`/api/invitations/${invitation.id}/accept`)).ok()).toBe(true)
  return page
}

/**
 * Holds every create the page sends until `release`, then lets it through - or, with `fail`, drops it. `sent` counts the
 * creates that left the page, so a second one cannot hide.
 */
async function holdCreates(page: Page, { fail = false } = {}) {
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  const sent: string[] = []
  await page.route('**/api/universes/*/entities', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    sent.push(route.request().postData() ?? '')
    await gate
    if (fail) await route.abort()
    else await route.fallback()
  })
  return { release, sent }
}

/** A press on the dialog's backdrop: the dialog covers the screen, its panel the right-hand side. */
async function pressBackdrop(page: Page) {
  await page.mouse.click(12, 300)
}

test.describe('Quick Create while a create is on its way', () => {
  test('nothing closes or changes the form until the answer, which chooses exactly the entry made', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)
    await editMara(page, w)
    await page.getByLabel('Summary').fill('Heir of the river crown.')
    await page.getByLabel('Title').fill('Lord of the ford')

    // A pristine exact-type form, with a similar entry on offer.
    const field = picker(page, 'Birth rune')
    await field.getByTestId('picker-input').fill('Lava Rune')
    await field.getByTestId('picker-create').click()
    const form = dialog(page)
    await expect(form.getByTestId('quick-create-type')).toContainText('Elemental Runes')
    const useLava = form.getByTestId('quick-create-use-Lava Rune')
    await expect(useLava).toBeEnabled()

    const held = await holdCreates(page)
    await form.getByTestId('quick-create-submit').click()

    // Pending, and said so.
    await expect(form.getByTestId('quick-create-pending')).toContainText('be closed until')
    await expect(form.locator('form')).toHaveAttribute('aria-busy', 'true')
    await expect(form.getByTestId('quick-create-submit')).toBeDisabled()
    await expect(form.getByTestId('quick-create-submit')).toHaveText('Creating')
    await expect(form.getByTestId('quick-create-cancel')).toBeDisabled()
    await expect(form.getByTestId('quick-create-name')).toBeDisabled()
    await expect(useLava).toBeDisabled()

    // Escape, the backdrop, Cancel, Use this one and Create again: none of them does anything.
    await page.keyboard.press('Escape')
    await pressBackdrop(page)
    await form.getByTestId('quick-create-cancel').click({ force: true })
    await useLava.click({ force: true })
    await form.getByTestId('quick-create-submit').click({ force: true })
    await expect(form).toBeVisible()
    await expect(field.locator('.picker__chosenname')).toHaveCount(0)
    expect(held.sent).toHaveLength(1)

    held.release()
    await expect(form).toHaveCount(0)

    // The second Lava Rune, by the server's answer - not the one that was already here.
    const lavas = await named(page, w.u, 'Lava Rune')
    expect(lavas).toHaveLength(2)
    const made = lavas.find((each) => each.id !== w.lava)!
    await expect(field.locator('.picker__chosenname')).toHaveText('Lava Rune')
    await expect(field.getByTestId('picker-created-open')).toHaveAttribute(
      'href',
      `/app/universes/${w.u}/lore/${made.id}`,
    )
    expect(held.sent).toHaveLength(1)

    // The entry underneath: its edits kept, still unsaved, then saved with only the one new link.
    await expect(page.getByLabel('Summary')).toHaveValue('Heir of the river crown.')
    await expect(page.getByLabel('Title')).toHaveValue('Lord of the ford')
    await expect(page.getByTestId('save-entity')).toBeVisible()
    expect((await stored(page, w.u, w.mara)).summary).toBe('Original summary.')
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-fields')).toContainText('Lava Rune')
    const saved = await stored(page, w.u, w.mara)
    expect(saved.summary).toBe('Heir of the river crown.')
    const links = saved.fields
      .map((value) => value.referencedEntityId)
      .filter((id): id is string => id !== null)
    expect(links).toEqual([made.id])
  })

  test('a failed create gives the form back, to edit, retry or cancel', async ({ page }) => {
    await account(page)
    const w = await world(page)
    await editMara(page, w)
    await page.getByLabel('Summary').fill('Heir of the river crown.')

    const field = picker(page, 'Birth rune')
    await field.getByTestId('picker-input').fill('Ash Rune')
    await field.getByTestId('picker-create').click()
    const form = dialog(page)
    await expect(form.getByTestId('quick-create-type')).toContainText('Elemental Runes')

    const held = await holdCreates(page, { fail: true })
    await form.getByTestId('quick-create-submit').click()
    await expect(form.getByTestId('quick-create-cancel')).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(form).toBeVisible()
    held.release()

    // The failure is said, the focus is on it, and everything is editable and closable again.
    const error = form.getByTestId('quick-create-error')
    await expect(error).toContainText('connection')
    await expect(error).toBeFocused()
    await expect(form.getByTestId('quick-create-pending')).toBeEmpty()
    await expect(form.getByTestId('quick-create-name')).toBeEnabled()
    await expect(form.getByTestId('quick-create-submit')).toBeEnabled()
    await expect(form.getByTestId('quick-create-cancel')).toBeEnabled()
    expect(held.sent).toHaveLength(1)
    expect(await named(page, w.u, 'Ash Rune')).toHaveLength(0)

    // Unchanged since it opened, so Escape closes it at once.
    await page.keyboard.press('Escape')
    await expect(form).toHaveCount(0)
    await expect(field.getByTestId('picker-input')).toBeFocused()
    await expect(page.getByLabel('Summary')).toHaveValue('Heir of the river crown.')
    expect(await named(page, w.u, 'Ash Rune')).toHaveLength(0)
  })

  test('a relation target obeys the same rules, and the relation still waits for its own save', async ({
    page,
  }) => {
    await account(page)
    const w = await world(page)
    await post(page, `/api/universes/${w.u}/relationship-types`, {
      name: 'Sworn to',
      inverseName: null,
      isSymmetric: true,
      description: null,
      displayOrder: null,
    })
    await page.goto(`/app/universes/${w.u}/lore/${w.mara}/relations`)
    await page.getByTestId('add-relationship').click()
    const relation = page.getByTestId('relationship-form')
    await relation.getByTestId('relation-notes').fill('Met at the ford.')

    const target = picker(relation, 'Connected to')
    await target.getByTestId('picker-input').fill('Kaelen')
    await target.getByTestId('picker-create').click()
    const form = dialog(page)
    await form.getByTestId('quick-create-type-select').selectOption({ label: 'Character' })

    const held = await holdCreates(page)
    await form.getByTestId('quick-create-submit').click()
    await expect(form.getByTestId('quick-create-type-select')).toBeDisabled()
    await page.keyboard.press('Escape')
    await pressBackdrop(page)
    await form.getByTestId('quick-create-cancel').click({ force: true })
    await expect(form).toBeVisible()
    expect(held.sent).toHaveLength(1)
    held.release()

    await expect(form).toHaveCount(0)
    await expect(target.locator('.picker__chosenname')).toHaveText('Kaelen')
    await expect(relation.getByTestId('relation-notes')).toHaveValue('Met at the ford.')
    expect(await named(page, w.u, 'Kaelen')).toHaveLength(1)
    const relations = (await (
      await page.request.get(`/api/universes/${w.u}/entities/${w.mara}/relationships`)
    ).json()) as unknown[]
    expect(relations).toHaveLength(0)
  })
})
