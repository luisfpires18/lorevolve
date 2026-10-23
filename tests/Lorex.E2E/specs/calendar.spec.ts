import { expect, test, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'

/**
 * Refinement 039: a universe's own calendar (ADR 0022 amendment). Simple dates by default; a custom calendar of named
 * months of any length, chosen on the Chronology page; every date names its month by id, so a rename or a reorder shows
 * everywhere at once without touching a date; a day runs to its own month's length; and going back to simple dates is
 * refused while a date would not fit.
 *
 * Each test registers its own account with a throwaway password and builds its world through the API.
 */

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('months')
  const password = makeTestPassword()
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function api<T>(page: Page, method: 'POST' | 'PUT' | 'DELETE', path: string, data?: unknown) {
  const response = await page.request.fetch(path, { method, data })
  expect(response.ok(), `${method} ${path} answered ${response.status()}`).toBe(true)
  return (response.status() === 204 ? null : await response.json()) as T
}

async function universe(page: Page) {
  return (
    await api<{ id: string }>(page, 'POST', '/api/universes', {
      name: unique('Frostmarch '),
      description: null,
      accentColor: null,
    })
  ).id
}

interface Month {
  id: string
  name: string
  dayCount: number
}

const SEASONS = [
  ['Frostwane', 42],
  ['Emberrise', 18],
  ['Highsun', 63],
  ['Ashfall', 27],
] as const

async function seedCalendar(page: Page, u: string) {
  const chronology = await api<{ calendar: { months: Month[] } }>(
    page,
    'PUT',
    `/api/universes/${u}/chronology/calendar`,
    {
      months: SEASONS.map(([name, dayCount]) => ({ id: null, name, abbreviation: null, dayCount })),
    },
  )
  return Object.fromEntries(chronology.calendar.months.map((month) => [month.name, month.id]))
}

function moment(title: string, year: number, monthId: string, day: number | null) {
  return {
    title,
    description: null,
    canonStatus: 0,
    dateKind: 0,
    startYear: year,
    startMonth: null,
    startMonthId: monthId,
    startDay: day,
    endYear: null,
    endMonth: null,
    endDay: null,
    eraLabel: null,
    entityIds: [],
  }
}

function months(page: Page) {
  return page.getByTestId('month')
}

function item(page: Page, title: string) {
  return page.locator(`[data-testid="timeline-item"][data-title="${title}"]`)
}

async function expectTitles(page: Page, expected: string[]) {
  await expect
    .poll(() =>
      page
        .getByTestId('timeline-item')
        .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-title'))),
    )
    .toEqual(expected)
}

async function expectNoSidewaysScroll(page: Page, where: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow, `${where} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1)
}

test.describe('custom calendar', () => {
  test('a calendar of the world’s own months is set up on the Chronology page and kept', async ({
    page,
  }) => {
    await signUp(page)
    const u = await universe(page)
    await page.goto(`/app/universes/${u}/chronology`)

    // Simple dates are the default, and say what they are without asking for anything.
    const calendar = page.getByTestId('calendar-settings')
    await expect(calendar.getByRole('heading', { name: 'Calendar' })).toBeVisible()
    await expect(page.getByTestId('calendar-mode-simple')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('calendar-note')).toContainText('months 1 to 12, days 1 to 31')
    await expect(months(page)).toHaveCount(0)
    await expect(page.getByTestId('save-calendar')).toHaveCount(0)

    // Choosing a custom calendar opens one month to name, focused.
    await page.getByTestId('calendar-mode-custom').click()
    await expect(months(page)).toHaveCount(1)
    await expect(months(page).first().getByLabel('Name', { exact: true })).toBeFocused()

    for (const [index, [name, days]] of SEASONS.entries()) {
      if (index > 0) await page.getByTestId('add-month').click()
      const row = months(page).nth(index)
      await expect(row.getByLabel('Name', { exact: true })).toBeFocused()
      await row.getByLabel('Name', { exact: true }).fill(name)
      await row.getByLabel('Days').fill(String(days))
    }

    await page.getByTestId('save-calendar').click()
    await expect(page.getByTestId('calendar-status')).toHaveText('Saved')
    await expect(page.getByTestId('calendar-mode-custom')).toHaveAttribute('aria-pressed', 'true')

    await page.reload()
    await expect(months(page)).toHaveCount(4)
    for (const [index, [name, days]] of SEASONS.entries()) {
      await expect(months(page).nth(index).getByLabel('Name', { exact: true })).toHaveValue(name)
      await expect(months(page).nth(index).getByLabel('Days')).toHaveValue(String(days))
      await expect(months(page).nth(index).getByTestId('month-use')).toHaveCount(0)
    }
  })

  test('dates name their month: a day runs to the month’s end, and renames and reorders show everywhere', async ({
    page,
  }) => {
    await signUp(page)
    const u = await universe(page)
    const id = await seedCalendar(page, u)
    const story = await api<{ id: string }>(page, 'POST', `/api/universes/${u}/stories`, {
      title: 'The Long Thaw',
      premise: null,
      status: 1,
    })
    await api(page, 'POST', `/api/universes/${u}/stories/${story.id}/scenes`, {
      title: 'Frost scene',
      summary: null,
      notes: null,
      povEntityId: null,
      chronology: { eraId: null, year: 40, month: null, day: 10, monthId: id.Frostwane },
      entityIds: [],
      chapterId: null,
    })
    await api(
      page,
      'POST',
      `/api/universes/${u}/timeline`,
      moment('Frost market', 10, id.Frostwane, 2),
    )

    // A moment in Emberrise, which has 18 days: day 19 is held back, day 18 is kept.
    await page.goto(`/app/universes/${u}/timeline`)
    await page.getByTestId('new-moment').click()
    await page.getByTestId('moment-title').fill('Ember feast')
    await page.getByTestId('moment-startYear').fill('10')
    const day = page.getByTestId('moment-startDay')
    await expect(day).toBeDisabled()
    await page.getByTestId('moment-startMonth').selectOption({ label: 'Emberrise · 18 days' })
    await expect(day).toHaveAttribute('max', '18')
    await day.fill('19')
    await page.getByTestId('save-moment').click()
    await expect(page.getByTestId('moment-form')).toBeVisible()
    expect(await day.evaluate((input: HTMLInputElement) => input.validity.rangeOverflow)).toBe(true)
    await day.fill('18')
    await page.getByTestId('save-moment').click()
    await expect(page.getByTestId('moment-form')).toHaveCount(0)

    await expect(item(page, 'Ember feast').locator('.moment__when')).toHaveText('18 Emberrise · 10')
    await expect(item(page, 'Frost scene').locator('.moment__when')).toHaveText('10 Frostwane · 40')
    await expectTitles(page, ['Frost market', 'Ember feast', 'Frost scene'])

    // Frostwane moves after Emberrise: the timeline follows, and no date was edited.
    await page.goto(`/app/universes/${u}/chronology`)
    await months(page).first().getByTestId('month-later').click()
    await expect(page.getByTestId('month-moved')).toHaveText('Frostwane is now 2 of 4.')
    await expect(months(page).nth(1).getByTestId('month-later')).toBeFocused()
    await page.getByTestId('save-calendar').click()
    await expect(page.getByTestId('calendar-status')).toHaveText('Saved')
    await page.goto(`/app/universes/${u}/timeline`)
    await expectTitles(page, ['Ember feast', 'Frost market', 'Frost scene'])

    // Frostwane becomes Snowrest: the scene and the moment say so at once.
    await page.goto(`/app/universes/${u}/chronology`)
    await months(page).nth(1).getByLabel('Name', { exact: true }).fill('Snowrest')
    await page.getByTestId('save-calendar').click()
    await expect(page.getByTestId('calendar-status')).toHaveText('Saved')
    await page.goto(`/app/universes/${u}/timeline`)
    await expect(item(page, 'Frost scene').locator('.moment__when')).toHaveText('10 Snowrest · 40')
    await expect(item(page, 'Frost market').locator('.moment__when')).toHaveText('2 Snowrest · 10')
    await page.goto(`/app/universes/${u}/stories/${story.id}`)
    await expect(page.getByTestId('scene-when').first()).toHaveText('10 Snowrest · 40')

    // Snowrest dates two things, so it stays, and says why.
    await page.goto(`/app/universes/${u}/chronology`)
    const snowrest = months(page).nth(1)
    await expect(snowrest.getByTestId('month-use')).toHaveText('Used by 2 dates, up to day 10')
    await expect(snowrest.getByTestId('month-remove')).toHaveAttribute('aria-disabled', 'true')
    await expect(snowrest.getByTestId('month-remove')).toHaveAccessibleDescription(
      /In use\. Change its dates before removing it\./,
    )
    await snowrest.getByTestId('month-remove').click({ force: true })
    await expect(months(page)).toHaveCount(4)

    // The server says the same in words, should anything ask it directly.
    const refused = await page.request.put(`/api/universes/${u}/chronology/calendar`, {
      data: { months: [{ id: id.Emberrise, name: 'Emberrise', abbreviation: null, dayCount: 18 }] },
    })
    expect(refused.status()).toBe(409)
    expect((await refused.json()).detail).toContain(
      '"Snowrest" is still used by 2 dated scenes or timeline moments',
    )
  })

  test('going back to simple dates waits until every date fits twelve months of up to 31 days', async ({
    page,
  }) => {
    await signUp(page)
    const u = await universe(page)
    const id = await seedCalendar(page, u)
    await api(
      page,
      'POST',
      `/api/universes/${u}/timeline`,
      moment('Ember feast', 10, id.Emberrise, 18),
    )
    const long = await api<{ id: string }>(
      page,
      'POST',
      `/api/universes/${u}/timeline`,
      moment('Long noon', 10, id.Highsun, 40),
    )

    await page.goto(`/app/universes/${u}/chronology`)
    await page.getByTestId('calendar-mode-simple').click()
    await expect(page.getByTestId('calendar-note')).toContainText('12 months of up to 31 days')
    await expect(page.getByTestId('save-calendar')).toHaveText('Switch to simple dates')
    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByTestId('save-calendar').click()
    await expect(page.getByTestId('calendar-error')).toContainText(
      'a date in "Highsun" uses day 40',
    )
    await expect(page.getByTestId('calendar-mode-simple')).toHaveAttribute('aria-pressed', 'true')

    // Nothing changed meanwhile: the calendar is still there.
    await page.reload()
    await expect(page.getByTestId('calendar-mode-custom')).toHaveAttribute('aria-pressed', 'true')

    // With the long day gone - out of the Trash too, where a moment keeps its date - it switches, and each month is its
    // number again.
    await api(page, 'DELETE', `/api/universes/${u}/timeline/${long.id}`)
    await api(page, 'DELETE', `/api/universes/${u}/trash/timeline/${long.id}`)
    await page.getByTestId('calendar-mode-simple').click()
    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByTestId('save-calendar').click()
    await expect(page.getByTestId('calendar-note')).toContainText('months 1 to 12, days 1 to 31')
    await expect(months(page)).toHaveCount(0)

    await page.goto(`/app/universes/${u}/timeline`)
    await expect(item(page, 'Ember feast').locator('.moment__when')).toHaveText('10.02.18')
  })

  for (const width of [390, 360]) {
    test(`the calendar and the date controls fit a ${width}px phone`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await signUp(page)
      const u = await universe(page)
      await api(page, 'PUT', `/api/universes/${u}/chronology/calendar`, {
        months: Array.from({ length: 12 }, (_, index) => ({
          id: null,
          name:
            index === 3 ? 'The Month of Long Shadows Over the Salt Marshes' : `Month ${index + 1}`,
          abbreviation: null,
          dayCount: 30 + index,
        })),
      })

      await page.goto(`/app/universes/${u}/chronology`)
      await expect(months(page)).toHaveCount(12)
      await expectNoSidewaysScroll(page, 'Chronology')

      const row = months(page).nth(3)
      for (const control of [
        row.getByLabel('Name', { exact: true }),
        row.getByLabel('Days'),
        row.getByTestId('month-earlier'),
        row.getByTestId('month-remove'),
      ]) {
        const box = (await control.boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
      }

      await page.goto(`/app/universes/${u}/timeline`)
      await page.getByTestId('new-moment').click()
      await page.getByTestId('moment-startMonth').selectOption({ index: 4 })
      await expect(page.getByTestId('moment-startDay')).toBeEnabled()
      await expectNoSidewaysScroll(page, 'the moment drawer')
    })
  }
})
