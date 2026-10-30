import { expect, test, type Browser, type Page } from '@playwright/test'
import { acceptConfirm } from './support/confirm'

/**
 * Refinement 018: Chronology explains itself in date periods. Authors see "date period"; the API still says era
 * (ADR 0022, amended), so the requests and test ids here do too.
 *
 * What is pinned: the page says what Chronology is and that periods are optional; the controls read as product
 * language, not enums; nothing on the page draws a range or a year limit (the old preview's hard-coded 120 read as
 * one); a period's years run as far as the author's dates go - TA 3018 among them; the order is the author's and
 * survives a reload; and dates written before any period existed are said to be kept, not lost.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('period')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function api<T>(page: Page, method: string, path: string, data?: object) {
  const response = await page.request.fetch(path, { method, data })
  expect(response.ok(), `${method} ${path}`).toBe(true)
  return (await response.json()) as T
}

async function universe(page: Page, name = unique('Reach ')) {
  return (await api<{ id: string }>(page, 'POST', '/api/universes', {
    name,
    description: null,
    accentColor: null,
  }))!.id
}

interface PeriodSeed {
  name: string
  abbreviation: string | null
  direction?: 0 | 1
  labelPosition?: 0 | 1
}

async function seedPeriods(page: Page, universeId: string, periods: PeriodSeed[]) {
  const saved = await api<{ eras: { id: string; name: string }[] }>(
    page,
    'PUT',
    `/api/universes/${universeId}/chronology`,
    {
      eras: periods.map((period) => ({
        id: null,
        name: period.name,
        abbreviation: period.abbreviation,
        direction: period.direction ?? 0,
        labelPosition: period.labelPosition ?? 0,
      })),
    },
  )
  return saved.eras
}

async function plainMoment(page: Page, universeId: string, title: string, year: number) {
  await api(page, 'POST', `/api/universes/${universeId}/timeline`, {
    title,
    description: null,
    canonStatus: 0,
    dateKind: 0,
    startYear: year,
    startMonth: null,
    startDay: null,
    endYear: null,
    endMonth: null,
    endDay: null,
    eraLabel: null,
    entityIds: [],
  })
}

const noSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

/** The words the page shows, for pins on what it must never say. */
const pageText = (page: Page) => page.locator('main').innerText()

