import { expect, test } from '@playwright/test'
import { entry, world } from './support/detailForm'

/**
 * Issue #567, part 1: the entry bar. Its open More actions menu stays over the entry's picture and over every sticky or
 * fixed layer of the page column, and its tools keep their room above the rule whenever they wrap.
 */

test('the open More actions menu is over the sticky and fixed layers of the page', async ({
  browser,
}) => {
  for (const [width, hasTouch] of [
    [1440, false],
    [390, true],
  ] as const) {
    const context = await browser.newContext({ hasTouch, viewport: { width, height: 900 } })
    const page = await context.newPage()
    const { universeId, character, u } = await world(page)
    const id = await entry(page, universeId, character)
    await page.goto(`${u}/lore/${id}`)
    await page.getByTestId('entity-actions').click()
    const panel = page.locator('.entry__bar .actionmenu__panel')
    await expect(panel).toBeVisible()
    // A layer at --z-sticky inside the page column (a save bar, the phone's New button) laid over the whole menu. The
    // Feedback pill is left out: it sits outside the column, which is its own stacking context, as it did before.
    await page.addStyleTag({ content: '.feedbackbutton { display: none; }' })
    await page.locator('.workspace__column').evaluate((column) => {
      const layer = document.createElement('div')
      layer.style.cssText = 'position: fixed; inset: 0; z-index: var(--z-sticky)'
      column.append(layer)
    })
    const covered = await panel.evaluate((p) =>
      [...p.querySelectorAll('a, button')]
        .map((item) => {
          const r = item.getBoundingClientRect()
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          return item.contains(top) ? null : item.textContent?.trim()
        })
        .filter(Boolean),
    )
    expect(covered, `width ${width}`).toEqual([])
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
