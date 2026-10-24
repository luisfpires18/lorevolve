import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * When a relation holds (Issue #18): a period on the universe's own chronology, or an era of either entry; none means always.
 * Leaving and returning is a second period on the same relation. The Relations view can be read at a time, showing only what
 * holds then, and the older real-world dates are kept, shown and clearable.
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

async function world(page: Page) {
  const username = unique('periods')
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

  const u = (await post(page, '/api/universes', { name: unique('Earth '), description: null })).id
  const types = (await (await page.request.get(`/api/universes/${u}/entity-types`)).json()) as {
    id: string
    name: string
  }[]
  const character = types.find((type) => type.name === 'Character')!.id
  const entry = async (name: string) =>
    (
      await post(page, `/api/universes/${u}/entities`, {
        entityTypeId: character,
        name,
        summary: null,
        canonStatus: 2,
        aliases: [],
        tags: [],
        fields: [],
      })
    ).id
  const goku = await entry('Goku')
  const ribbon = await entry('Red Ribbon')
  const bulma = await entry('Bulma')
  const kind = (
    await post(page, `/api/universes/${u}/relationship-types`, {
      name: 'member of',
      inverseName: 'has member',
      isSymmetric: false,
      description: null,
      displayOrder: null,
    })
  ).id
  await post(
    page,
    `/api/universes/${u}/entities/${goku}/progression`,
    {
      eras: [
        {
          id: null,
          name: 'Red Ribbon Army Saga',
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
  return { u, goku, ribbon, bulma, kind, entry: `/app/universes/${u}/lore/${goku}/relations` }
}

test('a relation holds during periods of its own, and the list can be read at a time', async ({
  page,
}) => {
  const w = await world(page)
  // Bulma is always connected: no period.
  await post(page, `/api/universes/${w.u}/relationships`, {
    relationshipTypeId: w.kind,
    sourceEntityId: w.goku,
    targetEntityId: w.bulma,
    canonStatus: 2,
    startDate: null,
    endDate: null,
    notes: null,
  })

  await page.goto(w.entry)
  await page.getByTestId('add-relationship').click()
  await page.getByLabel('Reading').selectOption({ label: 'member of' })
  await page.getByTestId('picker-input').click()
  await page.getByTestId('picker-input').fill('Red Ribbon')
  await page.getByTestId('picker-option-Red Ribbon').click()

  // Two periods on one relation: dates, then the era it was true in.
  await page.getByTestId('relation-period-add').click()
  const first = page.getByTestId('relation-period-0')
  await first.locator('input[id$="-start-year"]').fill('749')
  await first.locator('input[id$="-end-year"]').fill('750')
  await page.getByTestId('relation-period-add').click()
  await page.getByTestId('relation-period-1-era').click()
  await page
    .getByTestId('relation-period-1-era-select')
    .selectOption({ label: 'Red Ribbon Army Saga (Goku)' })
  await page.getByTestId('save-relationship').click()

  const row = page.locator('[data-relation-label="member of"]').filter({ hasText: 'Red Ribbon' })
  await expect(row.getByTestId('relation-periods-text')).toHaveText(
    '749 – 750; During Red Ribbon Army Saga (Goku)',
  )

  // At 749 both hold - Red Ribbon by its dates, Bulma always.
  await page.getByTestId('relations-when-open').click()
  await page.locator('#relations-at-year').fill('749')
  await page.getByTestId('relations-when-show').click()
  await expect(page.getByTestId('relations-when-status')).toContainText('749')
  await expect(page.locator('[data-relation-label]')).toHaveCount(2)
  await expect(page.locator('[data-relation-label]').filter({ hasText: 'Bulma' })).toContainText(
    'Always',
  )

  // At 760 the dates do not reach, and the era has no dates of its own to place: Red Ribbon says so, apart.
  await page.getByTestId('relations-when-open').click()
  await page.locator('#relations-at-year').fill('760')
  await page.getByTestId('relations-when-show').click()
  await expect(row.getByTestId('relation-unplaced')).toBeVisible()

  await page.getByTestId('relations-when-clear').click()
  await expect(page.locator('[data-relation-label]')).toHaveCount(2)
  await expect(page.getByTestId('relations-when-status')).toHaveCount(0)
})

test('real-world dates recorded before are kept, shown and can be cleared', async ({ page }) => {
  const w = await world(page)
  await post(page, `/api/universes/${w.u}/relationships`, {
    relationshipTypeId: w.kind,
    sourceEntityId: w.goku,
    targetEntityId: w.ribbon,
    canonStatus: 2,
    startDate: '2019-05-01T00:00:00Z',
    endDate: null,
    notes: null,
  })

  await page.goto(w.entry)
  const row = page.locator('[data-relation-label="member of"]')
  await expect(row).toContainText('Real-world')

  await page.getByTestId('relationship-actions-Red Ribbon').click()
  await page.getByTestId('edit-relationship-Red Ribbon').click()
  await expect(page.getByTestId('relation-legacy-dates')).toBeVisible()
  await page.getByTestId('relation-legacy-clear').click()
  await expect(page.getByTestId('relation-legacy-dates')).toHaveCount(0)
  await page.getByTestId('save-relationship').click()
  await expect(row).not.toContainText('Real-world')
})
