import { expect, test, type Page } from '@playwright/test'
import { png } from './support/png'
import { acceptConfirm, confirmDialog, dismissConfirm } from './support/confirm'

/**
 * An entry's page as a page: its one heading, the type it links back to, its actions with the
 * destructive one kept in the ⋯ menu, the form's bar, and the picture - shown from the original on
 * the page and whole in its own viewer, while the Lore card keeps the square thumbnail.
 *
 * Entries and pictures are made through the API: what is proved here is how the page presents them.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('reader')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function seedWorld(page: Page) {
  const universe = await page.request.post('/api/universes', {
    data: { name: unique('Saltmarrow '), description: null, accentColor: null },
  })
  const universeId = ((await universe.json()) as { id: string }).id
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string }[]
  const character = types.find((type) => type.name === 'Character')!.id

  async function entry(name: string, width?: number, height?: number) {
    const created = await page.request.post(`/api/universes/${universeId}/entities`, {
      data: {
        entityTypeId: character,
        name,
        summary: 'Keeper of the tide ledger.',
        canonStatus: 2,
        aliases: [],
        tags: [],
        fields: [],
      },
    })
    const id = ((await created.json()) as { id: string }).id
    if (width && height) {
      const picture = await page.request.put(`/api/universes/${universeId}/entities/${id}/image`, {
        multipart: {
          file: {
            name: 'portrait.png',
            mimeType: 'image/png',
            buffer: png(width, height, (x, y) => [40 + (x % 80), 90, 120 + (y % 60)]),
          },
        },
      })
      expect(picture.ok()).toBe(true)
    }
    return id
  }

  return { universeId, character, entry }
}

const entryUrl = (universeId: string, id: string) => `/app/universes/${universeId}/lore/${id}`

test.describe('an entry page', () => {
  test('has one heading, links back to its type, and keeps Move to Trash in its menu', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedWorld(page)
    const id = await world.entry('Brannoch Hale')
    await page.goto(entryUrl(world.universeId, id))

    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brannoch Hale')

    // The type is a way back to that type's list, by its id.
    await expect(page.getByTestId('entry-type')).toHaveAttribute(
      'href',
      `/app/universes/${world.universeId}/lore?type=${world.character}`,
    )

    // The status is a choice with the current one said, not only drawn.
    await expect(page.getByTestId('canon-canon')).toHaveAttribute('aria-pressed', 'true')

    // Edit is direct; Move to Trash is not beside it but last in the ⋯ menu, worked by keyboard.
    await expect(page.getByTestId('edit-entity')).toBeVisible()
    await expect(page.getByTestId('trash-entity')).toHaveCount(0)
    const more = page.getByTestId('entity-actions')
    await expect(more).toHaveAccessibleName('More actions for Brannoch Hale')
    await more.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('duplicate-entity')).toBeFocused()
    await page.keyboard.press('End')
    await expect(page.getByTestId('trash-entity')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('trash-entity')).toHaveCount(0)
    await expect(more).toBeFocused()

    // The views are still three addresses.
    await page.getByTestId('entry-view-relations').click()
    await expect(page).toHaveURL(`${entryUrl(world.universeId, id)}/relations`)
    await expect(page.getByTestId('entry-view-relations')).toHaveAttribute('aria-current', 'page')
    await page.getByTestId('entry-view-history').click()
    await expect(page).toHaveURL(`${entryUrl(world.universeId, id)}/history`)
  })

  test('the form says whether it has changed, and Cancel puts the entry back', async ({ page }) => {
    await signUp(page)
    const world = await seedWorld(page)
    const id = await world.entry('Alenna Vance')
    await page.goto(entryUrl(world.universeId, id))

    await page.getByTestId('edit-entity').click()
    await expect(page.getByTestId('entry-form')).toBeVisible()
    // Still one heading while the name is a field.
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)

    const status = page.getByTestId('entry-form-status')
    await expect(status).toHaveText('No changes yet')
    await page.getByLabel('Summary').fill('Warden of the drowned coast.')
    await expect(status).toHaveText('Unsaved changes')

    // Save is the primary and comes first, as in every drawer and confirmation (012); Cancel follows it and leaves
    // everything as it was.
    const save = page.getByTestId('save-entity')
    const cancel = page.getByRole('button', { name: 'Cancel' })
    expect((await save.boundingBox())!.x).toBeLessThan((await cancel.boundingBox())!.x)
    await cancel.click()
    await acceptConfirm(page)
    await expect(page.getByTestId('entry-summary')).toHaveText('Keeper of the tide ledger.')
  })

  test('shows the original picture on the page, whole in its viewer, and the thumbnail on the card', async ({
    page,
  }) => {
    await signUp(page)
    const world = await seedWorld(page)
    const id = await world.entry('Maren Ashvale', 400, 900)
    const bare = await world.entry('Io')

    await page.goto(entryUrl(world.universeId, id))
    const plate = page.getByTestId('entry-image').locator('img')
    await expect(plate).toHaveAttribute('src', /\/original$/)

    const expand = page.getByRole('button', { name: 'View full image' })
    await expect(expand).toBeVisible()
    await expand.click()

    const viewer = page.getByRole('dialog', { name: 'Maren Ashvale' })
    await expect(viewer).toBeVisible()
    await expect(viewer.getByTestId('image-viewer-image')).toHaveAttribute('src', /\/original$/)

    // The whole picture fits the window: nothing of it is off screen.
    const shown = (await viewer.getByTestId('image-viewer-image').boundingBox())!
    const size = page.viewportSize()!
    expect(shown.y).toBeGreaterThanOrEqual(0)
    expect(shown.y + shown.height).toBeLessThanOrEqual(size.height + 1)
    expect(shown.x + shown.width).toBeLessThanOrEqual(size.width + 1)

    // Focus is inside, on Close, and Tab does not wander back onto the page behind.
    const close = page.getByTestId('image-viewer-close')
    await expect(close).toBeFocused()
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true)

    // Escape closes, and the focus goes back to the button that opened it.
    await page.keyboard.press('Escape')
    await expect(viewer).toHaveCount(0)
    await expect(expand).toBeFocused()

    // A press on the picture keeps it open; one on the dark surround closes it; so does Close.
    await expand.click()
    await viewer.getByTestId('image-viewer-image').click()
    await expect(viewer).toBeVisible()
    await page.mouse.click(8, size.height - 8)
    await expect(viewer).toHaveCount(0)
    await expand.click()
    await close.click()
    await expect(viewer).toHaveCount(0)
    await expect(expand).toBeFocused()

    // No address was spent on it: Back leaves the entry rather than closing a picture.
    expect(new URL(page.url()).pathname).toBe(entryUrl(world.universeId, id))

    // An entry with no picture has nothing to open.
    await page.goto(entryUrl(world.universeId, bare))
    await expect(page.getByTestId('entry-view-article')).toBeVisible()
    await expect(page.getByRole('button', { name: 'View full image' })).toHaveCount(0)

    // The card keeps the square thumbnail; the original is never loaded for a grid.
    await page.goto(`/app/universes/${world.universeId}/lore?type=${world.character}`)
    const card = page.locator('[data-testid="entity-card"][data-entity-name="Maren Ashvale"]')
    await expect(card.getByTestId('entity-portrait')).toHaveAttribute('src', /\/thumbnail\//)
  })

  test.describe('with unsaved changes in the form', () => {
    const sidebarLink = (page: Page, name: string) =>
      page.getByRole('navigation', { name: 'Universe', exact: true }).getByRole('link', { name })

    test('a link out asks once; staying keeps the edit, leaving lets it go', async ({ page }) => {
      await signUp(page)
      const world = await seedWorld(page)
      const id = await world.entry('Tovin Marsh')
      await page.goto(entryUrl(world.universeId, id))

      await page.getByTestId('edit-entity').click()
      const status = page.getByTestId('entry-form-status')
      await expect(status).toHaveText('No changes yet')
      await page.getByLabel('Summary').fill('Ferryman of the salt road.')
      await expect(status).toHaveText('Unsaved changes')

      // Stay: still on the form, the edit intact.
      await sidebarLink(page, 'Timeline').click()
      await dismissConfirm(page, '“Tovin Marsh” has unsaved changes')
      await expect(page).toHaveURL(entryUrl(world.universeId, id))
      await expect(page.getByLabel('Summary')).toHaveValue('Ferryman of the salt road.')

      // Leave: asked once more, and the destination opens.
      await sidebarLink(page, 'Timeline').click()
      await acceptConfirm(page)
      await page.waitForURL(`/app/universes/${world.universeId}/timeline`)
      await expect(confirmDialog(page)).toHaveCount(0)

      // Nothing was saved.
      await page.goto(entryUrl(world.universeId, id))
      await expect(page.getByTestId('entry-summary')).toHaveText('Keeper of the tide ledger.')
    })

    test('the browser Back button asks, and stays or leaves once', async ({ page }) => {
      await signUp(page)
      const world = await seedWorld(page)
      const id = await world.entry('Wren Allard')
      const loreUrl = `/app/universes/${world.universeId}/lore?type=${world.character}`
      await page.goto(loreUrl)
      await page.locator('[data-testid="entity-card"][data-entity-name="Wren Allard"]').click()
      await page.waitForURL(entryUrl(world.universeId, id))

      await page.getByTestId('edit-entity').click()
      await page.getByLabel('Summary').fill('Cartographer of the fens.')

      await page.goBack()
      await dismissConfirm(page)
      await expect(page).toHaveURL(entryUrl(world.universeId, id))
      await expect(page.getByLabel('Summary')).toHaveValue('Cartographer of the fens.')
      await expect(page.getByTestId('entry-form-status')).toHaveText('Unsaved changes')

      await page.goBack()
      await acceptConfirm(page)
      await page.waitForURL(loreUrl)
      await expect(page.getByTestId('entity-grid')).toBeVisible()

      // Forward returns to the entry, not to a form nobody chose to keep, and nothing asks.
      await page.goForward()
      await page.waitForURL(entryUrl(world.universeId, id))
      await expect(page.getByTestId('entry-summary')).toHaveText('Keeper of the tide ledger.')
      await expect(page.getByTestId('entry-form')).toHaveCount(0)
      await expect(confirmDialog(page)).toHaveCount(0)
    })

    test('Cancel asks once only when there is something to lose', async ({ page }) => {
      await signUp(page)
      const world = await seedWorld(page)
      const id = await world.entry('Ossery Vane')
      await page.goto(entryUrl(world.universeId, id))
      const status = page.getByTestId('entry-form-status')
      const cancel = page.getByTestId('cancel-entity')

      // Clean: Cancel simply closes.
      await page.getByTestId('edit-entity').click()
      await cancel.click()
      await expect(page.getByTestId('entry-form')).toHaveCount(0)
      await expect(confirmDialog(page)).toHaveCount(0)

      // Dirty: stay keeps the change.
      await page.getByTestId('edit-entity').click()
      await page.getByLabel('Summary').fill('Lampwright.')
      await cancel.click()
      await dismissConfirm(page)
      await expect(status).toHaveText('Unsaved changes')
      await expect(page.getByLabel('Summary')).toHaveValue('Lampwright.')

      // Discard: one question, and the entry as stored. Nothing asks on the way out after.
      await cancel.click()
      await acceptConfirm(page)
      await expect(page.getByTestId('entry-summary')).toHaveText('Keeper of the tide ledger.')
      await sidebarLink(page, 'Timeline').click()
      await page.waitForURL(`/app/universes/${world.universeId}/timeline`)
      await expect(confirmDialog(page)).toHaveCount(0)
    })

    test('a change put back is no change, and a saved form leaves freely', async ({ page }) => {
      await signUp(page)
      const world = await seedWorld(page)
      const id = await world.entry('Hesper Coyle')
      await page.goto(entryUrl(world.universeId, id))
      const status = page.getByTestId('entry-form-status')

      // Reverting: every kind of change back to what is stored reads clean again.
      await page.getByTestId('edit-entity').click()
      const summary = page.getByLabel('Summary')
      await summary.fill('Something else.')
      await expect(status).toHaveText('Unsaved changes')
      await summary.fill('Keeper of the tide ledger.')
      await expect(status).toHaveText('No changes yet')

      await page.getByLabel('Aliases').fill('The Ledger')
      await page.getByLabel('Aliases').press('Enter')
      await expect(status).toHaveText('Unsaved changes')
      await page.getByRole('button', { name: /Remove The Ledger/ }).click()
      await expect(status).toHaveText('No changes yet')

      await page.getByTestId('canon-draft').click()
      await expect(status).toHaveText('Unsaved changes')
      await page.getByTestId('canon-canon').click()
      await expect(status).toHaveText('No changes yet')

      // A change of type is a change.
      const typePick = page.getByLabel('Entry type')
      const original = await typePick.inputValue()
      await typePick.selectOption({ label: 'Location' })
      await expect(status).toHaveText('Unsaved changes')
      await typePick.selectOption(original)
      await expect(status).toHaveText('No changes yet')

      // A save that succeeds clears it, and nothing asks after.
      await summary.fill('Harbourmaster.')
      await expect(status).toHaveText('Unsaved changes')
      await page.getByTestId('save-entity').click()
      await expect(page.getByTestId('entry-summary')).toHaveText('Harbourmaster.')
      await sidebarLink(page, 'Timeline').click()
      await page.waitForURL(`/app/universes/${world.universeId}/timeline`)
      await expect(confirmDialog(page)).toHaveCount(0)
    })

    test('a save that fails stays dirty and still asks', async ({ page }) => {
      await signUp(page)
      const world = await seedWorld(page)
      const id = await world.entry('Corvin Pell')
      await page.goto(entryUrl(world.universeId, id))

      await page.getByTestId('edit-entity').click()
      await page.getByLabel('Name').fill('')
      await page.getByTestId('save-entity').click()
      await expect(page.getByTestId('entry-error')).toBeVisible()
      await expect(page.getByTestId('entry-form-status')).toHaveText('Unsaved changes')

      await sidebarLink(page, 'Timeline').click()
      await dismissConfirm(page)
      await expect(page).toHaveURL(entryUrl(world.universeId, id))
    })

    test('a new entry is protected once written in, its framed picture included', async ({
      page,
    }) => {
      await signUp(page)
      const world = await seedWorld(page)
      await page.goto(`/app/universes/${world.universeId}/lore/new`)
      const status = page.getByTestId('entry-form-status')

      // Blank: leaving asks nothing.
      await expect(status).toHaveText('New entry')
      await sidebarLink(page, 'Timeline').click()
      await page.waitForURL(`/app/universes/${world.universeId}/timeline`)
      await expect(confirmDialog(page)).toHaveCount(0)

      // A name is worth asking about.
      await page.goto(`/app/universes/${world.universeId}/lore/new`)
      await page.getByLabel('Name').fill('Isolde Brack')
      await expect(status).toHaveText('Unsaved changes')
      await sidebarLink(page, 'Timeline').click()
      await dismissConfirm(page, 'new entry has not been created')
      await expect(page.getByLabel('Name')).toHaveValue('Isolde Brack')

      // So is a picture framed and accepted - but not the cropper opened and closed. Typing an address
      // leaves the page itself, so the browser asks too: its own prompt, the one LoreX cannot draw.
      const unloading: string[] = []
      page.once('dialog', (dialog) => {
        unloading.push(dialog.type())
        void dialog.accept()
      })
      await page.goto(`/app/universes/${world.universeId}/lore/new`)
      expect(unloading).toEqual(['beforeunload'])
      const file = {
        name: 'portrait.png',
        mimeType: 'image/png',
        buffer: png(300, 300, (x, y) => [40 + (x % 80), 90, 120 + (y % 60)]),
      }
      const crop = page.getByTestId('image-crop-dialog')
      await page.getByTestId('entity-image-input').setInputFiles(file)
      await expect(crop).toBeVisible()
      await page.getByTestId('image-crop-cancel').click()
      await expect(crop).toHaveCount(0)
      await expect(status).toHaveText('New entry')

      await page.getByTestId('entity-image-input').setInputFiles(file)
      await expect(crop.getByTestId('image-crop-confirm')).toBeEnabled()
      await crop.getByTestId('image-crop-confirm').click()
      await expect(status).toHaveText('Unsaved changes')

      // Reload and close are the browser's own question, only while there is something to lose.
      const prompt = page.waitForEvent('dialog')
      await page.close({ runBeforeUnload: true })
      expect((await prompt).type()).toBe('beforeunload')
    })
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

    test('the picture and its viewer fit the screen, with Close in reach', async ({ page }) => {
      await signUp(page)
      const world = await seedWorld(page)
      const id = await world.entry('Saltmarrow', 1600, 600)
      await page.goto(entryUrl(world.universeId, id))

      const expand = page.getByRole('button', { name: 'View full image' })
      expect((await expand.boundingBox())!.height).toBeGreaterThanOrEqual(44)
      await expand.tap()

      const close = page.getByTestId('image-viewer-close')
      const box = (await close.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.x + box.width).toBeLessThanOrEqual(390)

      const shown = (await page.getByTestId('image-viewer-image').boundingBox())!
      expect(shown.x).toBeGreaterThanOrEqual(0)
      expect(shown.x + shown.width).toBeLessThanOrEqual(391)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1)

      await close.tap()
      await expect(page.getByTestId('image-viewer')).toHaveCount(0)
    })
  })
})
