import { expect, test, type Page } from '@playwright/test'
import { png } from './support/png'
import { acceptConfirm } from './support/confirm'

/**
 * Issue #295: the Comic page and panel editor. A one-shot page with three panels: every script field saved and read
 * back after a reload, page and panel art added, and removing a panel's art keeps its script and shows the placeholder.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('comicpe')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function api<T>(page: Page, method: 'POST', path: string, data: unknown) {
  const response = await page.request.fetch(path, { method, data })
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()) as T
}

function picture(name: string) {
  return {
    name,
    mimeType: 'image/png',
    buffer: png(320, 240, (x) => (x < 160 ? [200, 60, 40] : [40, 90, 200])),
  }
}

async function addArt(page: Page, nodeId: string, name: string) {
  await page.getByTestId(`field-image-${nodeId}-input`).setInputFiles(picture(name))
  const dialog = page.getByTestId('image-crop-dialog')
  await expect(dialog.getByTestId('image-crop-confirm')).toBeEnabled()
  await dialog.getByTestId('image-crop-confirm').click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByTestId(`field-image-${nodeId}-preview`)).toBeVisible()
}

const SCRIPT = ['visual', 'dialogue', 'caption', 'sfx', 'notes'] as const

test('a page edits three panels, holds page and panel art, and keeps the script without art', async ({
  page,
}) => {
  await signUp(page)
  const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
    name: unique('Comicworld '),
    description: null,
  })
  const project = await api<{ id: string }>(page, 'POST', '/api/projects', {
    name: unique('Comic '),
    kind: 4,
    lifecycle: 0,
    subtype: null,
    summary: null,
    universeId: world.id,
    expectedVersion: null,
    format: 'one-shot',
  })
  const comicPage = await api<{ id: string }>(
    page,
    'POST',
    `/api/projects/${project.id}/structure`,
    {
      level: 'page',
      parentId: null,
    },
  )
  const panels: string[] = []
  for (let index = 0; index < 3; index++) {
    panels.push(
      (
        await api<{ id: string }>(page, 'POST', `/api/projects/${project.id}/structure`, {
          level: 'panel',
          parentId: comicPage.id,
        })
      ).id,
    )
  }

  const openPage = async () => {
    await page.goto(`/app/universes/${world.id}/projects/${project.id}/structure`)
    await page.getByTestId(`project-node-open-${comicPage.id}`).click()
    await expect(page.getByTestId('comic-page-editor')).toBeVisible()
  }

  await openPage()
  for (const [index, id] of panels.entries()) {
    const card = page.getByTestId(`comic-panel-${id}`)
    for (const part of SCRIPT) {
      await card.getByTestId(`comic-panel-${id}-${part}`).fill(`${part} ${index}`)
    }
    await card.getByTestId(`comic-panel-${id}-save`).click()
    await expect(card.getByTestId(`comic-panel-${id}-status`)).toBeVisible()
    await expect(page.getByTestId(`comic-art-placeholder-${id}`)).toBeVisible()
  }

  await addArt(page, comicPage.id, 'page.png')
  await addArt(page, panels[0], 'panel.png')

  await page.reload()
  await openPage()
  for (const [index, id] of panels.entries()) {
    for (const part of SCRIPT) {
      await expect(page.getByTestId(`comic-panel-${id}-${part}`)).toHaveValue(`${part} ${index}`)
    }
  }
  await expect(page.getByTestId(`field-image-${comicPage.id}-preview`)).toBeVisible()
  await expect(page.getByTestId(`field-image-${panels[0]}-preview`)).toBeVisible()

  await page.getByTestId(`field-image-${panels[0]}-remove`).click()
  await acceptConfirm(page)
  await expect(page.getByTestId(`comic-art-placeholder-${panels[0]}`)).toBeVisible()

  await page.reload()
  await openPage()
  await expect(page.getByTestId(`comic-art-placeholder-${panels[0]}`)).toBeVisible()
  await expect(page.getByTestId(`comic-panel-${panels[0]}-dialogue`)).toHaveValue('dialogue 0')
})
