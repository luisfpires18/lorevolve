import { expect, test, type Page } from '@playwright/test'
import { png } from './support/png'
import { acceptConfirm } from './support/confirm'

/**
 * Issue #286: a game entry opens its own details page - name, type, full description, the stored image or a
 * placeholder - and the same shell serves every type. A wrong id, or another game's id, is a safe not-found.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('gamedet')
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

/** A game with one type per name, each holding the given entries. Kind 1 is Game and lifecycle 1 is Active. */
async function game(
  page: Page,
  universeId: string,
  name: string,
  types: Record<string, { name: string; summary: string | null }[]>,
) {
  const created = await api<{ id: string }>(page, 'POST', '/api/projects', {
    name,
    kind: 1,
    lifecycle: 1,
    subtype: null,
    summary: '',
    universeId,
    expectedVersion: null,
  })
  const ids: Record<string, string> = {}
  for (const [typeName, entries] of Object.entries(types)) {
    const type = await api<{ id: string }>(
      page,
      'POST',
      `/api/projects/${created.id}/entity-types`,
      {
        name: typeName,
        description: null,
        icon: null,
        accentColor: null,
        parentId: null,
      },
    )
    for (const entry of entries) {
      const made = await api<{ id: string }>(page, 'POST', `/api/projects/${created.id}/entities`, {
        entityTypeId: type.id,
        name: entry.name,
        summary: entry.summary,
      })
      ids[entry.name] = made.id
    }
  }
  return { id: created.id, ids }
}

