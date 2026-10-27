import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * Lore browsing on any width: the grid takes as many columns as the width holds and no more, the author chooses how many
 * entries a page carries (kept in this browser), and the pager is three fixed slots - Previous at the start, the
 * position truly centred, Next at the end - across the grid's own width. Geometry is checked with tolerances, never
 * pixels.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('pager')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

/**
 * A universe of 45 entries, 15 in each of three types nested inside one: Lore has no "All" (Product refinement 022), and
 * the parent's branch is the 45.
 */
async function world(page: Page) {
  const created = await page.request.post('/api/universes', {
    data: { name: unique('Paged World '), description: null, accentColor: null },
  })
  const id = ((await created.json()) as { id: string }).id
  const type = async (name: string, parent: string | null) => {
    const response = await page.request.post(`/api/universes/${id}/entity-types`, {
      data: {
        name,
        description: null,
        icon: null,
        accentColor: null,
        displayOrder: null,
        parent: { id: parent },
      },
    })
    expect(response.ok()).toBe(true)
    return ((await response.json()) as { id: string }).id
  }
  const rootId = await type('Ledger', null)
  const types = [
    { id: await type('Ledger I', rootId) },
    { id: await type('Ledger II', rootId) },
    { id: await type('Ledger III', rootId) },
  ]
  for (let index = 1; index <= 45; index++) {
    const response = await page.request.post(`/api/universes/${id}/entities`, {
      data: {
        entityTypeId: types[index % 3].id,
        name: `Entry ${String(index).padStart(2, '0')}`,
        summary: 'A keeper of the count.',
        canonStatus: 1,
        aliases: [],
        tags: [],
        fields: [],
      },
    })
    expect(response.ok()).toBe(true)
  }
  return { id, typeId: types[1].id, rootId }
}

const cards = (page: Page) => page.getByTestId('entity-grid').locator(':scope > li')

async function columns(page: Page) {
  return page
    .getByTestId('entity-grid')
    .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(' ').length)
}

/** Where the pager's three parts sit against the grid above them. */
async function pagerGeometry(page: Page) {
  return page.evaluate(() => {
    const grid = document.querySelector('[data-testid="entity-grid"]')!.getBoundingClientRect()
    const pager = document.querySelector('.pager')!
    const [previous, position, next] = Array.from(pager.children).map((node) =>
      node.getBoundingClientRect(),
    )
    return {
      gridLeft: grid.left,
      gridRight: grid.right,
      gridCentre: grid.left + grid.width / 2,
      previousLeft: previous.left,
      previousRight: previous.right,
      nextLeft: next.left,
      nextRight: next.right,
      positionLeft: position.left,
      positionRight: position.right,
      positionCentre: position.left + position.width / 2,
      positionTop: position.top,
      previousTop: previous.top,
      nextTop: next.top,
    }
  })
}

async function signedIn(
  browser: Browser,
  page: Page,
  options: Parameters<Browser['newContext']>[0],
) {
  const context = await browser.newContext({
    ...options,
    storageState: await page.context().storageState(),
  })
  return { context, page: await context.newPage() }
}

