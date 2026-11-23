import { expect, test, type Page } from '@playwright/test'
import { png } from './support/png'
import { post, signUp } from './support/trash'
import { entry, world } from './support/detailForm'

/**
 * Issue #567, part 1: detail and form screens. A title built from pieces stays one piece in a flex row (the fields
 * section rule, a back link, the Knowledge buttons), the System form spaces its fields, the map form uses the shared
 * picture picker, an archived universe's phone bar keeps its separator on one line, and an article's third-level
 * heading stands out. The entry bar's own tests are in entry-bar-polish.spec.ts.
 */

/** The gap between the last character before an element and the element itself, in px. */
async function gapBefore(page: Page, selector: string) {
  return page
    .locator(selector)
    .first()
    .evaluate((name) => {
      const text = name.previousSibling as Text
      const range = document.createRange()
      range.setStart(text, text.length - 1)
      range.setEnd(text, text.length)
      return name.getBoundingClientRect().left - range.getBoundingClientRect().right
    })
}

test('a title built from pieces reads as one: fields section rule, back link and Knowledge buttons', async ({
  page,
}) => {
  const { universeId, character, u } = await world(page, 'The Tidewrack Reaches')
  const field = await page.request.post(
    `/api/universes/${universeId}/entity-types/${character}/fields`,
    { data: { name: 'Age', kind: 2, isRequired: false } },
  )
  expect(field.ok()).toBe(true)

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${u}/lore/new?type=${character}`)
    const heading = page.locator('.entryform__heading').last()
    await expect(heading).toContainText('Character')
    // One flex item beside the hairline, the type's name inside the sentence with no gap around it.
    expect(await heading.evaluate((h) => h.children.length)).toBe(1)
    expect(Math.abs(await gapBefore(page, '.entryform__heading bdi'))).toBeLessThan(1)
  }

  await page.goto(`${u}/ideas/new`)
  const back = page.locator('.dochead__back a')
  await expect(back).toHaveText('Ideas in “The Tidewrack Reaches”')
  expect(Math.abs(await gapBefore(page, '.dochead__back a bdi'))).toBeLessThan(1)

  const id = await entry(page, universeId, character)
  await page.goto(`${u}/lore/${id}/relations`)
  await expect(page.getByTestId('knowledge-add')).toBeVisible()
  expect(Math.abs(await gapBefore(page, '[data-testid="knowledge-add"] bdi'))).toBeLessThan(1)
  expect(Math.abs(await gapBefore(page, '[data-testid="knowledge-add-about"] bdi'))).toBeLessThan(1)
})

test('the System form spaces Name and Summary as every form does', async ({ page }) => {
  const { u } = await world(page)
  await page.goto(`${u}/world-logic/systems/new`)
  const name = await page.getByTestId('system-editor-name').boundingBox()
  const summaryId = await page.getByTestId('system-editor-summary').getAttribute('id')
  const label = await page.locator(`label[for="${summaryId}"]`).boundingBox()
  expect(label!.y - (name!.y + name!.height)).toBeCloseTo(28, 0)
})

test('the map form picks its image with the shared picture button', async ({ browser }) => {
  for (const hasTouch of [false, true]) {
    const context = await browser.newContext({ hasTouch, viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    const { u } = await world(page)
    await page.goto(`${u}/maps`)
    await page.getByTestId('new-map').click()
    const input = page.getByTestId('map-file-input')
    const pick = page.locator('.imagefield__pick')
    await expect(pick).toHaveText('Add image')
    expect(await input.evaluate((i) => i.getBoundingClientRect().width)).toBeLessThanOrEqual(1)
    // 40px with a mouse; a touch screen keeps the 44px target of every button (006-buttons.css).
    expect((await pick.boundingBox())!.height).toBeCloseTo(hasTouch ? 44 : 40, 0)
    await input.setInputFiles({
      name: 'coast.png',
      mimeType: 'image/png',
      buffer: png(64, 48, () => [90, 120, 150]),
    })
    await expect(page.getByTestId('map-file-chosen')).toContainText('coast.png')
    if (!hasTouch) {
      // Replacing the picture of a saved map, the button says Replace.
      await page.getByTestId('map-name-input').fill('Coast')
      await page.getByTestId('map-form-save').click()
      await page.waitForURL(/\/maps\/[0-9a-f-]+$/)
      await page.getByTestId('map-actions').click()
      await page.getByTestId('map-replace-image').click()
      await expect(page.getByTestId('map-form').locator('.imagefield__pick')).toHaveText('Replace')
    }
    await context.close()
  }
})

test("an archived universe's phone bar draws the separator only between the name and the section on one line", async ({
  page,
}) => {
  await signUp(page)
  await page.setViewportSize({ width: 390, height: 844 })
  for (const [name, oneLine] of [
    ['Ash', true],
    ['The Cinder Ledger of the Long Coast', false],
  ] as const) {
    const id = await post(page, '/api/universes', { name, description: null, accentColor: null })
    expect((await page.request.post(`/api/universes/${id}/archive`)).ok()).toBe(true)
    await page.goto(`/app/universes/${id}`)
    const where = page.getByTestId('workspace-where')
    await expect(where.locator('.rail__archived')).toBeVisible()
    const at = await where.evaluate((p) => {
      const uni = p.querySelector('.rail__universe')!.getBoundingClientRect()
      const section = p.querySelector('.rail__section')!
      const range = document.createRange()
      range.selectNodeContents(section)
      const text = [...range.getClientRects()].filter((r) => r.width > 0).pop()!
      return {
        // Baseline-aligned, the two fonts' boxes start at different heights: compare their middles.
        sameLine: Math.abs(text.top + text.height / 2 - (uni.top + uni.height / 2)) < 8,
        where: `${uni.top},${uni.height} ${text.top},${text.height} ${p.getBoundingClientRect().width}`,
        textLeft: text.left,
        uniLeft: uni.left,
        uniRight: uni.right,
      }
    })
    // The long name always wraps; the short one shares its line wherever the system font leaves room (it does here).
    if (!oneLine) expect(at.sameLine, at.where).toBe(false)
    if (at.sameLine) {
      // " · " between them: 0.4rem, the separator's 0.45rem box, 0.4rem.
      expect(at.textLeft - at.uniRight).toBeCloseTo(20, 0)
    } else {
      // Starting the second line, the section lines up with the name and its separator is clipped off.
      expect(Math.abs(at.textLeft - at.uniLeft)).toBeLessThan(0.5)
    }
  }
})

test("an article's third-level heading is larger than the article's text", async ({ page }) => {
  const { universeId, character, u } = await world(page)
  const id = await entry(page, universeId, character)
  await page.goto(`${u}/lore/${id}`)
  await expect(page.getByTestId('entity-actions')).toBeVisible()
  const sizes = await page.evaluate(() => {
    const body = document.createElement('div')
    body.className = 'article__body'
    body.innerHTML = '<h3>Tides</h3><p>Text.</p>'
    document.querySelector('.workspace__column')!.append(body)
    const size = (selector: string) =>
      parseFloat(getComputedStyle(body.querySelector(selector)!).fontSize)
    return { h3: size('h3'), p: size('p') }
  })
  expect(sizes.h3).toBeCloseTo(19.2, 1)
  expect(sizes.h3).toBeGreaterThan(sizes.p)
})
