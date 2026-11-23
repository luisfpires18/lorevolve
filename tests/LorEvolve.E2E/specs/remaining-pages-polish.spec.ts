import { expect, test, type Locator, type Page } from '@playwright/test'
import { world } from './support/detailForm'
import { post } from './support/trash'

// Issue #568: the spacing and alignment fixes of World Logic, Profile and Settings Data, measured.

async function box(locator: Locator) {
  const found = await locator.boundingBox()
  expect(found).not.toBeNull()
  return found!
}

/** Where the title starts inside its row: left edge, and distance from the row's top. */
async function titlePlace(row: Locator) {
  const [r, title] = [await box(row), await box(row.locator('.rulerow__title'))]
  return { x: Math.round(title.x), dy: Math.round(title.y - r.y) }
}

async function put(page: Page, path: string) {
  const response = await page.request.put(path, { data: {} })
  expect(response.ok(), path).toBe(true)
}

for (const width of [1440, 390]) {
  test(`World Logic rule rows share one edge under one hairline at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const { universeId, u } = await world(page, 'Logic Polish')
    await post(page, `/api/universes/${universeId}/world-rules`, {
      title: 'Blink has a cost',
      description: 'It always does.',
    })
    const definition = await post(page, `/api/universes/${universeId}/system-rules`, {
      title: 'Age of majority',
      description: 'Sixteen.',
    })
    const system = await post(page, `/api/universes/${universeId}/systems`, {
      name: 'Succession',
      summary: 'Who may hold a seat.',
    })
    await put(page, `/api/universes/${universeId}/systems/${system}/rules/${definition}`)

    await page.goto(`${u}/world-logic`)
    const rows = page.getByTestId('world-logic-rule-row')
    await expect(rows).toHaveCount(2)
    const text = await titlePlace(rows.filter({ hasText: 'Age of majority' }))
    const link = await titlePlace(rows.filter({ hasText: 'Blink has a cost' }))
    expect(text).toEqual(link)

    // The tab row is the list's top rule: no second hairline under it.
    const list = page.getByTestId('world-logic-rule-list')
    await expect(list).toHaveCSS('border-top-width', '0px')
    const tabs = await box(page.getByRole('tablist'))
    expect(Math.round((await box(list)).y)).toBe(Math.round(tabs.y + tabs.height))

    // An opened System's rule rows are text titles too: they sit where a link title does.
    await page.getByTestId('world-logic-tab-systems').click()
    await page.getByTestId('world-logic-system-toggle').click()
    const inner = page.getByTestId('world-logic-system-rule')
    await expect(inner).toHaveCount(1)
    expect((await titlePlace(inner)).dy).toBe(link.dy)
  })
}

test('Profile keeps Theme and Language apart, and Settings Data its note under the button', async ({
  page,
}) => {
  const { u } = await world(page, 'Spacing Polish')

  await page.goto('/app/profile')
  // Both groups read in one pass: the facts above them load late and move them together.
  await expect
    .poll(() =>
      page
        .locator('.profile .themeswitch')
        .evaluateAll((groups) =>
          groups.length === 2
            ? Math.round(
                groups[1].getBoundingClientRect().top - groups[0].getBoundingClientRect().bottom,
              )
            : null,
        ),
    )
    .toBe(16)

  await page.goto(`${u}/settings?tab=data`)
  const backup = await box(page.getByTestId('export-universe'))
  const note = await box(page.getByText('A readable export is', { exact: false }))
  expect(Math.round(note.y - (backup.y + backup.height))).toBe(16)
})
