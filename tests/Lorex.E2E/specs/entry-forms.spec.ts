import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'
import { acceptConfirm } from './support/confirm'

/**
 * An entry's forms and abilities (Issue #42): each available exactly in the eras the author ticks - never inferred from the
 * order of eras or from where it was first unlocked - with its first unlock and the scenes it is used in kept apart.
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

const ERAS = ['Saiyan Saga', 'Frieza Saga', 'Cell Saga', 'Buu Saga']

/** Goku with four eras in order, and one story with one scene, in a fresh universe. */
async function world(page: Page) {
  const username = unique('forms')
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
  const goku = (
    await post(page, `/api/universes/${u}/entities`, {
      entityTypeId: character,
      name: 'Goku',
      summary: null,
      canonStatus: 2,
      aliases: [],
      tags: [],
      fields: [],
    })
  ).id
  const saved = await post<{ eras: { id: string; name: string }[] }>(
    page,
    `/api/universes/${u}/entities/${goku}/progression`,
    {
      eras: ERAS.map((name) => ({
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
  const story = (
    await post(page, `/api/universes/${u}/stories`, { title: 'Namek', premise: null, status: 1 })
  ).id
  const chapter = (
    await post(page, `/api/universes/${u}/stories/${story}/chapters`, {
      title: 'Rage',
      summary: null,
      notes: null,
    })
  ).id
  await post(page, `/api/universes/${u}/stories/${story}/scenes`, {
    title: 'Krillin falls',
    summary: null,
    notes: null,
    povEntityId: null,
    chronology: null,
    entityIds: [],
    chapterId: chapter,
  })
  const era = (name: string) => saved.eras.find((one) => one.name === name)!.id
  return { u, goku, era, entry: `/app/universes/${u}/lore/${goku}/progression` }
}

test('a form is available only in the eras ticked, and its first unlock reads in its era', async ({
  page,
}) => {
  const w = await world(page)
  await page.goto(w.entry)

  // Super Saiyan: first unlocked in the Frieza Saga, in a scene; the shortcut ticks that era and every later one.
  await page.getByTestId('add-form').click()
  const form = page.getByTestId('form-form')
  await form.getByTestId('form-name-input').fill('Super Saiyan')
  await form.getByTestId('form-description-input').fill('Golden hair, green eyes.')
  await form.getByTestId('form-unlock-era').selectOption({ label: 'Frieza Saga' })
  await form.getByTestId('form-unlock-scene-story').selectOption({ label: 'Namek' })
  await form.getByTestId('form-unlock-scene-scene').selectOption({ label: 'Krillin falls' })
  await expect(form.getByTestId('form-unlock-scene-chosen')).toContainText('Krillin falls')
  // Nothing is ticked from the unlock alone.
  for (const name of ERAS) await expect(form.getByTestId(`form-era-${name}`)).not.toBeChecked()
  await form.getByTestId('form-eras-from-unlock').click()
  await expect(form.getByTestId('form-era-Saiyan Saga')).not.toBeChecked()
  for (const name of ERAS.slice(1)) await expect(form.getByTestId(`form-era-${name}`)).toBeChecked()
  await form.getByTestId('save-form').click()
  await expect(form).toBeHidden()

  // Super Saiyan 3: first unlocked in the Buu Saga and ticked for it alone.
  await page.getByTestId('add-form').click()
  await form.getByTestId('form-name-input').fill('Super Saiyan 3')
  await form.getByTestId('form-unlock-era').selectOption({ label: 'Buu Saga' })
  await form.getByTestId('form-era-Buu Saga').check()
  await form.getByTestId('save-form').click()
  await expect(form).toBeHidden()

  // An ability that belongs to a form, ticked era by era.
  await page.getByTestId('add-ability').click()
  const ability = page.getByTestId('ability-form')
  await ability.getByTestId('ability-name-input').fill('Kamehameha')
  await ability.getByTestId('ability-era-Cell Saga').check()
  await ability.getByTestId('ability-form-Super Saiyan').check()
  await ability.getByTestId('save-ability').click()
  await expect(ability).toBeHidden()

  const listed = page.getByTestId('form-Super Saiyan')
  await expect(listed.getByTestId('form-unlock')).toHaveText(
    'in Frieza Saga, in the scene Krillin falls',
  )
  await expect(listed.getByTestId('form-available')).toHaveText('Frieza Saga, Cell Saga, Buu Saga')
  await expect(page.getByTestId('ability-Kamehameha').getByTestId('ability-forms-read')).toHaveText(
    'Super Saiyan',
  )

  // The Frieza Saga lists Super Saiyan as first unlocked there, and not Super Saiyan 3, which comes later.
  await page.getByTestId('era-nav-Frieza Saga').click()
  const forms = page.getByTestId('era-forms')
  await expect(forms.getByTestId('era-forms-Super Saiyan')).toContainText('First unlocked here')
  await expect(forms.getByTestId('era-forms-Super Saiyan 3')).toHaveCount(0)
  await expect(page.getByTestId('era-abilities')).toHaveCount(0)

  // The Buu Saga has both, neither first unlocked there but Super Saiyan 3.
  await page.getByTestId('era-nav-Buu Saga').click()
  await expect(forms.locator('li')).toHaveCount(2)
  await expect(forms.getByTestId('era-forms-Super Saiyan')).not.toContainText('First unlocked')
  await expect(forms.getByTestId('era-forms-Super Saiyan 3')).toContainText('First unlocked here')

  // The Saiyan Saga has none: nothing was ticked for it.
  await page.getByTestId('era-nav-Saiyan Saga').click()
  await expect(page.getByTestId('era-panel')).toBeVisible()
  await expect(forms).toHaveCount(0)
})

test('removing an era or a form takes only its references with it', async ({ page }) => {
  const w = await world(page)
  await post(
    page,
    `/api/universes/${w.u}/entities/${w.goku}/progression`,
    {
      eras: ERAS.map((name) => ({
        id: w.era(name),
        name,
        description: null,
        start: null,
        end: null,
        storyIds: [],
        sceneIds: [],
        fields: [],
      })),
      expectedVersion: 1,
      forms: [
        {
          id: null,
          name: 'Super Saiyan',
          description: null,
          unlockEraId: w.era('Frieza Saga'),
          unlockSceneId: null,
          unlockMomentId: null,
          eraIds: [w.era('Frieza Saga'), w.era('Cell Saga')],
          sceneIds: [],
        },
      ],
      abilities: [],
    },
    'put',
  )

  // The ability is added after the form exists, so it can belong to it.
  await page.goto(w.entry)
  await page.getByTestId('add-ability').click()
  const ability = page.getByTestId('ability-form')
  await ability.getByTestId('ability-name-input').fill('Kamehameha')
  await ability.getByTestId('ability-form-Super Saiyan').check()
  await ability.getByTestId('save-ability').click()
  await expect(ability).toBeHidden()

  // Removing the Frieza Saga leaves the form, available in the Cell Saga only, and with no unlock era.
  await page.getByTestId('era-nav-Frieza Saga').click()
  await page.getByTestId('era-actions').click()
  await page.getByTestId('remove-era').click()
  await acceptConfirm(page, 'Frieza Saga')
  await expect(page).not.toHaveURL(/era=/)
  const listed = page.getByTestId('form-Super Saiyan')
  await expect(listed.getByTestId('form-available')).toHaveText('Cell Saga')
  await expect(listed.getByTestId('form-unlock')).toHaveCount(0)

  // Removing the form leaves the ability, belonging to no form.
  await page.getByTestId('form-actions-Super Saiyan').click()
  await page.getByTestId('remove-form').click()
  await acceptConfirm(page, 'Super Saiyan')
  await expect(page.getByTestId('form-Super Saiyan')).toHaveCount(0)
  await expect(page.getByTestId('ability-Kamehameha')).toBeVisible()
  await expect(page.getByTestId('ability-forms-read')).toHaveCount(0)
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the form drawer fits a 390px column', async ({ page }) => {
    const w = await world(page)
    await page.goto(w.entry)
    await page.getByTestId('add-form').click()
    const form = page.getByTestId('form-form')
    await expect(form.getByTestId('form-name-input')).toBeFocused()
    await form.getByTestId('form-unlock-era').selectOption({ label: 'Cell Saga' })
    await expect(form.getByTestId('form-eras-from-unlock')).toBeVisible()

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
