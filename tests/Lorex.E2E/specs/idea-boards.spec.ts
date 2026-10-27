import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * Idea boards (ADR 0066): an account-owned canvas of notes, ideas and lore, saved whole, never lore.
 *
 * An author starts a board in a universe's Ideas, places a note, an idea and an entry, draws a line between two cards and
 * labels it, drags a card with the pointer and another with the arrow keys, and saves; a reload keeps it all. A save over
 * a board saved elsewhere is refused and the author chooses. On a phone the board is edited with a finger and read as a
 * list, with no sideways scroll.
 *
 * Each test registers its own account with a throwaway password.
 */

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('boards')
  const password = makeTestPassword()
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data })
  expect(response.ok(), `${path} answered ${response.status()}`).toBe(true)
  return (await response.json()) as { id: string }
}

/** A universe with one character and one idea of its own. */
async function seedWorld(page: Page) {
  const { id: universeId } = await post(page, '/api/universes', {
    name: unique('Hollowmere '),
    description: null,
    accentColor: '#4f6bd6',
  })
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string }[]
  await post(page, `/api/universes/${universeId}/entities`, {
    entityTypeId: types.find((type) => type.name === 'Character')!.id,
    name: 'Arlen',
    summary: null,
    canonStatus: 0,
    aliases: [],
    tags: [],
    fields: [],
  })
  await post(page, '/api/ideas', {
    title: 'Arlen keeps a secret',
    body: 'Something about the tower.',
    universeId,
    references: [],
    expectedUpdatedAt: null,
  })
  return universeId
}

function card(page: Page, name: string) {
  return page.locator(`[data-testid="board-card"][data-name="${name}"]`)
}

async function pick(page: Page, name: string) {
  const picker = page.getByTestId('board-picker')
  await picker.getByTestId('board-picker-search').fill(name)
  await picker.locator(`[data-testid="board-picker-option"][data-name="${name}"]`).click()
  await expect(picker).toHaveCount(0)
}

test('an author lays out a board in a universe, joins two cards and finds it all after a reload', async ({
  page,
}) => {
  await signUp(page)
  const universeId = await seedWorld(page)

  // From the universe's Ideas, the Boards tab, then a new board that starts in the universe.
  await page.goto(`/app/universes/${universeId}/ideas`)
  await page.getByTestId('ideas-tab-boards').click()
  await expect(page).toHaveURL(new RegExp(`/app/universes/${universeId}/ideas/boards$`))
  await expect(page.getByTestId('boards-empty')).toBeVisible()
  await page.getByTestId('new-board').first().click()

  await page.getByTestId('board-title').fill('Who betrays whom')
  await expect(page.getByTestId('board-universe')).toHaveValue(universeId)

  await page.getByTestId('board-add-note').click()
  await page.getByTestId('board-note-text').fill('The tower falls')
  await page.getByTestId('board-add-idea').click()
  await pick(page, 'Arlen keeps a secret')
  await page.getByTestId('board-add-entry').click()
  await pick(page, 'Arlen')
  await expect(page.getByTestId('board-card')).toHaveCount(3)
  await page.getByTestId('board-fit').click()

  // A line from the entry to the note, labelled.
  await card(page, 'Arlen').click()
  await page.getByTestId('board-connect').click()
  await expect(page.getByTestId('board-connecting')).toBeVisible()
  await card(page, 'The tower falls').click()
  await expect(page.getByTestId('board-line')).toHaveCount(1)
  await page.getByTestId('board-line-label').fill('why?')

  // The pointer drags a card; the keyboard moves another.
  const note = card(page, 'The tower falls')
  const before = (await note.boundingBox())!
  await page.mouse.move(before.x + 20, before.y + 20)
  await page.mouse.down()
  await page.mouse.move(before.x + 120, before.y + 220, { steps: 8 })
  await page.mouse.up()
  const after = (await note.boundingBox())!
  expect(after.y - before.y).toBeGreaterThan(150)

  const idea = card(page, 'Arlen keeps a secret')
  const ideaLeft = await idea.evaluate((element) => element.style.left)
  await idea.focus()
  await page.keyboard.press('Shift+ArrowRight')
  await expect(idea).toBeFocused()
  expect(await idea.evaluate((element) => element.style.left)).not.toBe(ideaLeft)
  const movedLeft = await idea.evaluate((element) => element.style.left)

  await page.getByTestId('board-save').click()
  await expect(page).toHaveURL(/\/ideas\/boards\/[0-9a-f-]{36}$/)
  await expect(page.getByTestId('board-heading')).toHaveText('Who betrays whom')

  await page.reload()
  await expect(page.getByTestId('board-card')).toHaveCount(3)
  await expect(page.getByTestId('board-line')).toHaveCount(1)
  expect(await card(page, 'Arlen keeps a secret').evaluate((element) => element.style.left)).toBe(
    movedLeft,
  )
  await expect(page.getByTestId('board-status')).toHaveText('Saved')

  // The list view reads the same board as plain text.
  await page.getByTestId('board-list-toggle').click()
  await expect(page.getByTestId('board-list-card')).toHaveCount(3)
  await expect(page.getByTestId('board-list')).toContainText('Joined to Arlen - why?')

  // The board is in the universe's list and in all boards.
  await page.goto(`/app/universes/${universeId}/ideas/boards`)
  await expect(
    page.locator('[data-testid="board-row"][data-title="Who betrays whom"]'),
  ).toContainText('3 cards')
  await page.goto('/app/ideas/boards')
  await expect(
    page.locator('[data-testid="board-row"][data-title="Who betrays whom"]'),
  ).toBeVisible()
})