test.describe('chronology date periods', () => {
  test('Chronology explains plain years, and a new date period reads in product language with no range', async ({
    page,
  }) => {
    await signUp(page)
    const id = await universe(page)
    await page.goto(`/app/universes/${id}/chronology`)

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chronology')
    await expect(page.locator('.pageheader__lede')).toHaveText(
      'Choose how dates are written and ordered in this universe.',
    )
    await expect(page.getByRole('heading', { level: 2, name: 'Date periods' })).toBeVisible()
    const empty = page.getByTestId('chronology-empty')
    await expect(empty).toContainText('This universe uses plain numbered years.')
    await expect(empty).toContainText('They are optional.')
    await expect(page.getByTestId('save-chronology')).toHaveCount(0)
    expect(await pageText(page)).not.toMatch(/\bEras?\b/)

    // The empty state's own button adds the first period and hands its name the focus.
    await empty.getByTestId('add-era-empty').click()
    const card = page.getByTestId('era')
    await expect(card).toHaveCount(1)
    await expect(card.getByTestId('era-name')).toBeFocused()
    await expect(page.getByTestId('chronology-empty')).toHaveCount(0)

    // Product labels, each tied to its control.
    await expect(card.getByLabel('Name')).toBeVisible()
    await expect(card.getByLabel('Short label (optional)')).toBeVisible()
    await expect(card.getByRole('group', { name: 'Years count' })).toBeVisible()
    await expect(card.getByRole('group', { name: 'Write dates as' })).toBeVisible()

    await page.keyboard.type('Third Age')
    await card.getByTestId('era-abbreviation').fill('TA')

    // Counting up: chosen by default, said without colour, and with no end.
    await expect(card.getByTestId('era-direction-up')).toHaveAttribute('aria-pressed', 'true')
    await expect(card.getByTestId('era-direction-down')).toHaveAttribute('aria-pressed', 'false')
    await expect(card.getByTestId('era-run')).toContainText('1 → 2 → 3 → …')
    await expect(card.getByTestId('era-run')).toContainText('No set end.')

    // Counting down: toward 1, the year before the next period.
    await card.getByTestId('era-direction-down').click()
    await expect(card.getByTestId('era-direction-down')).toHaveAttribute('aria-pressed', 'true')
    await expect(card.getByTestId('era-run')).toContainText('… → 3 → 2 → 1')
    await expect(card.getByTestId('era-run')).toContainText(
      'Year 1 is the last before the next period.',
    )
    await card.getByTestId('era-direction-up').click()

    // The format choice previews the author's own label, and an example of 10 is all it shows.
    await expect(card.getByTestId('era-position-before')).toHaveText('TA 10')
    await expect(card.getByTestId('era-position-after')).toHaveText('10 TA')
    await card.getByTestId('era-position-after').click()
    await expect(card.getByTestId('era-position-after')).toHaveAttribute('aria-pressed', 'true')

    // No range, no limit, no enum words, no Era.
    const text = await pageText(page)
    expect(text).not.toContain('120')
    expect(text).not.toMatch(/\b(range|maximum|first year|last year|ascending|descending)\b/i)
    expect(text).not.toMatch(/BeforeYear|AfterYear/)
    expect(text).not.toMatch(/\bEras?\b/)
    await expect(page.getByTestId('era-preview')).toHaveCount(0)

    await page.getByTestId('save-chronology').click()
    await expect(page.getByTestId('chronology-status')).toHaveText('Saved')
    await expect(page.getByTestId('chronology-note')).toContainText('none has a set length')
  })

  test('Ages keep the author’s order, and TA 3018 is written, read and ordered in its period', async ({
    page,
  }) => {
    await signUp(page)
    const id = await universe(page, unique('Middle-earth '))
    await seedPeriods(page, id, [
      { name: 'First Age', abbreviation: 'FA' },
      { name: 'Third Age', abbreviation: 'TA' },
      { name: 'Second Age', abbreviation: 'SA' },
    ])

    // Put right from the editor: the order is semantic, shown and saved.
    await page.goto(`/app/universes/${id}/chronology`)
    const order = page.getByTestId('era-order').locator('li')
    await expect(order).toHaveText(['First Age', 'Third Age', 'Second Age'])
    await expect(page.getByTestId('era').first().getByTestId('era-earlier')).toBeDisabled()
    await expect(page.getByTestId('era').last().getByTestId('era-later')).toBeDisabled()

    const secondAgeEarlier = page.getByRole('button', { name: 'Move Second Age earlier' })
    await secondAgeEarlier.click()
    await expect(order).toHaveText(['First Age', 'Second Age', 'Third Age'])
    await expect(page.getByTestId('era-moved')).toHaveText('Second Age is now 2 of 3.')
    // The moved period's button keeps the focus, so the keyboard can keep moving it.
    await expect(secondAgeEarlier).toBeFocused()
    await page.getByTestId('save-chronology').click()
    await expect(page.getByTestId('chronology-status')).toHaveText('Saved')
    await page.reload()
    await expect(order).toHaveText(['First Age', 'Second Age', 'Third Age'])

    // The timeline asks for a date period, by the author's names.
    await page.goto(`/app/universes/${id}/timeline`)
    for (const [title, period, year] of [
      ['The Council of Elrond', 'Third Age (TA)', '3018'],
      ['Isildur takes the Ring', 'Second Age (SA)', '3441'],
      ['The Stewards begin', 'Third Age (TA)', '2050'],
      ['Beren and Lúthien', 'First Age (FA)', '465'],
    ]) {
      await page.getByTestId('new-moment').click()
      const form = page.getByTestId('moment-form')
      await expect(form.getByLabel('Date period')).toBeVisible()
      await expect(form.getByLabel('Date period').locator('option').first()).toHaveText(
        'Choose a date period',
      )
      await page.getByTestId('moment-title').fill(title)
      await page.getByLabel('Date period').selectOption({ label: period })
      await page.getByTestId('moment-startYear').fill(year)
      await page.getByTestId('save-moment').click()
      await expect(form).toHaveCount(0)
    }

    await expect
      .poll(() =>
        page
          .getByTestId('chron-stream')
          .locator('.chron__yearnum')
          .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? '')),
      )
      .toEqual(['FA 465', 'SA 3441', 'TA 2050', 'TA 3018'])
    // The year heading is the moment's date: TA 3018, never cut off at an imagined 120.
    expect(await pageText(page)).not.toMatch(/\bEras?\b/)

    // A range asks where it starts and ends, in periods.
    await page.getByTestId('new-moment').click()
    await page.getByTestId('moment-kind-range').click()
    await expect(page.getByLabel('Starts in period')).toBeVisible()
    await expect(page.getByLabel('Ends in period')).toBeVisible()
    await page.getByTestId('cancel-moment').click()
    await acceptConfirm(page)

    // A scene's date is placed the same way.
    const story = await api<{ id: string }>(page, 'POST', `/api/universes/${id}/stories`, {
      title: 'The Red Book',
      premise: null,
      status: 1,
    })
    await page.goto(`/app/universes/${id}/stories/${story.id}`)
    await page.getByTestId('new-scene').click()
    const scene = page.getByTestId('scene-form')
    await expect(scene.getByLabel('Date period')).toBeVisible()
    await page.getByTestId('scene-title-input').fill('At the Prancing Pony')
    await scene.getByLabel('Date period').selectOption({ label: 'Third Age (TA)' })
    await page.getByTestId('scene-year').fill('3018')
    await page.getByTestId('save-scene').click()
    await expect(scene).toHaveCount(0)
    await expect(page.getByTestId('scene-when').first()).toHaveText('TA 3018')
  })

  test('dates written before any period are said to be kept, and a period in use says why it stays', async ({
    page,
  }) => {
    await signUp(page)
    const id = await universe(page)
    await plainMoment(page, id, 'Old harvest', 5)
    await plainMoment(page, id, 'Old flood', 12)

    // Before saving the first period: what will happen, not a loss.
    await page.goto(`/app/universes/${id}/chronology`)
    await page.locator('.pageheader').getByTestId('add-era').click()
    await page.keyboard.type('Third Age')
    const warning = page.getByTestId('chronology-unplaced')
    await expect(warning).toContainText('2 existing dates are written as a plain year')
    await expect(warning).toContainText('they stay saved')
    await page.getByTestId('save-chronology').click()
    await expect(page.getByTestId('chronology-status')).toHaveText('Saved')

    // After: they have no period yet, LorEvolve does not guess, and the timeline is one link away.
    await expect(warning).toContainText('2 existing dates don’t have a date period yet')
    await expect(warning).toContainText('(2 timeline moments)')
    await expect(warning).toContainText('They are still saved.')
    await expect(warning).toContainText('doesn’t guess')
    await warning.getByTestId('chronology-unplaced-link').click()
    await page.waitForURL(/\/timeline$/)
    const unplaced = page.getByTestId('chron-unreckoned')
    await expect(unplaced).toContainText('No date period yet')
    await expect(unplaced).toContainText('Still saved')

    // Given one, a moment dates the period, which can no longer simply be removed.
    await page.getByTestId('edit-moment-Old harvest').click()
    const form = page.getByTestId('moment-form')
    await form.getByLabel('Date period').selectOption({ label: 'Third Age' })
    await page.getByTestId('save-moment').click()
    await expect(form).toHaveCount(0)

    await page.goto(`/app/universes/${id}/chronology`)
    const card = page.getByTestId('era')
    await expect(card).toContainText('Dates 1 moment')
    await expect(page.getByTestId('chronology-unplaced')).toContainText('1 existing date doesn’t')
    const remove = card.getByTestId('era-remove')
    await expect(remove).toBeDisabled()
    await expect(remove).toHaveAccessibleName('Remove Third Age')
    await expect(remove).toHaveAccessibleDescription(
      'Dates 1 moment In use. Move its dates to another date period before removing it.',
    )
    await remove.click({ force: true })
    await expect(card).toHaveCount(1)
  })

  test('a period dated only by entry eras or relationship periods still says it is in use', async ({
    page,
  }) => {
    await signUp(page)
    const id = await universe(page)
    await seedPeriods(page, id, [{ name: 'First Age', abbreviation: 'FA' }])

    // Seeding a progression era and a relationship period takes half the product; the editor only reads the counts.
    await page.route(`**/api/universes/${id}/chronology`, async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      try {
        const response = await route.fetch()
        const body = (await response.json()) as { eras: Record<string, unknown>[] }
        body.eras[0] = { ...body.eras[0], entryEraCount: 1, periodCount: 2 }
        await route.fulfill({ response, json: body })
      } catch {
        // Aborted by the page when a newer read of the chronology replaced it; that read is answered instead.
      }
    })

    await page.goto(`/app/universes/${id}/chronology`)
    const card = page.getByTestId('era')
    await expect(card).toContainText('Dates 1 era of an entry and 2 relationship periods')
    await expect(card.getByTestId('era-remove')).toBeDisabled()
  })

  test('periods read right in light and dark, on a phone and at 200% zoom, with right-to-left names isolated', async ({
    browser,
  }) => {
    const setup = await browser.newContext()
    const page = await setup.newPage()
    await signUp(page)
    const id = await universe(page)
    await seedPeriods(page, id, [
      { name: 'Before the Fall', abbreviation: 'BF', direction: 1 },
      { name: 'The Long and Unhurried Years of the Second Reckoning', abbreviation: null },
      { name: 'עידן האור', abbreviation: 'ע״א', labelPosition: 1 },
    ])
    const state = await setup.storageState()
    await setup.close()

    await checkEverySize(browser, state, id)
  })
})

