import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * The progression profile (Issue #44): one entry read as a connected profile - an overview, then each era with its own
 * details, the forms and abilities available then, its looks and the relations that hold then - with the way back to the
 * article and straight through the eras. Nothing from a later era shows in an earlier one unless the author said so.
 *
 * Each test registers its own account and builds its world through the API.
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

/** Goku across four eras, with forms, a look, and relations that hold at different times. */
async function world(page: Page) {
  const username = unique('profile')
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
  const entry = async (name: string, summary: string | null = null) =>
    (
      await post(page, `/api/universes/${u}/entities`, {
        entityTypeId: character,
        name,
        summary,
        canonStatus: 2,
        aliases: [],
        tags: [],
        fields: [],
      })
    ).id
  const goku = await entry('Goku', 'A Saiyan raised on Earth.')
  const vegeta = await entry('Vegeta')
  const chichi = await entry('Chi-Chi')
  const majin = await entry('Majin Buu')
  const bulma = await entry('Bulma')

  const route = `/api/universes/${u}/entities/${goku}/progression`
  const withEras = await post<{ version: number; eras: { id: string; name: string }[] }>(
    page,
    route,
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
  const era = (name: string) => withEras.eras.find((one) => one.name === name)!.id
  await post(
    page,
    route,
    {
      eras: null,
      expectedVersion: withEras.version,
      forms: [
        {
          id: null,
          name: 'Super Saiyan',
          description: null,
          unlockEraId: era('Frieza Saga'),
          unlockSceneId: null,
          unlockMomentId: null,
          eraIds: [era('Frieza Saga'), era('Cell Saga'), era('Buu Saga')],
          sceneIds: [],
        },
        {
          id: null,
          name: 'Super Saiyan 3',
          description: null,
          unlockEraId: era('Buu Saga'),
          unlockSceneId: null,
          unlockMomentId: null,
          eraIds: [era('Buu Saga')],
          sceneIds: [],
        },
      ],
      appearances: [
        {
          id: null,
          label: 'Orange gi',
          notes: null,
          eraIds: [era('Frieza Saga')],
          formIds: [],
          sceneIds: [],
        },
      ],
    },
    'put',
  )

  const kind = (name: string) =>
    post(page, `/api/universes/${u}/relationship-types`, {
      name,
      inverseName: null,
      isSymmetric: true,
      description: null,
      displayOrder: null,
    })
  const rival = (await kind('rival of')).id
  const married = (await kind('married to')).id
  const foe = (await kind('foe of')).id
  const relation = (type: string, target: string, periods: unknown[]) =>
    post(page, `/api/universes/${u}/relationships`, {
      relationshipTypeId: type,
      sourceEntityId: goku,
      targetEntityId: target,
      canonStatus: 2,
      startDate: null,
      endDate: null,
      notes: null,
      periods,
    })
  await relation(rival, vegeta, [
    { start: null, end: null, entityEraId: era('Frieza Saga') },
    { start: null, end: null, entityEraId: era('Buu Saga') },
  ])
  await relation(married, chichi, [])
  await relation(foe, majin, [{ start: null, end: null, entityEraId: era('Buu Saga') }])
  // Dated, while Goku's eras have no dates: it cannot be set against any of them, so no era says it holds.
  const friend = (await kind('friend of')).id
  await relation(friend, bulma, [
    {
      start: { eraId: null, year: 750, month: null, day: null, monthId: null },
      end: null,
      entityEraId: null,
    },
  ])

  return { u, goku, vegeta, majin, entry: `/app/universes/${u}/lore/${goku}` }
}

test('one entry reads as a profile: an overview, then each era with only what holds then', async ({
  page,
}) => {
  const w = await world(page)
  await page.goto(w.entry)
  await expect(page.getByTestId('entry-view-progression')).toHaveText('Progression')
  await page.getByTestId('entry-view-progression').click()

  const overview = page.getByTestId('progression-overview')
  await expect(overview).toContainText('A Saiyan raised on Earth.')
  await expect(overview.getByTestId('progression-counts')).toHaveText(
    '4 stages · 2 forms · 1 appearance',
  )

  // The Frieza Saga: Super Saiyan first unlocked, its look, Vegeta as rival and Chi-Chi always - and nothing of the Buu Saga.
  await page.getByTestId('era-nav-Frieza Saga').click()
  const panel = page.getByTestId('era-panel')
  await expect(panel.getByTestId('era-forms-Super Saiyan')).toContainText('First unlocked here')
  await expect(panel.getByTestId('era-forms-Super Saiyan 3')).toHaveCount(0)
  await expect(panel.getByTestId('era-appearances-Orange gi')).toBeVisible()
  const relations = panel.getByTestId('era-relations')
  await expect(relations.getByTestId('era-relation-Vegeta')).toContainText('rival of')
  await expect(relations.getByTestId('era-relation-Chi-Chi')).toContainText('Always')
  await expect(relations.getByTestId('era-relation-Majin Buu')).toHaveCount(0)

  // Bulma's dated link can't be placed in an undated era: listed apart, folded, never among what holds.
  await expect(
    relations.getByTestId('era-relations-holding').getByTestId('era-relation-Bulma'),
  ).toHaveCount(0)
  const unplaced = relations.getByTestId('era-relations-unplaced-group')
  await expect(unplaced).toContainText('1 relation can’t be placed in this stage')
  await expect(unplaced.getByTestId('era-relation-Bulma')).toBeHidden()
  await unplaced.locator('summary').click()
  await expect(unplaced.getByTestId('era-relation-Bulma')).toBeVisible()
  await expect(page.getByTestId('progression-overview')).toHaveCount(0)

  // Straight through the eras: the next one is the Cell Saga, then the Buu Saga, where Majin Buu appears.
  await page
    .getByTestId('era-steps')
    .getByRole('link', { name: /Cell Saga/ })
    .click()
  await expect(panel.getByTestId('era-title')).toHaveText('Cell Saga')
  await expect(panel.getByTestId('era-title')).toBeFocused()
  await expect(panel.getByTestId('era-relations').getByTestId('era-relation-Chi-Chi')).toBeVisible()
  await expect(panel.getByTestId('era-relations').getByTestId('era-relation-Vegeta')).toHaveCount(0)
  await page
    .getByTestId('era-steps')
    .getByRole('link', { name: /Buu Saga/ })
    .click()
  await expect(panel.getByTestId('era-title')).toHaveText('Buu Saga')
  await expect(panel.getByTestId('era-forms-Super Saiyan 3')).toContainText('First unlocked here')
  await expect(panel.getByTestId('era-appearances')).toHaveCount(0)

  // A related entry opens its own page; the main profile and the article are a link away.
  await panel.getByTestId('era-relation-Majin Buu').getByRole('link').click()
  await expect(page).toHaveURL(new RegExp(`/lore/${w.majin}$`))
  await page.goBack()
  await page.getByTestId('era-steps-main').click()
  await expect(page.getByTestId('progression-overview')).toBeVisible()
  await page.getByTestId('progression-article').click()
  await expect(page).toHaveURL(new RegExp(`/lore/${w.goku}$`))
})

test('an entry with no progression still reads as a profile', async ({ page }) => {
  const w = await world(page)
  await page.goto(`/app/universes/${w.u}/lore/${w.vegeta}/progression`)
  await expect(page.getByTestId('progression-overview')).toBeVisible()
  await expect(page.getByTestId('progression-counts')).toHaveCount(0)
  await expect(page.getByTestId('progression-empty')).toBeVisible()
  await page.getByTestId('progression-article').click()
  await expect(page).toHaveURL(new RegExp(`/lore/${w.vegeta}$`))
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('an era page fits a 390px column', async ({ page }) => {
    const w = await world(page)
    await page.goto(`${w.entry}/progression`)
    await page.getByTestId('era-nav-Buu Saga').click()
    await expect(page.getByTestId('era-relations')).toBeVisible()
    await expect(page.getByTestId('era-steps')).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
