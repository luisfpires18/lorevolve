import { expect, test, type Page } from '@playwright/test'
import { acceptConfirm } from './support/confirm'

/**
 * One journey through the history surface, and no more than that.
 *
 * What the versions contain, when one is written and when one is refused is proved by the
 * API tests, which can set up lore this screen cannot reach. What only a browser can show
 * is that the dossier grows a history at all, that an old version can be read in place,
 * and that putting one back changes the entry and is itself recorded. That is this file.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('chronicler')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return username
}

function version(page: Page, number: number) {
  return page.locator(`[data-testid="history-list"] [data-version="${number}"]`)
}

test.describe('history', () => {
  test('an entry keeps its versions, and an older one can be read and put back', async ({
    page,
  }) => {
    const username = await signUp(page)

    await page.getByTestId('new-universe').click()
    await page.getByLabel('Name').fill(unique('Tidewatch '))
    await page.getByRole('button', { name: 'Create universe' }).click()
    await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)

    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)

    const name = unique('Alenna Vance ')
    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Summary').fill('Warden of the drowned coast.')
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    // Creating the entry is its first version. History is the entry's third view, at its own address.
    await page.getByTestId('entry-view-history').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+\/history$/)
    await expect(version(page, 1)).toContainText('Created')
    await expect(version(page, 1).getByTestId('version-actor')).toHaveText(`by ${username}`)
    await expect(page.getByTestId('history-list').locator('li')).toHaveCount(1)

    // Edit is in the entry's header, so it is pressed from here - and opens the form where the
    // details it edits are shown, which is the Article view.
    await page.getByTestId('edit-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)
    await page.getByLabel('Summary').fill('Warden of the drowned coast, and its last cartographer.')
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-summary')).toContainText('last cartographer')

    // An edit adds a version, and says what moved without diffing anything.
    await page.getByTestId('entry-view-history').click()
    await expect(page.getByTestId('history-list').locator('li')).toHaveCount(2)
    await expect(version(page, 2)).toContainText('Changed the summary')

    // The older version can be read in place, as it stood.
    await version(page, 1).getByTestId('version-view').click()
    await expect(version(page, 1).getByTestId('version-snapshot')).toContainText(
      'Warden of the drowned coast.',
    )

    // Putting it back changes the entry and is recorded as a version of its own.
    await version(page, 1).getByTestId('version-restore').click()
    await acceptConfirm(page)

    await expect(page.getByTestId('entry-summary')).toHaveText('Warden of the drowned coast.')
    await expect(page.getByTestId('history-list').locator('li')).toHaveCount(3)
    await expect(version(page, 3)).toContainText('restored version 1')

    // Nothing was rewritten on the way: the version that was copied is still there.
    await expect(version(page, 1)).toContainText('Created')
  })
})
