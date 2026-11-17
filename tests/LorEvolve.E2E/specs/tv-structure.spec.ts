import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #291: TV Show and Limited Series structures. A TV Show holds seasons of episodes with optional acts, scenes and
 * beats, a Limited Series starts at episodes, order and text survive a reload, and a Series with no format keeps its
 * seasons.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('tvst')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function newWorld(page: Page) {
  const response = await page.request.post('/api/universes', {
    data: { name: unique('Tvworld '), description: null },
  })
  return ((await response.json()) as { id: string }).id
}

async function newSeries(page: Page, universeId: string, format: string | null) {
  const response = await page.request.post('/api/projects', {
    data: {
      name: unique('Series '),
      kind: 2,
      lifecycle: 0,
      subtype: null,
      summary: null,
      universeId,
      expectedVersion: null,
      format,
    },
  })
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { id: string }).id
}

async function saveEditor(page: Page, title: string, body?: string) {
  const editor = page.getByTestId('project-node-editor')
  await expect(editor).toBeVisible()
  await editor.getByTestId('project-node-title').fill(title)
  if (body !== undefined) await editor.getByTestId('project-node-body').fill(body)
  await editor.getByTestId('project-node-save').click()
  await expect(editor).toBeHidden()
}

const idOf = async (row: ReturnType<Page['locator']>) =>
  ((await row.getAttribute('data-testid')) ?? '').replace('project-node-', '')

test('a tv show outline holds seasons, episodes, an optional act and scenes, and keeps them after a reload', async ({
  page,
}) => {
  await signUp(page)
  const world = await newWorld(page)
  const show = await newSeries(page, world, 'tv-show')

  await page.goto(`/app/universes/${world}/projects/${show}/structure`)
  const outline = page.getByTestId('project-outline')
  await expect(outline.getByTestId('project-node-add-season')).toBeVisible()
  await expect(outline.getByTestId('project-node-add-episode')).toHaveCount(0)

  await outline.getByTestId('project-node-add-season').click()
  await saveEditor(page, 'Season One')
  await outline.getByTestId('project-node-add-season').click()
  await saveEditor(page, 'Season Two')

  const seasons = outline.getByTestId('project-outline-list-root').locator(':scope > li')
  await expect(seasons).toHaveCount(2)
  const seasonOne = await idOf(seasons.filter({ hasText: 'Season One' }))
  const seasonTwo = await idOf(seasons.filter({ hasText: 'Season Two' }))

  await outline.getByTestId(`project-node-add-episode-${seasonOne}`).click()
  await saveEditor(page, 'Pilot', 'Cold open')
  const pilot = outline
    .getByTestId(`project-node-${seasonOne}`)
    .locator('li')
    .filter({ hasText: 'Pilot' })
  const pilotId = await idOf(pilot)

  // An episode offers an act and a scene.
  await outline.getByTestId(`project-node-add-act-${pilotId}`).click()
  await saveEditor(page, 'Teaser')
  await outline.getByTestId(`project-node-add-scene-${pilotId}`).click()
  await saveEditor(page, 'Kitchen')

  // Season Two moves up.
  await outline.getByTestId(`project-node-actions-${seasonTwo}`).click()
  await outline.getByTestId(`project-node-up-${seasonTwo}`).click()
  await expect(seasons.first()).toContainText('Season Two')

  await page.reload()
  await expect(seasons.first()).toContainText('Season Two')
  const reloaded = outline.getByTestId(`project-node-${seasonOne}`)
  await expect(reloaded).toContainText('Pilot')
  await expect(reloaded).toContainText('Teaser')
  await expect(reloaded).toContainText('Kitchen')

  await reloaded
    .locator('li')
    .filter({ hasText: 'Pilot' })
    .getByRole('button', { name: 'Edit' })
    .first()
    .click()
  await expect(page.getByTestId('project-node-body')).toHaveValue('Cold open')
})

test('a limited series starts at episodes and a series with no format keeps its seasons', async ({
  page,
}) => {
  await signUp(page)
  const world = await newWorld(page)

  const limited = await newSeries(page, world, 'limited-series')
  await page.goto(`/app/universes/${world}/projects/${limited}/structure`)
  const outline = page.getByTestId('project-outline')
  await expect(outline.getByTestId('project-node-add-episode')).toBeVisible()
  await expect(outline.getByTestId('project-node-add-season')).toHaveCount(0)

  const legacy = await newSeries(page, world, null)
  await page.goto(`/app/universes/${world}/projects/${legacy}/structure`)
  await expect(page.getByTestId('project-seasons')).toBeVisible()
  await expect(page.getByTestId('project-outline')).toHaveCount(0)
})