test.describe('Lore pages', () => {
  test('the author chooses how many entries a page holds, it is kept, and a new size starts at page one', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await signUp(page)
    const w = await world(page)
    await page.goto(`/app/universes/${w.id}/lore?type=${w.rootId}&page=2`)

    const size = page.getByLabel('Items per page')
    await expect(size).toHaveValue('12')
    await expect(size.locator('option')).toHaveText(['12', '16', '20', '30', '40'])
    await expect(cards(page)).toHaveCount(12)
    await expect(page.locator('.pager__position')).toHaveText('Page 2 of 4')

    // A new size cuts the list again from its start.
    await size.selectOption('20')
    await expect(cards(page)).toHaveCount(20)
    await expect(page.locator('.pager__position')).toHaveText('Page 1 of 3')
    expect(new URL(page.url()).searchParams.get('page')).toBeNull()

    // Kept in this browser, through a reload and a new visit; never in the address.
    await page.reload()
    await expect(page.getByLabel('Items per page')).toHaveValue('20')
    await expect(cards(page)).toHaveCount(20)
    expect(new URL(page.url()).searchParams.get('pageSize')).toBeNull()

    await page.getByLabel('Items per page').selectOption('16')
    await expect(cards(page)).toHaveCount(16)
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.locator('.pager__position')).toHaveText('Page 2 of 3')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.locator('.pager__position')).toHaveText('Page 3 of 3')
    // The last page holds what is left: 45 - 32.
    await expect(cards(page)).toHaveCount(13)
  })

  test('a filter recounts the pages, and a page past the end lands on the last one', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await signUp(page)
    const w = await world(page)

    // Fifteen of one type: two pages of 12, one page of 16 - and one page shows no pager at all.
    await page.goto(`/app/universes/${w.id}/lore?type=${w.typeId}`)
    await expect(cards(page)).toHaveCount(12)
    await expect(page.locator('.pager__position')).toHaveText('Page 1 of 2')
    await page.getByLabel('Items per page').selectOption('16')
    await expect(cards(page)).toHaveCount(15)
    await expect(page.locator('.pager')).toHaveCount(0)

    // Never "Page 5 of 3": an address past the end is brought back to the last page there is.
    await page.getByLabel('Items per page').selectOption('12')
    await page.goto(`/app/universes/${w.id}/lore?type=${w.rootId}&page=9`)
    await expect(page.locator('.pager__position')).toHaveText('Page 4 of 4')
    await expect(page).toHaveURL(/[?&]page=4$/)
    await expect(cards(page)).toHaveCount(9)

    // Filtering narrows the count the pages are cut from.
    await page.getByLabel('Filter entries').fill('Entry 1')
    await expect(page.locator('.pager__position')).toHaveCount(0)
    await expect(cards(page)).toHaveCount(10)
  })

  test('the pager is three fixed slots across the grid: start, true centre, end - on the first page, a middle one and the last', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000)
    await signUp(page)
    const w = await world(page)

    for (const theme of ['light', 'dark']) {
      for (const viewport of [
        { width: 1920, height: 1080 },
        { width: 1536, height: 864 },
        { width: 1440, height: 900 },
        { width: 1024, height: 768 },
        { width: 820, height: 1180 },
        { width: 390, height: 844 },
        { width: 360, height: 780 },
      ]) {
        const { context, page: tab } = await signedIn(browser, page, { viewport })
        await context.addInitScript((t) => localStorage.setItem('lorevolve-theme', t), theme)
        for (const at of [1, 2, 4]) {
          await tab.goto(
            `/app/universes/${w.id}/lore?type=${w.rootId}${at > 1 ? `&page=${at}` : ''}`,
          )
          await expect(tab.locator('.pager__position')).toHaveText(`Page ${at} of 4`)
          const g = await pagerGeometry(tab)
          const where = `${theme} ${viewport.width} page ${at}`
          expect(Math.abs(g.previousLeft - g.gridLeft), where).toBeLessThanOrEqual(2)
          expect(Math.abs(g.nextRight - g.gridRight), where).toBeLessThanOrEqual(2)
          expect(Math.abs(g.positionCentre - g.gridCentre), where).toBeLessThanOrEqual(2)
          // Each button stays inside its own half: never over the position, however wide its label draws.
          expect(g.previousRight, where).toBeLessThanOrEqual(g.positionLeft)
          expect(g.nextLeft, where).toBeGreaterThanOrEqual(g.positionRight)
          // One row: the three parts share a line.
          expect(Math.abs(g.previousTop - g.nextTop), where).toBeLessThanOrEqual(12)
          // The end that goes nowhere stays in its place, disabled, so the centre never moves.
          if (at === 1) await expect(tab.getByRole('button', { name: 'Previous' })).toBeDisabled()
          if (at === 4) await expect(tab.getByRole('button', { name: 'Next' })).toBeDisabled()
          const overflow = await tab.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          )
          expect(overflow, where).toBeLessThanOrEqual(0)
        }
        await context.close()
      }
    }
  })

  test('the grid takes the columns the width holds - more on a wide monitor, never stretched cards - at 200% too', async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000)
    await signUp(page)
    const w = await world(page)

    const measured: Record<string, { columns: number; card: number }> = {}
    for (const [label, options] of [
      ['1920', { viewport: { width: 1920, height: 1080 } }],
      ['1536', { viewport: { width: 1536, height: 864 } }],
      ['1440', { viewport: { width: 1440, height: 900 } }],
      ['1024', { viewport: { width: 1024, height: 768 } }],
      ['390', { viewport: { width: 390, height: 844 } }],
      ['200%', { viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 }],
    ] as const) {
      const { context, page: tab } = await signedIn(browser, page, options)
      await tab.goto(`/app/universes/${w.id}/lore?type=${w.rootId}`)
      await expect(cards(tab)).toHaveCount(12)
      const card = (await cards(tab).first().boundingBox())!
      measured[label] = { columns: await columns(tab), card: card.width }
      const overflow = await tab.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, label).toBeLessThanOrEqual(0)
      await expect(tab.getByLabel('Items per page')).toBeAttached()
      await context.close()
    }

    // Columns come from the width: a wide monitor holds more than a laptop, a laptop more than a phone.
    expect(measured['1920'].columns).toBeGreaterThan(measured['1440'].columns)
    expect(measured['1536'].columns).toBeGreaterThan(measured['1440'].columns)
    expect(measured['1440'].columns).toBeGreaterThan(measured['390'].columns)
    expect(measured['390'].columns).toBe(1)
    // And the cards stay a card's width rather than stretching to fill.
    for (const label of ['1920', '1536', '1440', '1024', '200%']) {
      expect(measured[label].card, label).toBeGreaterThanOrEqual(255)
      expect(measured[label].card, label).toBeLessThanOrEqual(420)
    }
  })
})