test('a save over a board saved elsewhere is refused, and the author keeps theirs', async ({
  page,
}) => {
  await signUp(page)
  const board = await post(page, '/api/idea-boards', {
    title: 'Loose threads',
    universeId: null,
    cards: [],
    connections: [],
    expectedUpdatedAt: null,
  })

  await page.goto(`/app/ideas/boards/${board.id}`)
  await expect(page.getByTestId('board-heading')).toHaveText('Loose threads')
  await expect(page.getByTestId('board-add-entry')).toBeDisabled()

  // Saved from somewhere else meanwhile.
  const current = (await (await page.request.get(`/api/idea-boards/${board.id}`)).json()) as {
    updatedAt: string
  }
  const elsewhere = await page.request.put(`/api/idea-boards/${board.id}`, {
    data: {
      title: 'Loose threads, renamed',
      universeId: null,
      cards: [],
      connections: [],
      expectedUpdatedAt: current.updatedAt,
    },
  })
  expect(elsewhere.ok()).toBe(true)

  await page.getByTestId('board-add-note').click()
  await page.getByTestId('board-note-text').fill('Mine')
  await page.keyboard.press('Control+s')
  await expect(page.getByTestId('board-conflict')).toBeVisible()

  await page.getByTestId('board-keep-mine').click()
  await expect(page.getByTestId('board-conflict')).toHaveCount(0)
  await expect(page.getByTestId('board-status')).toHaveText(/Saved/)
  await page.reload()
  await expect(card(page, 'Mine')).toHaveCount(1)
  await expect(page.getByTestId('board-heading')).toHaveText('Loose threads')
})

test.describe('a board on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a card is added, joined and read as a list in a 390px column without sideways scroll', async ({
    page,
  }) => {
    await signUp(page)
    await page.goto('/app/ideas/boards/new')
    await page.getByTestId('board-title').fill('Pocket board')
    await page.getByTestId('board-add-note').click()
    await page.getByTestId('board-note-text').fill('First')
    await page.getByTestId('board-add-note').click()
    await page.getByTestId('board-note-text').fill('Second')
    await page.getByTestId('board-fit').tap()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)

    // Tap one card, draw a line, tap the other.
    await card(page, 'First').tap()
    await page.getByTestId('board-connect').tap()
    await card(page, 'Second').tap()
    await expect(page.getByTestId('board-line')).toHaveCount(1)

    await page.getByTestId('board-list-toggle').tap()
    await expect(page.getByTestId('board-list')).toContainText('Joined to Second')
    await page.getByTestId('board-save').tap()
    await expect(page).toHaveURL(/\/app\/ideas\/boards\/[0-9a-f-]{36}$/)
    await expect(page.getByTestId('board-heading')).toHaveText('Pocket board')
  })
})