test.describe('Game entity details', () => {
  test("a card opens the entry's page, one shell serves every type, and Back returns to its row", async ({
    page,
  }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Detworld '),
      description: null,
    })
    const description = 'First line of the lore.\nSecond line of the lore.'
    const alpha = await game(page, world.id, 'Alpha game', {
      Units: [{ name: 'Bram', summary: description }],
      Buildings: [{ name: 'Keep', summary: null }],
    })
    const base = `/app/universes/${world.id}/game-entities/${alpha.id}`

    await page.goto(base)
    await page.getByRole('link', { name: /Units/ }).first().click()
    await page.getByTestId(`project-entry-open-${alpha.ids['Bram']}`).click()
    await expect(page).toHaveURL(`${base}/${alpha.ids['Bram']}`)
    await expect(page.getByTestId('entry-name')).toHaveText('Bram')
    await expect(page.getByTestId('entry-type')).toContainText('Units')
    const text = page.getByTestId('entry-summary')
    await expect(text).toContainText('First line of the lore.')
    await expect(text).toContainText('Second line of the lore.')
    await expect(page.getByTestId('entry-image')).toHaveCount(0)

    // Back goes to the entry's own type, with its row listed.
    await page.getByTestId('entry-type').click()
    await expect(page).toHaveURL(/\?type=/)
    await expect(page.getByTestId(`project-entry-${alpha.ids['Bram']}`)).toBeVisible()

    // A second type, a bare entry: the same page, with no summary and no picture.
    await page.goto(`${base}/${alpha.ids['Keep']}`)
    await expect(page.getByTestId('entry-name')).toHaveText('Keep')
    await expect(page.getByTestId('entry-summary')).toHaveCount(0)
    await expect(page.getByTestId('entry-image')).toHaveCount(0)
  })

  test("an editor deletes the entry from its page and lands back on the game's directory", async ({
    page,
  }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Detworld '),
      description: null,
    })
    const alpha = await game(page, world.id, 'Alpha game', {
      Units: [{ name: 'Bastion', summary: null }],
    })
    const base = `/app/universes/${world.id}/game-entities/${alpha.id}`
    await page.goto(`${base}/${alpha.ids['Bastion']}`)
    await page.getByTestId('entity-actions').click()
    await page.getByTestId('trash-entity').click()
    await acceptConfirm(page, 'Bastion')
    await expect(page).toHaveURL(base)
    await page.goto(`${base}/${alpha.ids['Bastion']}`)
    await expect(page.getByTestId('entity-missing')).toBeVisible()
  })
  test("the project's own Entities tab opens the same page, inside the project", async ({
    page,
  }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Detworld '),
      description: null,
    })
    const alpha = await game(page, world.id, 'Alpha game', {
      Units: [{ name: 'Bastion', summary: 'A walled post.' }],
    })
    const entities = `/app/universes/${world.id}/projects/${alpha.id}/entities`

    // A game has no overview: its address lands on Entities, whose type cards are Lore's cards.
    await page.goto(`/app/universes/${world.id}/projects/${alpha.id}/overview`)
    await expect(page).toHaveURL(entities)
    await page
      .getByTestId('lore-type-cards')
      .getByTestId('lore-type-card')
      .filter({ hasText: 'Units' })
      .click()
    await page.getByTestId(`project-entry-open-${alpha.ids['Bastion']}`).click()
    await expect(page).toHaveURL(`${entities}/${alpha.ids['Bastion']}`)
    await expect(page.getByTestId('entry-name')).toHaveText('Bastion')
    await expect(page.getByTestId('entry-summary')).toContainText('A walled post.')
    await expect(page.getByTestId('projecttab-entities')).toHaveAttribute('aria-current', 'page')

    // Back from the type link lands on the project's own list, the row listed.
    await page.getByTestId('entry-type').click()
    await expect(page).toHaveURL(new RegExp(`^[^?]*${entities}\\?type=`))
    await expect(page.getByTestId(`project-entry-${alpha.ids['Bastion']}`)).toBeVisible()

    // Only `entities/<entryId>` is a sub-address. A deeper one, an empty one, or one under another view falls back to
    // the project's first view, as any unknown address always has (#192): Entities for a game.
    const overview = `/app/universes/${world.id}/projects/${alpha.id}/overview`
    for (const wrong of [
      `${entities}/${alpha.ids['Bastion']}/more`,
      `${entities}/`,
      `${overview}/${alpha.ids['Bastion']}`,
    ]) {
      await page.goto(wrong)
      await expect(page).toHaveURL(entities)
      await expect(page.getByTestId('entry-name')).toHaveCount(0)
    }
  })

  test("an editor adds the entry's own picture on its page, as on a Lore entry, and the card shows it", async ({
    page,
  }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Detworld '),
      description: null,
    })
    const alpha = await game(page, world.id, 'Alpha game', {
      Units: [{ name: 'Bastion', summary: null }],
    })
    const entities = `/app/universes/${world.id}/projects/${alpha.id}/entities`
    const entry = alpha.ids['Bastion']

    await page.goto(`${entities}/${entry}`)
    await expect(page.getByTestId('entry-image')).toHaveCount(0)
    // As on a Lore entry, the picture is changed while editing.
    await expect(page.getByTestId('entity-image-input')).toHaveCount(0)
    await page.getByTestId('edit-entity').click()
    await page.getByTestId('entity-image-input').setInputFiles({
      name: 'bastion.png',
      mimeType: 'image/png',
      buffer: png(400, 300, (x) => (x < 200 ? [200, 60, 40] : [40, 90, 200])),
    })
    const dialog = page.getByTestId('image-crop-dialog')
    await expect(dialog.getByTestId('image-crop-confirm')).toBeEnabled()
    await dialog.getByTestId('image-crop-confirm').click()
    await expect(dialog).toHaveCount(0)

    // The control now offers Replace and Remove.
    await expect(page.getByTestId('entity-image-remove')).toBeVisible()

    // Saving the rest of the entry after the picture changed is not a conflict, and the page draws it large, through
    // Lore's own entry image route.
    await page.getByTestId('save-entity').click()
    await expect(page.getByTestId('entry-form')).toHaveCount(0)
    await expect(page.getByTestId('entry-conflict')).toHaveCount(0)
    const picture = page.getByTestId('entry-image').locator('img')
    await expect(picture).toHaveAttribute('src', new RegExp(`/entities/${entry}/image/`))

    // The type's list shows it on the entry's card, as a Lore card does.
    const types = await api<{ id: string; name: string }[]>(
      page,
      'GET',
      `/api/projects/${alpha.id}/entity-types`,
    )
    await page.goto(`${entities}?type=${types.find((one) => one.name === 'Units')!.id}`)
    await expect(page.getByTestId(`project-entry-${entry}`).locator('img')).toHaveAttribute(
      'src',
      new RegExp(`/entities/${entry}/image/`),
    )

    // Removed, it is gone from the page again.
    await page.goto(`${entities}/${entry}`)
    await page.getByTestId('edit-entity').click()
    await page.getByTestId('entity-image-remove').click()
    await acceptConfirm(page)
    await page.getByTestId('cancel-entity').click()
    await expect(page.getByTestId('entry-form')).toHaveCount(0)
    await expect(page.getByTestId('entry-image')).toHaveCount(0)
  })

  test('an entry with an uploaded Image field picture shows it on the page', async ({ page }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Detworld '),
      description: null,
    })
    const alpha = await game(page, world.id, 'Alpha game', { Units: [] })
    const types = await api<{ id: string; name: string }[]>(
      page,
      'GET',
      `/api/projects/${alpha.id}/entity-types`,
    )
    const typeId = types.find((one) => one.name === 'Units')!.id
    // Kind 8 is Image; shape 2 is 4:3.
    const withField = await api<{ fields: { id: string; name: string }[] }>(
      page,
      'POST',
      `/api/projects/${alpha.id}/entity-types/${typeId}/fields`,
      {
        name: 'Cover',
        kind: 8,
        isRequired: false,
        options: null,
        imageShape: 2,
      },
    )
    const cover = withField.fields.find((one) => one.name === 'Cover')!.id

    // Same journey as project-field-images.spec.ts: the picture is held in the new entry form, then uploaded.
    const base = `/app/universes/${world.id}/game-entities/${alpha.id}`
    await page.goto(`${base}/new?type=${typeId}`)
    await page.getByLabel('Name', { exact: true }).fill('Pictured')
    await page.getByTestId(`field-image-${cover}-input`).setInputFiles({
      name: 'cover.png',
      mimeType: 'image/png',
      buffer: png(400, 300, (x) => (x < 200 ? [200, 60, 40] : [40, 90, 200])),
    })
    const dialog = page.getByTestId('image-crop-dialog')
    await expect(dialog.getByTestId('image-crop-confirm')).toBeEnabled()
    await dialog.getByTestId('image-crop-confirm').click()
    await expect(dialog).toHaveCount(0)
    await page.getByTestId('save-entity').click()
    await page.waitForURL(new RegExp(`${base}/[0-9a-f-]{36}$`))
    await expect(page.getByTestId(`entry-field-image-${cover}`).locator('img')).toBeVisible()
  })

  test("a random id, or another game's entry, is a plain not-found", async ({ page }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Detworld '),
      description: null,
    })
    const alpha = await game(page, world.id, 'Alpha game', {
      Units: [{ name: 'Bram', summary: null }],
    })
    const beta = await game(page, world.id, 'Beta game', {
      Beasts: [{ name: 'Secretname', summary: 'Hidden text' }],
    })
    const base = `/app/universes/${world.id}/game-entities/${alpha.id}`

    await page.goto(`${base}/00000000-0000-0000-0000-000000000000`)
    await expect(page.getByTestId('entity-missing')).toBeVisible()

    await page.goto(`${base}/${beta.ids['Secretname']}`)
    await expect(page.getByTestId('entity-missing')).toBeVisible()
    await expect(page.getByText('Secretname')).toHaveCount(0)
    await expect(page.getByText('Hidden text')).toHaveCount(0)
  })
})
