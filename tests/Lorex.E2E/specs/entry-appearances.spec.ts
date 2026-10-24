import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'
import { acceptConfirm } from './support/confirm'
import { png, type Rgb } from './support/png'

/**
 * An entry's appearances (Issue #43): one look - a label, notes, an ordered gallery - belonging to the eras and forms the author
 * ticks. Pictures are stored like the entry's own, added, ordered and deleted one at a time, and never versioned.
 *
 * Each test registers its own account and builds its world through the API, then works on the entry's Eras view.
 */

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

function picture(name: string, rgb: Rgb) {
  return { name, mimeType: 'image/png', buffer: png(240, 160, () => rgb) }
}

async function post<T = { id: string }>(
  page: Page,
  path: string,
  data: unknown,
  method: 'post' | 'put' = 'post',
) {
  const response = await page.request[method](path, { data })
  expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
  return (await response.json()) as T
}

/** Goku with two eras and one form, in a fresh universe. */
async function world(page: Page) {
  const username = unique('looks')
  const password = makeTestPassword()
  expect(
    (
      await page.request.post('/api/auth/register', {
        data: { username, email: `${username}@example.test`, password },
      })
    ).ok(),
  ).toBe(true)
  expect(
    (
      await page.request.post('/api/auth/login', { data: { usernameOrEmail: username, password } })
    ).ok(),
  ).toBe(true)

  const u = (
    await post(page, '/api/universes', { name: unique('Planet Vegeta '), description: null })
  ).id
  const types = (await (await page.request.get(`/api/universes/${u}/entity-types`)).json()) as {
    id: string
    name: string
  }[]
  const goku = (
    await post(page, `/api/universes/${u}/entities`, {
      entityTypeId: types.find((type) => type.name === 'Character')!.id,
      name: 'Goku',
      summary: null,
      canonStatus: 2,
      aliases: [],
      tags: [],
      fields: [],
    })
  ).id
  await post(
    page,
    `/api/universes/${u}/entities/${goku}/progression`,
    {
      eras: ['Saiyan Saga', 'Frieza Saga'].map((name) => ({
        id: null,
        name,
        description: null,
        start: null,
        end: null,
        storyIds: [],
        sceneIds: [],
        fields: [],
      })),
      expectedVersion: 0,
      forms: [
        {
          id: null,
          name: 'Super Saiyan',
          description: null,
          unlockEraId: null,
          unlockSceneId: null,
          unlockMomentId: null,
          eraIds: [],
          sceneIds: [],
        },
      ],
    },
    'put',
  )
  return { u, goku, entry: `/app/universes/${u}/lore/${goku}/progression` }
}

test('a look belongs to the eras and forms ticked and holds an ordered gallery', async ({
  page,
}) => {
  const w = await world(page)
  await page.goto(w.entry)

  await page.getByTestId('add-appearance').click()
  const form = page.getByTestId('appearance-form')
  await form.getByTestId('appearance-name-input').fill('Battle armour')
  await form.getByTestId('appearance-description-input').fill('Saiyan armour from Vegeta.')
  await expect(form.getByTestId('appearance-unlock')).toHaveCount(0)
  await form.getByTestId('appearance-era-Frieza Saga').check()
  await form.getByTestId('appearance-form-Super Saiyan').check()
  await form.getByTestId('save-appearance').click()
  await expect(form).toBeHidden()

  const look = page.getByTestId('appearance-Battle armour')
  await expect(look.getByTestId('appearance-eras')).toHaveText('Frieza Saga')
  await expect(look.getByTestId('appearance-forms')).toHaveText('Super Saiyan')
  await expect(page.getByTestId('form-Super Saiyan').getByTestId('form-looks')).toHaveText(
    'Battle armour',
  )

  // Two pictures at once, then the second put first.
  await look
    .getByTestId('appearance-picture-input')
    .setInputFiles([picture('red.png', [200, 40, 40]), picture('blue.png', [40, 40, 200])])
  const thumbs = look.getByTestId('appearance-gallery').locator('img')
  await expect(thumbs).toHaveCount(2)
  const before = await thumbs.evaluateAll((images) => images.map((one) => one.getAttribute('src')))
  await look.getByTestId('picture-actions-2').click()
  await page.getByRole('button', { name: 'Move earlier' }).click()
  await expect
    .poll(() => thumbs.evaluateAll((images) => images.map((one) => one.getAttribute('src'))))
    .toEqual([before[1], before[0]])

  // A thumbnail opens the original whole.
  await look.getByRole('button', { name: /View Battle armour, picture 1 of 2/ }).click()
  await expect(page.getByTestId('image-viewer')).toBeVisible()
  await page.getByTestId('image-viewer-close').click()
  await expect(page.getByTestId('image-viewer')).toBeHidden()

  // The Frieza Saga shows the look; the Saiyan Saga does not.
  await page.getByTestId('era-nav-Frieza Saga').click()
  await expect(
    page.getByTestId('era-appearances').getByTestId('era-appearances-Battle armour'),
  ).toBeVisible()
  await page.getByTestId('era-nav-Saiyan Saga').click()
  await expect(page.getByTestId('era-panel')).toBeVisible()
  await expect(page.getByTestId('era-appearances')).toHaveCount(0)

  // A picture is deleted for good after a confirmation; removing the look deletes the rest with it.
  await page.getByTestId('era-nav-main').click()
  await look.getByTestId('picture-actions-1').click()
  await page.getByTestId('remove-picture').click()
  await acceptConfirm(page, 'picture 1')
  await expect(thumbs).toHaveCount(1)

  await page.getByTestId('appearance-actions-Battle armour').click()
  await page.getByTestId('remove-appearance').click()
  await acceptConfirm(page, 'Battle armour')
  await expect(look).toHaveCount(0)
  await expect(page.getByTestId('form-Super Saiyan').getByTestId('form-looks')).toHaveCount(0)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('a gallery fits a 390px column', async ({ page }) => {
    const w = await world(page)
    const saved = await post<{ version: number; appearances: { id: string }[] }>(
      page,
      `/api/universes/${w.u}/entities/${w.goku}/progression`,
      {
        eras: null,
        expectedVersion: 1,
        appearances: [
          { id: null, label: 'Gi', notes: null, eraIds: [], formIds: [], sceneIds: [] },
        ],
      },
      'put',
    )
    const images = `/api/universes/${w.u}/entities/${w.goku}/appearances/${saved.appearances[0].id}/images`
    for (const rgb of [
      [200, 40, 40],
      [40, 200, 40],
      [40, 40, 200],
      [200, 200, 40],
      [40, 200, 200],
    ] as Rgb[]) {
      const response = await page.request.put(images, {
        multipart: { file: picture('look.png', rgb) },
      })
      expect(response.ok(), await response.text()).toBe(true)
    }

    await page.goto(w.entry)
    await expect(
      page.getByTestId('appearance-Gi').getByTestId('appearance-gallery').locator('img'),
    ).toHaveCount(5)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
