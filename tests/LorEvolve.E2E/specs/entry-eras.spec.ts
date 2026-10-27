import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'
import { acceptConfirm } from './support/confirm'

/**
 * An entry's eras (Issue #41): one character, one identity, read in creator-defined periods. An era holds only what changes
 * then, every other detail reads from the main profile and says so, and nothing is carried from one era into the next.
 *
 * Each test registers its own account and builds its world through the API, then works on the entry's Eras view.
 */

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
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

/** Goku with a Title of "Goku" and a Motto, in a fresh universe. */
async function world(page: Page) {
  const username = unique('eras')
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
  const character = types.find((type) => type.name === 'Character')!.id
  const field = async (name: string) => {
    const updated = await post<{ fields: { id: string; name: string }[] }>(
      page,
      `/api/universes/${u}/entity-types/${character}/fields`,
      { name, kind: 0, isRequired: false, displayOrder: null, defaultValue: null, options: null },
    )
    return updated.fields.find((each) => each.name === name)!.id
  }
  const title = await field('Title')
  const motto = await field('Motto')
  const text = (fieldDefinitionId: string, value: string) => ({
    fieldDefinitionId,
    text: value,
    number: null,
    boolean: null,
    date: null,
    optionIds: null,
    referencedEntityId: null,
  })
  const goku = (
    await post(page, `/api/universes/${u}/entities`, {
      entityTypeId: character,
      name: 'Goku',
      summary: null,
      canonStatus: 2,
      aliases: [],
      tags: [],
      fields: [text(title, 'Goku'), text(motto, 'Train hard')],
    })
  ).id
  return { u, goku, title, motto, entry: `/app/universes/${u}/lore/${goku}` }
}

test('a creator adds eras, reads each with its own details and comes back to one identity', async ({
  page,
}) => {
  const w = await world(page)
  await page.goto(w.entry)
  await page.getByTestId('entry-view-progression').click()
  await expect(page).toHaveURL(new RegExp(`/lore/${w.goku}/progression$`))
  await expect(page.getByTestId('progression-empty')).toBeVisible()

  // The first era, through its drawer: a name, what happens, a span, and one detail of its own.
  await page.getByTestId('add-era').click()
  const form = page.getByTestId('era-form')
  await form.getByTestId('era-name-input').fill('Saiyan Saga')
  await form
    .getByTestId('era-description-input')
    .fill('Raditz arrives; Goku learns he is a Saiyan.')
  await form.locator('#era-start-year').fill('737')
  await form.locator('#era-end-year').fill('762')
  await form.getByTestId('era-field-mode-Title').selectOption('set')
  await form.getByTestId('era-field-Title').locator('input').fill('Kakarot')
  await expect(form.getByTestId('era-field-Motto')).toContainText('Train hard')
  await form.getByTestId('save-era').click()
  await expect(form).toBeHidden()

  // A new era opens on itself, in the address.
  await expect(page).toHaveURL(/[?&]era=/)
  const panel = page.getByTestId('era-panel')
  await expect(panel.getByTestId('era-title')).toHaveText('Saiyan Saga')
  await expect(panel.getByTestId('era-span')).toHaveText('737 – 762')
  await expect(panel.getByTestId('era-fact-Title')).toContainText('Kakarot')
  await expect(panel.getByTestId('era-fact-Title')).toContainText('Set for this era')
  await expect(panel.getByTestId('era-fact-Motto')).toContainText('Train hard')
  await expect(panel.getByTestId('era-fact-Motto')).toContainText('From the main profile')

  // The second era leaves the motto empty and sets nothing else: it inherits the main profile, not the Saiyan Saga.
  await page.getByTestId('add-era').click()
  await form.getByTestId('era-name-input').fill('Frieza Saga')
  await form.getByTestId('era-field-mode-Motto').selectOption('cleared')
  await form.getByTestId('save-era').click()
  await expect(form).toBeHidden()
  await expect(panel.getByTestId('era-title')).toHaveText('Frieza Saga')
  await expect(panel.getByTestId('era-fact-Title')).toContainText('Goku')
  await expect(panel.getByTestId('era-fact-Title')).toContainText('From the main profile')
  await expect(panel.getByTestId('era-fact-Motto')).toContainText('None in this era')

  // Switching eras is a link: Back returns to the one before, and a reload lands where it was.
  await page.getByTestId('era-nav-Saiyan Saga').click()
  await expect(panel.getByTestId('era-title')).toHaveText('Saiyan Saga')
  await page.goBack()
  await expect(panel.getByTestId('era-title')).toHaveText('Frieza Saga')
  await page.reload()
  await expect(panel.getByTestId('era-title')).toHaveText('Frieza Saga')

  // The main profile lists the eras in order; the entry itself is unchanged.
  await page.getByTestId('era-nav-main').click()
  await expect(page.getByTestId('era-list').locator('.eralist__name')).toHaveText([
    'Saiyan Saga',
    'Frieza Saga',
  ])
  await page.getByTestId('entry-view-article').click()
  await expect(page.getByTestId('entry-fields')).toContainText('Goku')
  await expect(page.getByTestId('entry-fields')).toContainText('Train hard')

  // Era history: two versions; putting the first back removes the Frieza Saga again.
  await page.getByTestId('entry-view-progression').click()
  await page.getByTestId('era-history').locator('summary').click()
  await expect(page.getByTestId('era-version-2')).toBeVisible()
  await page.getByTestId('restore-era-version-1').click()
  await acceptConfirm(page, 'version 1')
  await expect(page.getByTestId('era-list').locator('.eralist__name')).toHaveText(['Saiyan Saga'])
})

test('an era is removed after a confirmation and the main profile is left as it was', async ({
  page,
}) => {
  const w = await world(page)
  const saved = await post<{ eras: { id: string }[] }>(
    page,
    `/api/universes/${w.u}/entities/${w.goku}/progression`,
    {
      eras: [
        {
          id: null,
          name: 'Cell Saga',
          description: null,
          start: null,
          end: null,
          storyIds: [],
          sceneIds: [],
          fields: [],
        },
      ],
      expectedVersion: 0,
    },
    'put',
  )

  await page.goto(`${w.entry}/progression?era=${saved.eras[0].id}`)
  await page.getByTestId('era-actions').click()
  await page.getByTestId('remove-era').click()
  await acceptConfirm(page, 'Cell Saga')
  await expect(page.getByTestId('progression-empty')).toBeVisible()
  await expect(page).not.toHaveURL(/era=/)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the eras and the entry views fit a 390px column', async ({ page }) => {
    const w = await world(page)
    await post(
      page,
      `/api/universes/${w.u}/entities/${w.goku}/progression`,
      {
        eras: ['Saiyan Saga', 'Frieza Saga', 'Cell Saga', 'Buu Saga'].map((name) => ({
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
      },
      'put',
    )

    await page.goto(`${w.entry}/progression`)
    await expect(page.getByTestId('era-nav')).toBeVisible()
    await page.getByTestId('era-nav-Buu Saga').click()
    await expect(page.getByTestId('era-title')).toHaveText('Buu Saga')

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
