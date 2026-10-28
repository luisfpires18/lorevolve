import { expect, test, type Page } from '@playwright/test'
import { clickSignOut } from './support/account'
import { answerConfirms } from './support/confirm'

/**
 * Relationships, end to end. Each test registers its own account and builds its own
 * universe, so nothing depends on data another test left behind.
 *
 * The invariant under test throughout: one row is stored, and both entries read it
 * correctly. Nowhere in the UI is an author shown which end was stored first.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('loremaster')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return username
}

/** Creates a universe through the UI and returns the id it was given. */
async function newUniverse(page: Page, name: string) {
  await page.goto('/app')
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(name)
  // The starter lore types this spec builds on: a new universe starts empty otherwise.
  await page.getByTestId('universe-starter-types').check()
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

interface KindInput {
  name: string
  inverseName?: string
  symmetric?: boolean
}

async function addRelationKind(page: Page, universeId: string, kind: KindInput) {
  await page.goto(`/app/universes/${universeId}/types?tab=relations`)
  await page.getByTestId('add-relationship-type').click()
  await page.getByLabel('Reads as', { exact: true }).fill(kind.name)

  if (kind.symmetric) {
    await page.getByTestId('reltype-symmetric').check()
  } else {
    await page.getByLabel('Reads as, from the other side').fill(kind.inverseName!)
  }

  await page.getByTestId('save-relationship-type').click()
  await expect(page.locator(`[data-reltype-name="${kind.name}"]`)).toBeVisible()
}

/** Writes a bare entry and returns its id. */
async function newEntry(page: Page, universeId: string, name: string) {
  await page.goto(`/app/universes/${universeId}/lore`)
  await page.getByTestId('new-entity').click()
  await page.waitForURL(/\/lore\/new$/)
  await page.getByLabel('Name').fill(name)
  await page.getByTestId('save-entity').click()
  await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

/**
 * An entry's Relations view, which is where every relation in this file is read and written. It is an
 * address of its own, so these tests go straight to it rather than opening the entry and clicking.
 */
function entryUrl(universeId: string, entityId: string) {
  return `/app/universes/${universeId}/lore/${entityId}/relations`
}

/** One row in the Relations list, found by the wording it carries on this entry. */
function relation(page: Page, label: string) {
  return page.locator(`[data-relation-label="${label}"]`)
}

/** Chooses the other end through the search-as-you-type picker. */
async function pickRelated(page: Page, name: string) {
  await page.getByTestId('picker-input').click()
  await page.getByTestId('picker-input').fill(name)
  await page.getByTestId(`picker-option-${name}`).click()
}

test.describe('relationships', () => {
  test('a directional relation reads forward from its source and inverse from its target, and an edit made from the inverse side keeps the stored direction', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Gondor Reach '))
    await addRelationKind(page, universeId, { name: 'rules', inverseName: 'ruled by' })

    const aragorn = await newEntry(page, universeId, 'Aragorn')
    const gondor = await newEntry(page, universeId, 'Gondor')

    // Author the link from Aragorn. The author names the reading, never a direction.
    await page.goto(entryUrl(universeId, aragorn))
    await expect(page.getByTestId('relations-empty')).toBeVisible()
    await page.getByTestId('add-relationship').click()
    await page.getByLabel('Reading').selectOption({ label: 'rules' })
    await pickRelated(page, 'Gondor')
    await expect(page.getByTestId('relationship-preview')).toContainText('Aragorn rules Gondor')
    await page.getByTestId('save-relationship').click()

    // The source reads it forward.
    await expect(relation(page, 'rules')).toContainText('Gondor')
    await expect(relation(page, 'ruled by')).toHaveCount(0)

    // The target reads the same row backwards, and no second row was written.
    await page.goto(entryUrl(universeId, gondor))
    await expect(relation(page, 'ruled by')).toContainText('Aragorn')
    await expect(relation(page, 'rules')).toHaveCount(0)
    await expect(page.getByTestId('relationship-list').locator('> li')).toHaveCount(1)

    // Edit from the inverse side: status, when it holds and notes all set from here. A period is on the universe's own
    // chronology - plain years here, since this universe names no date periods (Issue #18).
    await page.getByTestId('relationship-actions-Aragorn').click()
    await page.getByTestId('edit-relationship-Aragorn').click()
    await expect(page.getByTestId('relationship-preview')).toContainText('Gondor ruled by Aragorn')
    await page.getByTestId('relation-canon-canon').click()
    await page.getByTestId('relation-period-add').click()
    const period = page.getByTestId('relation-period-0')
    await period.locator('input[id$="-start-year"]').fill('3019')
    await period.locator('input[id$="-end-year"]').fill('3021')
    await page.getByTestId('relation-notes').fill('Crowned after the war.')
    await page.getByTestId('save-relationship').click()

    await expect(relation(page, 'ruled by')).toContainText('Crowned after the war.')
    await expect(relation(page, 'ruled by')).toContainText('Canon')

    // Back on the source, an edit made from the other end has not flipped the row.
    await page.goto(entryUrl(universeId, aragorn))
    const forward = relation(page, 'rules')
    await expect(forward).toContainText('Gondor')
    await expect(forward).toContainText('Crowned after the war.')
    await expect(forward).toContainText('Canon')
    await expect(forward.getByTestId('relation-periods-text')).toHaveText('3019 – 3021')

    // The period comes back into the form exactly as it was typed, whichever end the
    // author is standing on.
    await page.getByTestId('relationship-actions-Gondor').click()
    await page.getByTestId('edit-relationship-Gondor').click()
    const reread = page.getByTestId('relation-period-0')
    await expect(reread.locator('input[id$="-start-year"]')).toHaveValue('3019')
    await expect(reread.locator('input[id$="-end-year"]')).toHaveValue('3021')
    await expect(page.getByTestId('relation-notes')).toHaveValue('Crowned after the war.')
    await page.getByRole('button', { name: 'Cancel' }).click()

    // What is stored is still Aragorn -> Gondor, read forward from Aragorn.
    const stored = await page.request.get(
      `/api/universes/${universeId}/entities/${aragorn}/relationships`,
    )
    expect(stored.status()).toBe(200)
    const views = await stored.json()
    expect(views).toHaveLength(1)
    expect(views[0].sourceEntityId).toBe(aragorn)
    expect(views[0].targetEntityId).toBe(gondor)
    expect(views[0].perspective).toBe(0)
    expect(views[0].label).toBe('rules')
    expect(views[0].notes).toBe('Crowned after the war.')
    expect(views[0].startDate).toBeNull()
    expect(views[0].periods).toHaveLength(1)
    expect(views[0].periods[0].start.year).toBe(3019)
    expect(views[0].periods[0].end.year).toBe(3021)

    // Removing it from the target clears it from both entries: one row, one delete.
    await answerConfirms(page, () => true, [])
    await page.goto(entryUrl(universeId, gondor))
    await page.getByTestId('relationship-actions-Aragorn').click()
    await page.getByTestId('delete-relationship-Aragorn').click()
    await expect(page.getByTestId('relations-empty')).toBeVisible()

    await page.goto(entryUrl(universeId, aragorn))
    await expect(page.getByTestId('relations-empty')).toBeVisible()
  })

  test('a symmetric relation reads the same from both sides, and editing it from either side keeps that single reading', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Riddermark '))
    await addRelationKind(page, universeId, { name: 'allied with', symmetric: true })

    const rohan = await newEntry(page, universeId, 'Rohan')
    const gondor = await newEntry(page, universeId, 'Gondor')

    await page.goto(entryUrl(universeId, rohan))
    await page.getByTestId('add-relationship').click()

    // A symmetric kind has one reading only, so the picker offers one option.
    await expect(page.getByTestId('relationship-reading').locator('option')).toHaveCount(1)
    await pickRelated(page, 'Gondor')
    await page.getByTestId('save-relationship').click()
    await expect(relation(page, 'allied with')).toContainText('Gondor')

    // The other end says the same thing, in the same words.
    await page.goto(entryUrl(universeId, gondor))
    await expect(relation(page, 'allied with')).toContainText('Rohan')

    // Editing from the end that was stored as the target must not fall back to some
    // other kind, and must not write a second row.
    await page.getByTestId('relationship-actions-Rohan').click()
    await page.getByTestId('edit-relationship-Rohan').click()
    await expect(page.getByTestId('relationship-preview')).toContainText('Gondor allied with Rohan')
    await page.getByTestId('relation-notes').fill('Sworn at Cormallen.')
    await page.getByTestId('save-relationship').click()

    await expect(relation(page, 'allied with')).toContainText('Sworn at Cormallen.')
    await expect(page.getByTestId('relationship-list').locator('> li')).toHaveCount(1)

    await page.goto(entryUrl(universeId, rohan))
    await expect(relation(page, 'allied with')).toContainText('Gondor')
    await expect(relation(page, 'allied with')).toContainText('Sworn at Cormallen.')
    await expect(page.getByTestId('relationship-list').locator('> li')).toHaveCount(1)
  })

  test('relation kinds can be created, reworded, and deleted only once nothing uses them', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Arnor '))
    await addRelationKind(page, universeId, { name: 'rules', inverseName: 'ruled by' })

    const row = page.locator('[data-reltype-name="rules"]')
    await expect(row).toContainText('rules one way, ruled by the other')

    // Reword the reverse reading in place.
    await page.getByTestId('edit-reltype-rules').click()
    await page.getByLabel('Reads as, from the other side').fill('sworn to')
    await page.getByTestId('save-relationship-type').click()
    await expect(row).toContainText('rules one way, sworn to the other')

    // Put the kind to work.
    const aragorn = await newEntry(page, universeId, 'Aragorn')
    await newEntry(page, universeId, 'Gondor')
    await page.goto(entryUrl(universeId, aragorn))
    await page.getByTestId('add-relationship').click()
    await page.getByLabel('Reading').selectOption({ label: 'rules' })
    await pickRelated(page, 'Gondor')
    await page.getByTestId('save-relationship').click()
    await expect(relation(page, 'rules')).toContainText('Gondor')

    // A kind in use says so, and offers no way to delete it.
    await page.goto(`/app/universes/${universeId}/types?tab=relations`)
    await expect(row).toContainText('1 relation')
    await expect(page.getByTestId('delete-reltype-rules')).toHaveCount(0)

    // The API refuses too, and the refusal counts in English.
    const types = await (
      await page.request.get(`/api/universes/${universeId}/relationship-types`)
    ).json()
    const typeId = types.find((type: { name: string }) => type.name === 'rules').id

    const refused = await page.request.delete(
      `/api/universes/${universeId}/relationship-types/${typeId}`,
    )
    expect(refused.status()).toBe(409)
    expect(await refused.text()).toContain('1 relationship still uses this type. Delete it first.')

    // Clear the link and the kind becomes deletable.
    await answerConfirms(page, () => true, [])
    await page.goto(entryUrl(universeId, aragorn))
    await page.getByTestId('relationship-actions-Gondor').click()
    await page.getByTestId('delete-relationship-Gondor').click()
    await expect(page.getByTestId('relations-empty')).toBeVisible()

    // Removed, the link waits in the Trash and still uses its kind; erased from there, it frees it.
    await page.goto(`/app/universes/${universeId}/types?tab=relations`)
    await expect(row).toContainText('1 relation')
    await page.goto(`/app/universes/${universeId}/trash`)
    await page.getByTestId('erase-Aragorn rules Gondor').click()
    await page.getByTestId('trash-erase-confirm').getByTestId('trash-erase-delete').click()
    await expect(page.getByTestId('trash-row-Aragorn rules Gondor')).toHaveCount(0)

    await page.goto(`/app/universes/${universeId}/types?tab=relations`)
    await expect(row).toContainText('0 relations')
    await page.getByTestId('delete-reltype-rules').click()
    await expect(row).toHaveCount(0)
    await expect(page.getByTestId('reltypes-empty')).toBeVisible()
  })

  test('an end before its start is refused in the panel, and the draft survives the refusal', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Backwards '))
    await addRelationKind(page, universeId, { name: 'rules', inverseName: 'ruled by' })

    const aragorn = await newEntry(page, universeId, 'Aragorn')
    await newEntry(page, universeId, 'Gondor')

    await page.goto(entryUrl(universeId, aragorn))
    await page.getByTestId('add-relationship').click()
    await page.getByLabel('Reading').selectOption({ label: 'rules' })
    await pickRelated(page, 'Gondor')
    await page.getByTestId('relation-period-add').click()
    const period = page.getByTestId('relation-period-0')
    await period.locator('input[id$="-start-year"]').fill('3021')
    await period.locator('input[id$="-end-year"]').fill('3019')
    await page.getByTestId('relation-notes').fill('Kept through the refusal.')
    await page.getByTestId('save-relationship').click()

    await expect(page.getByTestId('relationship-error')).toBeVisible()
    await expect(period.locator('input[id$="-end-year"]')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('[data-relation-label]')).toHaveCount(0)

    // Nothing the author typed is thrown away by the refusal.
    await expect(page.getByTestId('relation-notes')).toHaveValue('Kept through the refusal.')
    await expect(period.locator('input[id$="-start-year"]')).toHaveValue('3021')
    await expect(page.getByTestId('relationship-preview')).toContainText('Aragorn rules Gondor')

    // Correcting only the offending field is enough to save.
    await period.locator('input[id$="-end-year"]').fill('3022')
    await page.getByTestId('save-relationship').click()
    await expect(relation(page, 'rules')).toContainText('Gondor')
    await expect(relation(page, 'rules')).toContainText('Kept through the refusal.')
  })

  test('relation notes are shown as text, never as markup', async ({ page }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Deep Cover '))
    await addRelationKind(page, universeId, { name: 'rules', inverseName: 'ruled by' })

    const aragorn = await newEntry(page, universeId, 'Aragorn')
    await newEntry(page, universeId, 'Gondor')

    const hostile = '<img src=x onerror="window.__lorevolveXss = true">bargain struck'

    await page.goto(entryUrl(universeId, aragorn))
    await page.getByTestId('add-relationship').click()
    await page.getByLabel('Reading').selectOption({ label: 'rules' })
    await pickRelated(page, 'Gondor')
    await page.getByTestId('relation-notes').fill(hostile)
    await page.getByTestId('save-relationship').click()

    const notes = relation(page, 'rules').locator('.relation__notes')
    await expect(notes).toHaveText(hostile)
    await expect(notes.locator('img')).toHaveCount(0)

    await page.reload()
    await expect(relation(page, 'rules').locator('.relation__notes')).toHaveText(hostile)
    expect(
      await page.evaluate(() => (window as { __lorevolveXss?: boolean }).__lorevolveXss),
    ).toBeUndefined()
  })

  test('nothing about a relation reaches across a universe or an owner boundary', async ({
    page,
  }) => {
    await signUp(page)

    // A first universe with a link in it.
    const first = await newUniverse(page, unique('Private Reach '))
    await addRelationKind(page, first, { name: 'rules', inverseName: 'ruled by' })
    const aragorn = await newEntry(page, first, 'Aragorn')
    const gondor = await newEntry(page, first, 'Gondor')

    await page.goto(entryUrl(first, aragorn))
    await page.getByTestId('add-relationship').click()
    await page.getByLabel('Reading').selectOption({ label: 'rules' })
    await pickRelated(page, 'Gondor')
    await page.getByTestId('save-relationship').click()
    await expect(relation(page, 'rules')).toContainText('Gondor')

    const firstTypes = await (
      await page.request.get(`/api/universes/${first}/relationship-types`)
    ).json()
    const firstTypeId = firstTypes[0].id

    // A second universe of the author's own, with its own cast and its own kind.
    const second = await newUniverse(page, unique('Other Reach '))
    await addRelationKind(page, second, { name: 'serves', inverseName: 'served by' })
    const eowyn = await newEntry(page, second, 'Eowyn')
    const rohan = await newEntry(page, second, 'Rohan')

    // The picker searches one universe. The other universe's cast is not in it.
    await page.goto(entryUrl(second, eowyn))
    await page.getByTestId('add-relationship').click()
    await page.getByTestId('picker-input').click()
    await page.getByTestId('picker-input').fill('Gondor')
    await expect(page.getByText('Nothing here by that name.')).toBeVisible()
    await expect(page.getByTestId('picker-option-Gondor')).toHaveCount(0)

    // Nor will the API take an id from the other universe, in any of the three slots.
    const foreignType = await page.request.post(`/api/universes/${second}/relationships`, {
      data: {
        relationshipTypeId: firstTypeId,
        sourceEntityId: eowyn,
        targetEntityId: rohan,
        canonStatus: 0,
        startDate: null,
        endDate: null,
        notes: null,
      },
    })
    expect(foreignType.status()).toBe(400)
    expect(await foreignType.text()).toContain('Choose a relationship type from this universe.')

    const secondTypes = await (
      await page.request.get(`/api/universes/${second}/relationship-types`)
    ).json()

    const foreignEnds = await page.request.post(`/api/universes/${second}/relationships`, {
      data: {
        relationshipTypeId: secondTypes[0].id,
        sourceEntityId: aragorn,
        targetEntityId: gondor,
        canonStatus: 0,
        startDate: null,
        endDate: null,
        notes: null,
      },
    })
    expect(foreignEnds.status()).toBe(400)
    const endsBody = await foreignEnds.text()
    expect(endsBody).toContain('sourceEntityId')
    expect(endsBody).toContain('targetEntityId')

    // An entry of the author's own, asked for under the wrong universe, is simply not
    // there.
    const wrongUniverse = await page.request.get(
      `/api/universes/${second}/entities/${aragorn}/relationships`,
    )
    expect(wrongUniverse.status()).toBe(404)

    // A different account gets the same answer as for a universe that never existed,
    // and is told nothing about what is inside.
    await page.goto('/app')
    await clickSignOut(page)
    await page.waitForURL('/login')
    await signUp(page)

    await page.goto(entryUrl(first, aragorn))
    await expect(page.getByTestId('universe-missing')).toBeVisible()

    const probe = await page.request.get(
      `/api/universes/${first}/entities/${aragorn}/relationships`,
    )
    expect(probe.status()).toBe(404)
    const probeBody = await probe.text()
    expect(probeBody).not.toContain('Aragorn')
    expect(probeBody).not.toContain('Gondor')
    expect(probeBody).not.toContain('rules')

    const probeTypes = await page.request.get(`/api/universes/${first}/relationship-types`)
    expect(probeTypes.status()).toBe(404)
    expect(await probeTypes.text()).not.toContain('rules')
  })
})
