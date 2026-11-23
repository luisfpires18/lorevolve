import { expect, test, type Page } from '@playwright/test'
import { png } from './support/png'
import { post, signUp } from './support/trash'

/**
 * Issue #567, part 1: detail and form screens. A title built from pieces stays one piece in a flex row (the fields
 * section rule, a back link, the Knowledge buttons), the System form spaces its fields, the map form uses the shared
 * picture picker, the entry's More actions menu opens over the picture, the entry tools keep their room when they wrap,
 * an archived universe's phone bar keeps its separator on one line, and an article's third-level heading stands out.
 */

async function world(page: Page, name = 'Detail World') {
  await signUp(page)
  const universeId = await post(page, '/api/universes', {
    name,
    description: null,
    accentColor: null,
  })
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as Array<{ id: string; name: string }>
  const character = types.find((type) => type.name === 'Character')!.id
  return { universeId, character, u: `/app/universes/${universeId}` }
}

async function entry(page: Page, universeId: string, character: string, picture = false) {
  const id = await post(page, `/api/universes/${universeId}/entities`, {
    entityTypeId: character,
    name: 'Oressa Venn',
    summary: 'Reads the tide.',
    canonStatus: 2,
    aliases: [],
    tags: [],
    fields: [],
  })
  if (picture) {
    const put = await page.request.put(`/api/universes/${universeId}/entities/${id}/image`, {
      multipart: {
        file: {
          name: 'portrait.png',
          mimeType: 'image/png',
          buffer: png(600, 800, () => [60, 90, 120]),
        },
      },
    })
    expect(put.ok()).toBe(true)
  }
  return id
}

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
    await context.close()
  }
})

test('the More actions menu opens over the entry picture even where the bar is a stacking context', async ({
  page,
}) => {
  const { universeId, character, u } = await world(page)
  const id = await entry(page, universeId, character, true)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`${u}/lore/${id}`)
  await expect(page.getByTestId('entry-image')).toBeVisible()
  // Layout containment makes a stacking context in every engine: what WebKit or Firefox may do with the container query.
  await page.addStyleTag({ content: '.entry__bar { contain: layout; }' })
  await page.getByTestId('entity-actions').click()
  const panel = page.locator('.entry__bar .actionmenu__panel')
  await expect(panel).toBeVisible()
  const onTop = await panel.evaluate((p) => {
    const a = p.getBoundingClientRect()
    const b = document.querySelector('.entry__media')!.getBoundingClientRect()
    const x = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2
    const y = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2
    if (
      Math.min(a.right, b.right) <= Math.max(a.left, b.left) ||
      Math.min(a.bottom, b.bottom) <= Math.max(a.top, b.top)
    )
      return 'no overlap'
    return p.contains(document.elementFromPoint(x, y)) ? 'panel' : 'picture'
  })
  expect(onTop).toBe('panel')
})

test('entry tools keep their room above the rule whenever they wrap, at any width', async ({
  page,
}) => {
  const { universeId, character, u } = await world(page)
  const id = await entry(page, universeId, character)
  await page.addInitScript(() => localStorage.setItem('lorevolve-locale', 'pt-PT'))
  await page.setViewportSize({ width: 1100, height: 900 })
  await page.goto(`${u}/lore/${id}`)
  await expect(page.getByTestId('entity-actions')).toBeVisible()
  // Wider labels, as a wider system font or a longer translation draws them: the tools then wrap on a bar past 52rem.
  await page.addStyleTag({ content: '.entry__tools .button { letter-spacing: 0.6em; }' })
  const seen = { wideWrapped: 0, wideOneRow: 0 }
  for (let width = 1100; width <= 1920; width += 40) {
    await page.setViewportSize({ width, height: 900 })
    await page.waitForTimeout(100)
    const bar = await page.locator('.entry__bar').evaluate((element) => {
      const tools = element.querySelector('.entry__tools')!
      const lenses = element.querySelector('.entry__lenses')!
      return {
        width: element.getBoundingClientRect().width,
        wrapped: tools.getBoundingClientRect().top >= lenses.getBoundingClientRect().bottom,
        padding: getComputedStyle(tools).paddingBottom,
      }
    })
    if (bar.wrapped) expect(bar.padding, `width ${width}`).toBe('8px')
    if (bar.width >= 832) seen[bar.wrapped ? 'wideWrapped' : 'wideOneRow']++
    if (bar.width >= 832 && !bar.wrapped) expect(bar.padding, `width ${width}`).toBe('0px')
  }
  expect(seen.wideWrapped).toBeGreaterThan(0)
  expect(seen.wideOneRow).toBeGreaterThan(0)
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
        sameLine: Math.abs(text.top - uni.top) < 4,
        textLeft: text.left,
        uniLeft: uni.left,
        uniRight: uni.right,
      }
    })
    expect(at.sameLine).toBe(oneLine)
    if (oneLine) {
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
