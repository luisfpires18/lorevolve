import { expect, test, type Page } from '@playwright/test'
import { PASSWORD, post, unique } from './support/trash'
import { confirmDialog } from './support/confirm'
import { openMenuFor } from './support/rowMenu'

/**
 * LoreX's own confirmation (Issue #50), through its most consequential use: moving a whole story to the Trash. What it
 * names, how it is answered and refused, what a failure looks like, and that one confirmation is one request. Every other
 * confirmation is the same component; its specs answer it through `support/confirm`.
 */

async function account(page: Page) {
  const username = unique('confirmer')
  await post(page, '/api/auth/register', {
    username,
    email: `${username}@example.test`,
    password: PASSWORD,
  })
}

/** A story of two chapters and three scenes, one with prose, and its page open. */
async function storyOpen(page: Page) {
  const u = await post(page, '/api/universes', {
    name: unique('Confirm World '),
    description: null,
    accentColor: null,
  })
  const title = "Thalori's Origins"
  const s = await post(page, `/api/universes/${u}/stories`, { title, premise: null, status: 1 })
  const base = `/api/universes/${u}/stories/${s}`
  const scene = (sceneTitle: string, chapterId: string) =>
    post(page, `${base}/scenes`, {
      title: sceneTitle,
      summary: null,
      notes: null,
      povEntityId: null,
      chronology: null,
      entityIds: [],
      chapterId,
    })
  const first = await post(page, `${base}/chapters`, { title: 'Ashes', summary: null, notes: null })
  const second = await post(page, `${base}/chapters`, {
    title: 'Embers',
    summary: null,
    notes: null,
  })
  const prose = await scene('The Gate', first)
  await scene('The Hall', first)
  await scene('The Road', second)
  const manuscript = `${base}/scenes/${prose}/manuscript`
  const current = (await (await page.request.get(manuscript)).json()) as { version: number }
  expect(
    (
      await page.request.put(manuscript, {
        data: { content: 'Words worth keeping.', expectedVersion: current.version },
      })
    ).ok(),
  ).toBe(true)
  await page.goto(`/app/universes/${u}/stories/${s}`)
  return { u, s, title, storiesUrl: `/app/universes/${u}/stories` }
}

async function askToTrash(page: Page) {
  await openMenuFor(page, 'delete-story')
  await page.getByTestId('delete-story').click()
  await expect(confirmDialog(page)).toBeVisible()
}

test.describe('the confirmation dialog', () => {
  test('moving a story to the Trash names it, says what goes with it and that it comes back, and only confirming moves it', async ({
    page,
  }) => {
    await account(page)
    const { title, storiesUrl } = await storyOpen(page)
    const deletes: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'DELETE') deletes.push(request.url())
    })

    await askToTrash(page)
    const dialog = confirmDialog(page)
    await expect(dialog).toHaveAttribute('data-variant', 'warning')
    await expect(dialog).toHaveAccessibleName(`Move “${title}” to the Trash?`)
    await expect(dialog).toHaveAccessibleDescription(
      /You can restore the whole story from the Trash/,
    )
    await expect(dialog.getByTestId('confirm-dialog-details').locator('li')).toHaveText([
      '2 chapters',
      '3 scenes, with every manuscript',
    ])
    await expect(dialog).toContainText('The lore it draws on stays.')
    await expect(dialog.getByTestId('confirm-dialog-confirm')).toHaveText('Move story to Trash')
    // Taking something away starts on the safe choice.
    await expect(dialog.getByTestId('confirm-dialog-cancel')).toBeFocused()

    // Cancel, Escape and a press outside each answer no: nothing is sent, and the focus goes back to the menu.
    await dialog.getByTestId('confirm-dialog-cancel').click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('story-actions')).toBeFocused()

    await askToTrash(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    await askToTrash(page)
    await page.mouse.click(5, 5)
    await expect(dialog).toHaveCount(0)
    expect(deletes).toEqual([])
    await expect(page.getByTestId('story-title')).toHaveText(title)

    // Confirmed: moved once, and the page goes back to the stories.
    await askToTrash(page)
    await dialog.getByTestId('confirm-dialog-confirm').click()
    await page.waitForURL(storiesUrl)
    expect(deletes).toHaveLength(1)
  })

  test('a failure keeps the dialog open and says so, a double press sends once, and trying again works', async ({
    page,
  }) => {
    await account(page)
    const { storiesUrl } = await storyOpen(page)
    let attempts = 0
    let release: () => void = () => undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/universes/*/stories/*', async (route) => {
      if (route.request().method() !== 'DELETE') return route.continue()
      attempts += 1
      if (attempts === 1) {
        // Held until the test has pressed again, then refused.
        await held
        return route.fulfill({
          status: 500,
          contentType: 'application/problem+json',
          body: JSON.stringify({ title: 'An error occurred while processing your request.' }),
        })
      }
      return route.continue()
    })

    await askToTrash(page)
    const dialog = confirmDialog(page)
    const confirm = dialog.getByTestId('confirm-dialog-confirm')
    await confirm.click()
    await expect(confirm).toBeDisabled()
    await expect(confirm).toHaveText('Moving…')
    await expect(dialog.getByTestId('confirm-dialog-cancel')).toBeDisabled()
    // While it runs, Escape and a second press do nothing.
    await page.keyboard.press('Escape')
    await confirm.dispatchEvent('click')
    release()

    // The API's own reason, as the page said it before (Issue #50 keeps every message).
    await expect(dialog.getByTestId('confirm-dialog-error')).toHaveText(
      'An error occurred while processing your request.',
    )
    await expect(dialog).toBeVisible()
    expect(attempts).toBe(1)
    await expect(page).not.toHaveURL(storiesUrl)

    await confirm.click()
    await page.waitForURL(storiesUrl)
    expect(attempts).toBe(2)
  })

  test('on a phone it sits within the screen, in both themes, and its buttons take the width', async ({
    page,
  }) => {
    await account(page)
    await storyOpen(page)
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width: 360, height: 740 })
      await askToTrash(page)
      const box = (await confirmDialog(page).boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(360)
      expect(box.y + box.height).toBeLessThanOrEqual(740)
      const confirm = (await confirmDialog(page)
        .getByTestId('confirm-dialog-confirm')
        .boundingBox())!
      expect(confirm.width).toBeGreaterThan(box.width * 0.7)
      await page.keyboard.press('Escape')
      await expect(confirmDialog(page)).toHaveCount(0)
    }
  })
})
