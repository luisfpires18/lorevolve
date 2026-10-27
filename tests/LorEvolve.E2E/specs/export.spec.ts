import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { entryNames, entryText, ZIP_SIGNATURE } from './support/zip'

/**
 * One journey, for the one thing only a browser can prove.
 *
 * What a backup contains, what it leaves out and who may ask for one is settled by the API
 * tests, which can build lore this screen cannot reach. What they cannot show is that the
 * click actually produces a file on disk: the response is a blob, and the download is driven
 * by an object URL and an anchor. That is this file, and nothing more.
 *
 * The file is an archive now - the document plus every entry's picture - so what is checked
 * here is that a real ZIP arrives and that its table of contents says what it should.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('archivist')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

test.describe('export', () => {
  test('an owner downloads a backup of their universe', async ({ page }) => {
    await signUp(page)

    await page.getByTestId('new-universe').click()
    await page.getByLabel('Name').fill(unique('Tidewatch '))
    await page.getByRole('button', { name: 'Create universe' }).click()
    await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)

    const name = unique('Alenna Vance ')
    await page.getByTestId('workspace-lore').click()
    await page.waitForURL(/\/lore$/)
    await page.getByTestId('new-entity').click()
    await page.waitForURL(/\/lore\/new$/)
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Summary').fill('Warden of the drowned coast.')
    await page.getByTestId('save-entity').click()
    await page.waitForURL(/\/lore\/[0-9a-f-]+$/)

    await page.getByTestId('workspace-settings').click()
    await page.waitForURL(/\/settings$/)
    await page.getByTestId('settings-tab-data').click()

    const downloading = page.waitForEvent('download')
    await page.getByTestId('export-universe').click()
    const download = await downloading

    // Named for the world and the day, so a folder of these stays legible.
    expect(download.suggestedFilename()).toMatch(/^lorevolve-tidewatch-[a-z0-9]+-\d{8}\.zip$/)

    const archive = await readFile((await download.path())!)

    // A real ZIP, by the header every one of them starts with rather than by its extension.
    expect(archive.subarray(0, 4)).toEqual(ZIP_SIGNATURE)

    // This entry has no picture, so the archive is the document and nothing else. The document
    // is stored deflated, so the world's name is read through the API rather than out of the
    // bytes - what it holds is the API tests' business.
    expect(entryNames(archive)).toEqual(['backup.json'])
    expect(name.length).toBeGreaterThan(0)

    // And the page says which file to go and look for.
    await expect(page.getByTestId('export-done')).toContainText(download.suggestedFilename())

    // The readable export (issue #11): Markdown pages for reading, one per entry, linked from the index.
    const readableDownloading = page.waitForEvent('download')
    await page.getByTestId('export-readable').click()
    const readable = await readableDownloading
    expect(readable.suggestedFilename()).toMatch(
      /^lorevolve-tidewatch-[a-z0-9]+-\d{8}-readable\.zip$/,
    )

    const book = await readFile((await readable.path())!)
    expect(book.subarray(0, 4)).toEqual(ZIP_SIGNATURE)
    const pages = entryNames(book)
    expect(pages).toEqual(expect.arrayContaining(['README.md', 'lore/README.md', 'timeline.md']))
    const entryPage = pages.find((path) => path.startsWith('lore/character/'))!
    expect(entryText(book, entryPage)).toContain(`# ${name}`)
    expect(entryText(book, 'lore/README.md')).toContain(`](${entryPage.slice('lore/'.length)})`)
    await expect(page.getByTestId('export-done')).toContainText(readable.suggestedFilename())
  })
})
