import { expect, test, type Page } from '@playwright/test'
import { chooseLoreType } from './support/lore'
import { acceptConfirm, confirmDialog } from './support/confirm'

/**
 * One journey through the Trash, and no more than that.
 *
 * What survives a trash, what a restore is allowed to refuse and how references behave are
 * all proved by the API tests, which can set lore up in states this screen cannot reach.
 * What only a browser can show is that the destructive button is gone - the entry leaves the
 * lore, its connection leaves with it, both are listed as recoverable, and one click puts the
 * whole thing back. That is this file.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('keeper')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function newUniverse(page: Page, name: string) {
  await page.goto('/app')
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(name)
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

async function newEntry(page: Page, universeId: string, name: string, summary?: string) {
  await page.goto(`/app/universes/${universeId}/lore`)
  await page.getByTestId('new-entity').click()
  await page.waitForURL(/\/lore\/new$/)
  await page.getByLabel('Name').fill(name)
  if (summary) await page.getByLabel('Summary').fill(summary)
  await page.getByTestId('save-entity').click()
  await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
  return page.url().split('/').pop()!
}

test.describe('trash', () => {
  test('an entry and the connection resting on it leave the lore together, and one restore brings both back', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await newUniverse(page, unique('Tidewatch '))

    // A relationship kind, so the entry has something resting on it that a hard delete would
    // have destroyed outright.
    await page.goto(`/app/universes/${universeId}/types?tab=relations`)
    await page.getByTestId('add-relationship-type').click()
    await page.getByLabel('Reads as', { exact: true }).fill('keeps')
    await page.getByLabel('Reads as, from the other side').fill('kept by')
    await page.getByTestId('save-relationship-type').click()
    await expect(page.locator('[data-reltype-name="keeps"]')).toBeVisible()

    const warden = await newEntry(page, universeId, 'Gatewarden', 'Keeper of the high wall.')
    const gate = await newEntry(page, universeId, 'Northern Gate')

    await page.goto(`/app/universes/${universeId}/lore/${warden}/relations`)
    await page.getByTestId('add-relationship').click()
    await page.getByLabel('Reading').selectOption({ label: 'keeps' })
    await page.getByTestId('picker-input').click()
    await page.getByTestId('picker-input').fill('Northern Gate')
    await page.getByTestId('picker-option-Northern Gate').click()
    await page.getByTestId('save-relationship').click()
    await expect(page.locator('[data-relation-label="keeps"]')).toContainText('Northern Gate')

    // The destructive action is gone. What is offered says where the entry goes.
    await page.goto(`/app/universes/${universeId}/lore/${gate}`)
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0)

    await page.getByTestId('entity-actions').click()
    await page.getByTestId('trash-entity').click()
    await expect(confirmDialog(page)).toContainText('Trash')
    await acceptConfirm(page, 'restore')

    // Removing it lands on the Trash, where it is listed as recoverable.
    await page.waitForURL(/\/trash$/)
    await expect(page.getByTestId('trash-row-Northern Gate')).toBeVisible()

    // And it is out of the lore: not in the browser, not findable, not openable.
    await page.goto(`/app/universes/${universeId}/lore`)
    await chooseLoreType(page, 'Character')
    await expect(page.getByTestId('entity-grid')).toContainText('Gatewarden')
    await expect(page.getByTestId('entity-grid')).not.toContainText('Northern Gate')

    await page.getByLabel('Filter entries').fill('Northern')
    await expect(page.getByTestId('entity-empty')).toBeVisible()

    await page.goto(`/app/universes/${universeId}/lore/${gate}`)
    await expect(page.getByTestId('entity-missing')).toBeVisible()

    // The relationship went with it - hidden, not destroyed, which is the next assertion.
    await page.goto(`/app/universes/${universeId}/lore/${warden}/relations`)
    await expect(page.getByTestId('relations-empty')).toBeVisible()

    // One click, from the Trash.
    await page.getByTestId('workspace-trash').click()
    await page.waitForURL(/\/trash$/)
    await page.getByTestId('restore-Northern Gate').click()

    await expect(page.getByTestId('trash-message')).toContainText('back in your lore')
    await expect(page.getByTestId('trash-empty')).toBeVisible()

    // The entry is readable again...
    await page.goto(`/app/universes/${universeId}/lore/${gate}`)
    await expect(page.getByTestId('entry-name')).toHaveText('Northern Gate')

    // ...and the connection came back with it, from both readings, without being re-authored.
    await page.goto(`/app/universes/${universeId}/lore/${gate}/relations`)
    await expect(page.locator('[data-relation-label="kept by"]')).toContainText('Gatewarden')

    await page.goto(`/app/universes/${universeId}/lore/${warden}/relations`)
    await expect(page.locator('[data-relation-label="keeps"]')).toContainText('Northern Gate')
  })
})
