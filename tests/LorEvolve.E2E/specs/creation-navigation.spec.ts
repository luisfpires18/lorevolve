import { expect, test, type Page } from '@playwright/test'
import { chooseFromMenu } from './support/rowMenu'

/**
 * Issue #272: Creation (Writing, Gaming, Cinema, Comic) and World Building's Game Entities are offered only while the
 * universe has a project of the matching kind. Project count decides, never entity count. Kind travels as a number:
 * 0 Writing, 1 Game, 2 Series, 3 Film, 4 Comic.
 */

const PASSWORD = 'Test-password-123!'
const GAME = 1
const SERIES = 2
const FILM = 3
const COMIC = 4

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('creation')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function api<T>(page: Page, method: string, path: string, data?: object) {
  const response = await page.request.fetch(path, { method, data })
  expect(response.ok(), `${method} ${path}`).toBe(true)
  return (await response.json()) as T
}

async function universe(page: Page) {
  return (
    await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Creationworld '),
      description: null,
    })
  ).id
}

async function project(page: Page, universeId: string, name: string, kind: number) {
  return await api<{ id: string }>(page, 'POST', '/api/projects', {
    name,
    kind,
    lifecycle: 0,
    subtype: null,
    summary: '',
    universeId,
    expectedVersion: null,
  })
}

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Universe', exact: true })
const creationLinks = (page: Page) => sidebar(page).getByTestId('sidebar-creation').getByRole('link')

test.describe('Conditional Creation and Game Entities navigation', () => {
  test('a new universe shows no Creation heading and no Game Entities', async ({ page }) => {
    await signUp(page)
    const id = await universe(page)
    await page.goto(`/app/universes/${id}`)
    await expect(sidebar(page).getByTestId('workspace-projects')).toBeVisible()
    await expect(sidebar(page).getByTestId('sidebar-creation')).toHaveCount(0)
    await expect(sidebar(page).getByTestId('workspace-game-entities')).toHaveCount(0)
  })

  test('a Game project with no entities offers Gaming and Game Entities, the latter right after Types', async ({
    page,
  }) => {
    await signUp(page)
    const id = await universe(page)
    await project(page, id, 'Quest', GAME)
    await page.goto(`/app/universes/${id}`)
    await expect(creationLinks(page)).toHaveText(['Gaming'])
    await expect(
      sidebar(page).getByTestId('sidebar-world-building').getByRole('link'),
    ).toHaveText([
      'Lore',
      'Types',
      'Game Entities',
      'Family Tree',
      'Maps',
      'Timeline',
      'World Logic',
      'Ideas',
    ])
  })

  test('a Film and a Series give one Cinema item', async ({ page }) => {
    await signUp(page)
    const id = await universe(page)
    await project(page, id, 'Reel', FILM)
    await project(page, id, 'Serial', SERIES)
    await page.goto(`/app/universes/${id}`)
    await expect(creationLinks(page)).toHaveText(['Cinema'])
    await expect(sidebar(page).getByTestId('workspace-cinema')).toHaveCount(1)
  })

  test('a Comic project offers Comic only', async ({ page }) => {
    await signUp(page)
    const id = await universe(page)
    await project(page, id, 'Panels', COMIC)
    await page.goto(`/app/universes/${id}`)
    await expect(creationLinks(page)).toHaveText(['Comic'])
    await expect(sidebar(page).getByTestId('workspace-game-entities')).toHaveCount(0)
  })

  test('Writing follows a story to the Trash and back without a reload', async ({ page }) => {
    await signUp(page)
    const id = await universe(page)
    await api(page, 'POST', `/api/universes/${id}/stories`, {
      title: 'Only Tale',
      premise: 'One.',
      status: 1,
    })
    await page.goto(`/app/universes/${id}/writing`)
    await expect(creationLinks(page)).toHaveText(['Writing'])

    await page.getByRole('link', { name: /Only Tale/ }).click()
    await chooseFromMenu(page, 'delete-story')
    await page.getByTestId('confirm-dialog-confirm').click()
    await expect(sidebar(page).getByTestId('sidebar-creation')).toHaveCount(0)

    await sidebar(page).getByTestId('workspace-trash').click()
    await page.getByTestId('restore-Only Tale').click()
    await expect(creationLinks(page)).toHaveText(['Writing'])
  })

  test('another universe is not affected by a Game project', async ({ page }) => {
    await signUp(page)
    const withGame = await universe(page)
    const without = await universe(page)
    await project(page, withGame, 'Quest', GAME)

    await page.goto(`/app/universes/${without}`)
    await expect(sidebar(page).getByTestId('workspace-projects')).toBeVisible()
    await expect(sidebar(page).getByTestId('workspace-gaming')).toHaveCount(0)
    await expect(sidebar(page).getByTestId('workspace-game-entities')).toHaveCount(0)

    await page.goto(`/app/universes/${withGame}`)
    await expect(sidebar(page).getByTestId('workspace-gaming')).toBeVisible()
  })

  test('each destination lists only its own kinds', async ({ page }) => {
    await signUp(page)
    const id = await universe(page)
    await project(page, id, 'Reel', FILM)
    await project(page, id, 'Serial', SERIES)
    await project(page, id, 'Quest', GAME)
    await api(page, 'POST', `/api/universes/${id}/stories`, {
      title: 'Only Tale',
      premise: 'One.',
      status: 1,
    })
    await page.goto(`/app/universes/${id}`)

    await sidebar(page).getByTestId('workspace-cinema').click()
    const list = page.getByTestId('projects-list')
    await expect(list.getByRole('link')).toHaveCount(2)
    await expect(list).toContainText('Reel')
    await expect(list).toContainText('Serial')
    await expect(list).not.toContainText('Quest')

    await sidebar(page).getByTestId('workspace-writing').click()
    await expect(list.getByRole('link')).toHaveCount(1)
    await expect(list).toContainText('Only Tale')
    await expect(list).not.toContainText('Quest')
  })
})
