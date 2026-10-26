import { expect, test, type Browser, type Page } from '@playwright/test'
import { png } from './support/png'
import { PASSWORD, invite, post, seeder, unique } from './support/trash'

/**
 * Refinement 040 (ADR 0042): Storage in the Profile's Usage section, as a person sees it. What counts, whose it is and when an
 * upload is refused are proved by the API tests, which can set an allowance; this proves that the numbers reach the
 * screen in words, that the bar says the same to a screen reader, that a collaborator's upload shows up on the owner's
 * Profile and not their own, and that the section fits a phone. Nothing here fills a gigabyte.
 */

const Role = { Editor: 3 } as const

/** A picture of a few kilobytes: noisy enough that it is not compressed down to nothing. */
const picture = {
  name: 'storage.png',
  mimeType: 'image/png',
  buffer: png(160, 120, (x, y) => [(x * 37 + y * 11) % 256, (x * 7 + y * 53) % 256, (x * y) % 256]),
}

async function signUp(page: Page, prefix: string) {
  const username = unique(prefix)
  const email = `${username}@example.test`
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return email
}

async function world(page: Page) {
  return post(page, '/api/universes', {
    name: unique('Storage World '),
    description: null,
    accentColor: null,
  })
}

async function upload(page: Page, universeId: string, entryId: string) {
  const response = await page.request.put(
    `/api/universes/${universeId}/entities/${entryId}/image`,
    {
      multipart: { file: picture },
    },
  )
  expect(response.ok(), await response.text()).toBe(true)
}

async function expectStorage(page: Page, text: string | RegExp) {
  await page.goto('/app/profile')
  const section = page.getByTestId('profile-usage').getByTestId('usage-storage')
  await expect(section.getByRole('heading', { name: 'Storage' })).toBeVisible()
  await expect(section.getByTestId('usage-storage-amount')).toHaveText(text)
  return section
}

test('the Profile shows what the account stores, and removing a picture gives it back', async ({
  page,
}) => {
  await signUp(page, 'keeper')

  const empty = await expectStorage(page, '0 MB used of 1 GB')
  const meter = empty.getByRole('meter', { name: 'Storage' })
  await expect(meter).toHaveAttribute('aria-valuenow', '0')
  await expect(meter).toHaveAttribute('aria-valuetext', '0 MB used of 1 GB, 0%')
  await expect(empty.getByTestId('usage-storage-percent')).toHaveText('0%')
  await expect(empty.getByTestId('usage-storage-full')).toHaveCount(0)
  await expect(empty).toContainText('universes you own')

  // Nothing to buy and nothing to raise: the section only reads.
  await expect(empty.getByRole('button')).toHaveCount(0)
  await expect(empty.getByRole('link')).toHaveCount(0)

  const universeId = await world(page)
  const entry = await seeder(page, universeId).entry('Pictured')
  await upload(page, universeId, entry.id)

  const used = await expectStorage(page, /^\d+(\.\d)? KB used of 1 GB$/)
  await expect(used.getByRole('meter', { name: 'Storage' })).toHaveAttribute(
    'aria-valuetext',
    /^\d+(\.\d)? KB used of 1 GB, Under 1%$/,
  )
  // A few kilobytes of a gigabyte is never shown as nothing.
  await expect(used.getByTestId('usage-storage-percent')).toHaveText('Under 1%')

  expect(
    (await page.request.delete(`/api/universes/${universeId}/entities/${entry.id}/image`)).status(),
  ).toBe(204)
  await expectStorage(page, '0 MB used of 1 GB')
})

test('an editor’s upload shows on the owner’s Profile and not the editor’s', async ({
  browser,
}) => {
  const owner = await fresh(browser)
  const editor = await fresh(browser)
  await signUp(owner, 'owner')
  const editorEmail = await signUp(editor, 'editor')

  const universeId = await world(owner)
  const entry = await seeder(owner, universeId).entry('Shared')
  await invite(owner, editor, `/api/universes/${universeId}/invitations`, editorEmail, Role.Editor)

  await upload(editor, universeId, entry.id)

  await expectStorage(owner, /^\d+(\.\d)? KB used of 1 GB$/)
  await expectStorage(editor, '0 MB used of 1 GB')

  await owner.context().close()
  await editor.context().close()
})

test('Storage fits a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await signUp(page, 'pocket')

  const section = await expectStorage(page, '0 MB used of 1 GB')
  await expect(section.getByRole('meter', { name: 'Storage' })).toBeVisible()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)

  const box = (await section.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(360)
})

async function fresh(browser: Browser) {
  const context = await browser.newContext()
  return context.newPage()
}
