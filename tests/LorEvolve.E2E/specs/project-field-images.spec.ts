import { expect, test, type Page } from '@playwright/test'
import { png } from './support/png'
import { acceptConfirm } from './support/confirm'

/**
 * Issue #238: an entry type can have Image fields, each holding one picture cropped to the field's own shape.
 *
 * The journey an author walks on a project: a type gets an Image field cropped 4:3 and a second one cropped freely, a
 * new entry is created with a picture in each (held until the entry exists, then uploaded), the pictures are read
 * back on the entry, and one of them is taken away again.
 */

const PASSWORD = 'Test-password-123!'

/** Kind 8 is Image. The crop shapes travel as numbers: 0 is Free and 2 is 4:3. */
const IMAGE_KIND = 8
const FREE = 0
const FOUR_BY_THREE = 2

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('fieldimg')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return username
}

async function api<T>(page: Page, method: string, path: string, data?: object) {
  const response = await page.request.fetch(path, { method, data })
  expect(response.ok(), `${method} ${path}`).toBe(true)
  return (await response.json()) as T
}

function picture(name: string, width: number, height: number) {
  return {
    name,
    mimeType: 'image/png',
    buffer: png(width, height, (x) => (x < width / 2 ? [200, 60, 40] : [40, 90, 200])),
  }
}

/** Picks a file for an Image field and keeps the cropper's starting frame. */
async function addPicture(page: Page, fieldId: string, file: ReturnType<typeof picture>) {
  await page.getByTestId(`field-image-${fieldId}-input`).setInputFiles(file)
  const dialog = page.getByTestId('image-crop-dialog')
  await expect(dialog.getByTestId('image-crop-confirm')).toBeEnabled()
  await dialog.getByTestId('image-crop-confirm').click()
  await expect(dialog).toHaveCount(0)
}

test.describe('Image fields on project entries', () => {
  test('a type with two Image fields holds a picture in each, shows them, and lets one go', async ({
    page,
  }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Gameworld '),
      description: null,
    })
    const project = await api<{ id: string }>(page, 'POST', '/api/projects', {
      name: unique('Hollow Season '),
      kind: 1,
      lifecycle: 1,
      subtype: null,
      summary: '',
      universeId: world.id,
      expectedVersion: null,
    })
    const type = await api<{ id: string }>(
      page,
      'POST',
      `/api/projects/${project.id}/entity-types`,
      { name: 'Unit', description: null, icon: null, accentColor: null },
    )

    const fieldsPath = `/api/projects/${project.id}/entity-types/${type.id}/fields`
    await api(page, 'POST', fieldsPath, {
      name: 'Cover',
      kind: IMAGE_KIND,
      isRequired: false,
      options: null,
      imageShape: FOUR_BY_THREE,
    })
    const withFields = await api<{ fields: { id: string; name: string }[] }>(
      page,
      'POST',
      fieldsPath,
      { name: 'Banner', kind: IMAGE_KIND, isRequired: false, options: null, imageShape: FREE },
    )
    const cover = withFields.fields.find((field) => field.name === 'Cover')!.id
    const banner = withFields.fields.find((field) => field.name === 'Banner')!.id

    await page.goto(`/app/projects/${project.id}/entities?type=${type.id}`)
    await page.getByTestId('project-entry-add').click()
    await page.getByTestId('project-entry-new-name').fill('Sentinel')

    // The first picture is cropped to the field's 4:3 frame and held: the entry does not exist yet.
    await addPicture(page, cover, picture('cover.png', 400, 300))
    await expect(page.getByTestId(`field-image-${cover}-preview`)).toBeVisible()

    // The second field is Free, so its cropper opens on the picture's own shape.
    await addPicture(page, banner, picture('banner.png', 600, 200))
    await expect(page.getByTestId(`field-image-${banner}-preview`)).toBeVisible()

    await page.getByTestId('project-entry-new-save').click()

    // Created, then each held picture is uploaded; the entry's own page shows them, each labelled with the field's name.
    const row = page.getByTestId('project-entry-list').locator('> li', { hasText: 'Sentinel' })
    await expect(row).toBeVisible()
    await row.getByRole('link', { name: /Sentinel/ }).click()
    const coverImage = page.getByTestId(`game-entity-field-${cover}`).getByRole('img')
    const bannerImage = page.getByTestId(`game-entity-field-${banner}`).getByRole('img')
    await expect(coverImage).toHaveAttribute('alt', 'Picture for Cover')
    await expect(bannerImage).toHaveAttribute('alt', 'Picture for Banner')
    await expect
      .poll(() => coverImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0)
    await expect
      .poll(() => bannerImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0)
    // The two fields hold two different pictures.
    expect(await coverImage.getAttribute('src')).not.toBe(await bannerImage.getAttribute('src'))
    // One goes, from the Edit drawer; the other stays.
    await page.getByTestId('project-entity-edit').click()
    await page.getByTestId(`field-image-${banner}-remove`).click()
    await acceptConfirm(page)
    await expect(page.getByTestId(`field-image-${banner}-preview`)).toHaveCount(0)
    // And the removal is real: a fresh read of the page does not bring it back.
    await page.reload()
    await expect(page.getByTestId(`game-entity-field-${cover}`).getByRole('img')).toBeVisible()
    await expect(page.getByTestId(`game-entity-field-${banner}`).getByRole('img')).toHaveCount(0)
  })
  test('while an entry type change is unsaved, its Image field controls are disabled', async ({
    page,
  }) => {
    await signUp(page)
    const world = await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Gameworld '),
      description: null,
    })
    const u = `/api/universes/${world.id}`
    const types = await api<{ id: string; name: string }[]>(page, 'GET', `${u}/entity-types`)
    const character = types.find((type) => type.name === 'Character')!.id
    const location = types.find((type) => type.name === 'Location')!.id

    const withField = await api<{ fields: { id: string; name: string }[] }>(
      page,
      'POST',
      `${u}/entity-types/${location}/fields`,
      {
        name: 'Portrait',
        kind: IMAGE_KIND,
        isRequired: false,
        displayOrder: null,
        defaultValue: null,
        options: null,
        semantic: null,
        targetEntityTypeId: null,
        targetGroupId: null,
        imageShape: FREE,
      },
    )
    const portrait = withField.fields.find((field) => field.name === 'Portrait')!.id
    const entry = await api<{ id: string }>(page, 'POST', `${u}/entities`, {
      entityTypeId: character,
      name: 'Akron Wright',
      summary: null,
      canonStatus: 0,
      aliases: [],
      tags: [],
      fields: [],
    })

    await page.goto(`/app/universes/${world.id}/lore/${entry.id}`)
    await page.getByTestId('edit-entity').click()

    // Location is not the entry's saved type, so its Image field belongs to nothing yet: no picture may be created
    // or changed until the type change is saved.
    await page.getByLabel('Entry type').selectOption({ label: 'Location' })
    await expect(page.getByTestId(`field-image-${portrait}-input`)).toBeDisabled()
    await expect(page.getByTestId(`field-image-${portrait}-disabled-hint`)).toBeVisible()
  })
})
