import { expect, test, type Page } from '@playwright/test'
import { png } from './support/png'
import { post, signUp, world } from './support/trash'

/**
 * The Creation shelves (owner, 2026-11-17): a game is a card on a widescreen handheld, a film or series a strip of film,
 * a comic an issue, a story a book, each with a picture added from the empty card or its ⋯ menu; projects move up and
 * down like stories, and the order is kept. Each test registers its own account and builds its own universe through the
 * API.
 */

const GAME = 1
const SERIES = 2
const FILM = 3
const COMIC = 4

function game(page: Page, universeId: string, name: string, kind = GAME) {
  return post(page, '/api/projects', {
    name,
    kind,
    lifecycle: 0,
    subtype: null,
    summary: '',
    universeId,
    expectedVersion: null,
  })
}

function names(page: Page) {
  return page
    .getByTestId('projects-item')
    .evaluateAll((rows) => rows.map((row) => row.querySelector('.shelfcard__title')?.textContent))
}

function picture(name: string) {
  return {
    name,
    mimeType: 'image/png',
    buffer: png(800, 800, (_x, y) => (y > 300 && y < 500 ? [40, 70, 180] : [214, 190, 150])),
  }
}

/** Sets a cover through the card's drawer: pick, keep the suggested frame, close. */
async function setCover(page: Page, file: string) {
  const drawer = page.getByTestId('cover-drawer')
  await expect(drawer).toBeVisible()
  await drawer.getByTestId('cover-input').setInputFiles(picture(file))
  await page.getByTestId('image-crop-confirm').click()
  await expect(drawer.getByTestId('cover-card')).toBeVisible()
  await drawer.getByRole('button', { name: 'Close' }).click()
  await expect(drawer).toHaveCount(0)
}

test.describe('shelf cards', () => {
  test('games move up and down from their menu, and the order is kept', async ({ page }) => {
    await signUp(page)
    const universeId = await world(page)
    for (const name of ['Alpha Quest', 'Beta Quest', 'Gamma Quest'])
      await game(page, universeId, name)

    await page.goto(`/app/universes/${universeId}/gaming`)
    await expect.poll(() => names(page)).toEqual(['Alpha Quest', 'Beta Quest', 'Gamma Quest'])

    const first = page.getByTestId('projects-item').filter({ hasText: 'Alpha Quest' })
    await first.getByTestId('shelf-actions').click()
    await expect(first.getByTestId('shelf-move-up')).toHaveCount(0)
    await first.getByTestId('shelf-move-down').click()
    await expect.poll(() => names(page)).toEqual(['Beta Quest', 'Alpha Quest', 'Gamma Quest'])
    await expect(page.getByTestId('shelf-announcement')).toContainText('2 of 3')

    const last = page.getByTestId('projects-item').filter({ hasText: 'Gamma Quest' })
    await last.getByTestId('shelf-actions').click()
    await expect(last.getByTestId('shelf-move-down')).toHaveCount(0)
    await last.getByTestId('shelf-move-up').click()
    await expect(page.getByTestId('shelf-announcement')).toContainText('2 of 3')

    await page.reload()
    await expect.poll(() => names(page)).toEqual(['Beta Quest', 'Gamma Quest', 'Alpha Quest'])
  })

  test('a game and a story each take a picture from their card', async ({ page }) => {
    await signUp(page)
    const universeId = await world(page)
    await game(page, universeId, 'Cover Quest')
    await post(page, `/api/universes/${universeId}/stories`, {
      title: 'The Covered Book',
      premise: null,
      status: 1,
    })

    // The empty screen offers Add picture; once there is one, the button is gone and the menu changes it.
    await page.goto(`/app/universes/${universeId}/gaming`)
    const card = page.getByTestId('projects-item')
    await expect(card.locator('.handheld__screen img')).toHaveCount(0)
    await card.getByTestId('shelf-add-picture').click()
    await setCover(page, 'screen.png')
    await expect(card.locator('.handheld__screen img')).toBeVisible()
    await expect(card.getByTestId('shelf-add-picture')).toHaveCount(0)
    await page.reload()
    await expect(card.locator('.handheld__screen img')).toBeVisible()
    await card.getByTestId('shelf-actions').click()
    await expect(card.getByTestId('shelf-cover')).toHaveText('Change picture')

    // The book takes one from its menu just as well.
    await page.goto(`/app/universes/${universeId}/writing`)
    const book = page.getByTestId('story-row')
    await expect(book.locator('.book__cover img')).toHaveCount(0)
    await expect(book.getByTestId('shelf-add-picture')).toBeVisible()
    await book.getByTestId('story-actions').click()
    await expect(book.getByTestId('story-cover')).toHaveText('Add picture')
    await book.getByTestId('story-cover').click()
    await setCover(page, 'book.png')
    await expect(book.locator('.book__cover img')).toBeVisible()
    await page.reload()
    await expect(book.locator('.book__cover img')).toBeVisible()
  })

  test('cinema orders films and series each among their own kind, on strips of film', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await world(page)
    await game(page, universeId, 'Alpha Reel', FILM)
    await game(page, universeId, 'Mid Serial', SERIES)
    await game(page, universeId, 'Omega Reel', FILM)

    await page.goto(`/app/universes/${universeId}/cinema`)
    await expect.poll(() => names(page)).toEqual(['Alpha Reel', 'Mid Serial', 'Omega Reel'])
    await expect(page.locator('.filmstrip__frame')).toHaveCount(3)

    // The only series has no neighbour of its kind to pass.
    const serial = page.getByTestId('projects-item').filter({ hasText: 'Mid Serial' })
    await serial.getByTestId('shelf-actions').click()
    await expect(serial.getByTestId('shelf-move-up')).toHaveCount(0)
    await expect(serial.getByTestId('shelf-move-down')).toHaveCount(0)
    await page.keyboard.press('Escape')

    // A film moves past the next film; the series keeps its place between them.
    const first = page.getByTestId('projects-item').filter({ hasText: 'Alpha Reel' })
    await first.getByTestId('shelf-actions').click()
    await expect(first.getByTestId('shelf-move-up')).toHaveCount(0)
    await first.getByTestId('shelf-move-down').click()
    await expect.poll(() => names(page)).toEqual(['Omega Reel', 'Mid Serial', 'Alpha Reel'])
    await expect(page.getByTestId('shelf-announcement')).toContainText('2 of 2')

    await page.reload()
    await expect.poll(() => names(page)).toEqual(['Omega Reel', 'Mid Serial', 'Alpha Reel'])
  })

  test('a comic takes a portrait picture as its issue cover', async ({ page }) => {
    await signUp(page)
    const universeId = await world(page)
    await game(page, universeId, 'Inkfall', COMIC)

    await page.goto(`/app/universes/${universeId}/comic`)
    const card = page.getByTestId('projects-item')
    await expect(card.locator('.comic__cover img')).toHaveCount(0)
    await card.getByTestId('shelf-add-picture').click()
    await setCover(page, 'issue.png')
    const cover = card.locator('.comic__cover img')
    await expect(cover).toBeVisible()
    // Cut to the issue's 2:3, whatever the shape it came in (800 square here).
    await expect
      .poll(() =>
        cover.evaluate((img: HTMLImageElement) =>
          Math.round((img.naturalWidth / img.naturalHeight) * 300),
        ),
      )
      .toBe(200)
    await card.getByTestId('shelf-actions').click()
    await expect(card.getByTestId('shelf-cover')).toHaveText('Change picture')
  })
})