async function checkEverySize(
  browser: Browser,
  state: Awaited<ReturnType<import('@playwright/test').BrowserContext['storageState']>>,
  id: string,
) {
  for (const theme of ['light', 'dark']) {
    for (const size of [
      { width: 360, height: 800, deviceScaleFactor: 1 },
      { width: 390, height: 844, deviceScaleFactor: 1 },
      { width: 640, height: 450, deviceScaleFactor: 2 },
      { width: 1440, height: 900, deviceScaleFactor: 1 },
    ]) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: size.deviceScaleFactor,
        storageState: state,
      })
      await context.addInitScript((t) => localStorage.setItem('lorevolve-theme', t), theme)
      const page = await context.newPage()
      await page.goto(`/app/universes/${id}/chronology`)
      await expect(page.getByTestId('era')).toHaveCount(3)
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
      const where = `${theme} ${size.width}@${size.deviceScaleFactor}x`
      expect(await noSideways(page), where).toBeLessThanOrEqual(0)

      // Every control of the last card, long names and all, is inside the viewport.
      const last = page.getByTestId('era').nth(1)
      for (const control of [
        'era-name',
        'era-position-after',
        'era-direction-down',
        'era-remove',
      ]) {
        const box = await last.getByTestId(control).boundingBox()
        expect(box!.x + box!.width, `${control} ${where}`).toBeLessThanOrEqual(size.width)
      }

      // Authored names and labels are isolated, so the interface's order stays left to right.
      const rtl = page.getByTestId('era').nth(2)
      await expect(rtl.getByTestId('era-position-after').locator('bdi')).toHaveText('ע״א')
      await expect(rtl.getByTestId('era-position-after')).toHaveText('10 ע״א')
      await expect(page.getByTestId('era-order').locator('bdi').nth(2)).toHaveText('עידן האור')
      await context.close()
    }
  }
}
