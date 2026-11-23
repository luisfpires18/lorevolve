import { expect, test, type Page } from '@playwright/test'

/**
 * Issue #566: list screens. Types rows keep Edit in one column and the entry count on the line under the name, a shelf's
 * second view clears its tab strip, and the Ideas view toggle is as tall as the filter beside it.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUpWithWorld(page: Page) {
  const username = unique('lists')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  const created = await page.request.post('/api/universes', {
    data: { name: unique('Lists World '), description: null, accentColor: null },
  })
  return ((await created.json()) as { id: string }).id
}

async function box(locator: ReturnType<Page['getByTestId']>) {
  const found = await locator.boundingBox()
  expect(found).not.toBeNull()
  return found!
}

test('Types: Edit shares one column although one Fields button carries a count, and the count is under the name', async ({
  page,
}) => {
  const universeId = await signUpWithWorld(page)
  const stored = await page.request.get(`/api/universes/${universeId}/entity-types`)
  const types = (await stored.json()) as Array<{ id: string; name: string }>
  const character = types.find((type) => type.name === 'Character')!
  const field = await page.request.post(
    `/api/universes/${universeId}/entity-types/${character.id}/fields`,
    { data: { name: 'Age', kind: 2, isRequired: false } },
  )
  expect(field.ok()).toBe(true)

  await page.goto(`/app/universes/${universeId}/types`)
  const withCount = await box(page.getByTestId('edit-type-Character'))
  const without = await box(page.getByTestId('edit-type-Location'))
  expect(Math.abs(withCount.x - without.x)).toBeLessThan(1)
  const fieldsWith = await box(page.getByTestId('fields-Character'))
  const fieldsWithout = await box(page.getByTestId('fields-Location'))
  expect(Math.abs(fieldsWith.width - fieldsWithout.width)).toBeLessThan(1)

  await page.setViewportSize({ width: 390, height: 844 })
  for (const name of ['Character', 'Location', 'Event']) {
    const row = page
      .locator('li.types__row')
      .filter({ has: page.getByTestId(`type-count-${name}`) })
    const title = await box(row.locator('.types__name').first())
    const count = await box(page.getByTestId(`type-count-${name}`))
    expect(count.y).toBeGreaterThanOrEqual(title.y + title.height - 1)
    expect(count.x).toBeLessThan(40)
  }
})

test('Cinema Sagas clears its tab strip by the gap the strip has above it', async ({ page }) => {
  const universeId = await signUpWithWorld(page)
  await page.goto(`/app/universes/${universeId}/cinema`)
  await page.getByTestId('cinema-view-sagas').click()
  const strip = await box(page.getByTestId('cinema-views'))
  const first = await box(page.getByTestId('saga-new'))
  expect(first.y - (strip.y + strip.height)).toBeGreaterThanOrEqual(20)
})

test('Ideas: the Ideas / Recently deleted toggle is as tall as the filter input beside it', async ({
  page,
}) => {
  const universeId = await signUpWithWorld(page)
  await page.goto(`/app/universes/${universeId}/ideas`)
  const toggle = await box(page.getByTestId('ideas-view-live').locator('xpath=..'))
  const filter = await box(page.getByTestId('ideas-search'))
  expect(Math.abs(toggle.height - filter.height)).toBeLessThan(1)
  expect(Math.abs(toggle.y + toggle.height - (filter.y + filter.height))).toBeLessThan(1)
})
