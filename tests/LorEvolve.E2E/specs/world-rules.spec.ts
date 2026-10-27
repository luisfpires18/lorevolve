import { expect, test, type Page } from '@playwright/test'
import { acceptConfirm, answerConfirms, confirmDialog } from './support/confirm'

/**
 * World Rules, end to end (ADR 0033): explicit statements, in the author's words, about how one universe works.
 *
 * The section opens empty and says what a rule is; a rule is created, refused without a title, edited by button and
 * keyboard, and kept through a reload and at its own address; a save over a rule saved elsewhere is refused and the author
 * chooses; leaving unsaved changes asks once, however the rule is left; delete sends a rule to the Trash and the Trash brings
 * it back; the universe's search bar finds a rule by its title or its description and opens that rule; and the screens read
 * on a phone, in the dark and in the light, with long, unbroken and right-to-left words.
 *
 * Each test registers its own account and builds what it needs through the API, and every word searched for is its own.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('ruler')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

/** One API call as the signed-in account, refused loudly. */
async function api<T>(
  page: Page,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  data?: unknown,
) {
  const response = await page.request.fetch(url, { method, data })
  expect(response.ok(), `${method} ${url} answered ${response.status()}`).toBe(true)
  return (response.status() === 204 ? null : await response.json()) as T
}

interface RuleRead {
  id: string
  title: string
  description: string
  updatedAt: string
}

async function seedUniverse(page: Page) {
  const universe = await api<{ id: string }>(page, 'POST', '/api/universes', {
    name: unique('Ruled '),
    description: null,
    accentColor: '#4f6bd6',
  })
  return universe.id
}

function rulesApi(universeId: string) {
  return `/api/universes/${universeId}/world-rules`
}

async function seedRule(page: Page, universeId: string, title: string, description = '') {
  return api<RuleRead>(page, 'POST', rulesApi(universeId), {
    title,
    description,
    expectedUpdatedAt: null,
  })
}

async function readRule(page: Page, universeId: string, id: string) {
  return api<RuleRead>(page, 'GET', `${rulesApi(universeId)}/${id}`)
}

/** Saves straight through the API, as another window or device would, over whatever is stored now. */
async function writeElsewhere(page: Page, universeId: string, id: string, description: string) {
  const current = await readRule(page, universeId, id)
  await api(page, 'PUT', `${rulesApi(universeId)}/${id}`, {
    title: current.title,
    description,
    expectedUpdatedAt: current.updatedAt,
  })
}

/** Saves through the page and waits until the API has confirmed it and the page says so. */
async function saveWith(page: Page, action: () => Promise<void>) {
  await Promise.all([
    page.waitForResponse(
      (response) =>
        /\/world-rules(\/[0-9a-f-]+)?$/.test(new URL(response.url()).pathname) &&
        ['PUT', 'POST'].includes(response.request().method()) &&
        response.ok(),
    ),
    action(),
  ])
  await expect(page.getByTestId('world-rule-status')).toHaveText('Saved')
}

function searchBox(page: Page) {
  return page.getByRole('combobox', { name: 'Search this universe' })
}

function results(page: Page) {
  return page.getByRole('listbox', { name: 'Results' }).getByRole('option')
}

/** The one result of a kind, by the title it shows. */
function result(page: Page, kind: string, title: string) {
  return results(page)
    .filter({ has: page.getByText(kind, { exact: true }) })
    .filter({ has: page.getByText(title, { exact: true }) })
}

/** Types into the bar and waits for the answer to exactly that, shown. */
async function search(page: Page, text: string) {
  const answered = page.waitForResponse(
    (response) =>
      response.url().includes('/search?') &&
      new URL(response.url()).searchParams.get('q') === text.trim(),
  )
  await searchBox(page).fill(text)
  await answered
  await expect(page.getByTestId('universe-search-searching')).toBeHidden()
}

/** Whether the page can be scrolled sideways, which no screen in LorEvolve may allow. */
function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

function pathname(page: Page) {
  return new URL(page.url()).pathname
}

test.describe('world rules', () => {
  test('the section opens empty, and a rule is created, refused without a title, edited by button and keyboard, and kept at its own address', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page)
    const base = `/app/universes/${universeId}`

    await page.goto(base)
    await page.getByTestId('workspace-world-rules').click()
    await page.waitForURL(`${base}/world-rules`)
    await expect(page.getByTestId('workspace-world-rules')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('heading', { name: 'World Rules', level: 1 })).toBeVisible()
    await expect(page.getByTestId('world-rules-empty')).toContainText(
      'World Rules define explicit constraints for how this universe works',
    )
    // Nothing on the screen claims a rule is checked.
    await expect(page.locator('main')).not.toContainText(/validat|no conflicts/i)

    // By keyboard to a new rule, which starts in its title.
    await page.getByTestId('new-world-rule').focus()
    await page.keyboard.press('Enter')
    await page.waitForURL(`${base}/world-rules/new`)
    await expect(page.getByTestId('world-rule-heading')).toHaveText('New rule')

    const title = page.getByLabel('Title', { exact: true })
    const description = page.getByLabel('Description', { exact: true })
    await expect(title).toHaveAttribute('data-testid', 'world-rule-title')
    await expect(description).toHaveAttribute('data-testid', 'world-rule-description')
    await expect(title).toBeFocused()

    // Without a title nothing is saved, and the author is told where.
    await description.fill('Not even the Quorrel wardens may step through.')
    await expect(page.getByTestId('world-rule-status')).toHaveText('Unsaved changes')
    await page.getByTestId('world-rule-save').click()
    await expect(page.getByTestId('world-rule-title-error')).toHaveText(
      'Give the rule a title, so you can find it again.',
    )
    await expect(title).toHaveAttribute('aria-invalid', 'true')
    await expect(title).toBeFocused()
    expect(pathname(page)).toBe(`${base}/world-rules/new`)

    await title.fill('Teleportation cannot cross the Veil')
    await expect(page.getByTestId('world-rule-title-error')).toHaveCount(0)
    await saveWith(page, () => page.getByTestId('world-rule-save').click())
    await page.waitForURL(/\/world-rules\/[0-9a-f-]{36}$/)
    const ruleId = pathname(page).split('/').pop()!
    await expect(page.getByTestId('world-rule-heading')).toHaveText(
      'Teleportation cannot cross the Veil',
    )
    await expect(page.getByTestId('world-rule-announcer')).toHaveText('Rule created.')

    // Edited, and saved by keyboard.
    const written = 'Not even the Quorrel wardens may step through.\n\nNor the tide. 北の門'
    await description.fill(written)
    await expect(page.getByTestId('world-rule-status')).toHaveText('Unsaved changes')
    await saveWith(page, () => page.keyboard.press('Control+s'))
    // Said once, by the save's own status - not a second time by the announcer.
    await expect(page.getByTestId('world-rule-status')).toHaveText('Saved')

    // Kept through a reload, and at its own address.
    await page.reload()
    await expect(description).toHaveValue(written)
    await page.goto('/app')
    await page.goto(`${base}/world-rules/${ruleId}`)
    await expect(title).toHaveValue('Teleportation cannot cross the Veil')
    await expect(page.getByTestId('world-rule-status')).toHaveText('Saved')

    // The list: by title, whatever the case, each with the start of what it says.
    await seedRule(page, universeId, 'a bonded dragon dies if its rider dies')
    await page.getByTestId('world-rule-back').click()
    await page.waitForURL(`${base}/world-rules`)
    const rows = page.getByTestId('world-rule-row')
    await expect(rows).toHaveCount(2)
    await expect(rows.first()).toHaveAttribute(
      'data-title',
      'a bonded dragon dies if its rider dies',
    )
    await expect(rows.nth(1)).toContainText('Not even the Quorrel wardens')
  })

  test('a save over a rule saved in another window is refused, and the author keeps theirs or loads that one', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page)
    const rule = await seedRule(page, universeId, 'The dead stay dead', 'Mostly.')

    await page.goto(`/app/universes/${universeId}/world-rules/${rule.id}`)
    const description = page.getByTestId('world-rule-description')
    await expect(description).toHaveValue('Mostly.')

    await description.fill('Always, in this window.')
    await writeElsewhere(page, universeId, rule.id, 'Always, in another window.')

    await page.getByTestId('world-rule-save').click()
    const conflict = page.getByTestId('world-rule-conflict')
    await expect(conflict).toBeVisible()
    await expect(conflict).toHaveAttribute('role', 'alert')
    await expect(description).toHaveValue('Always, in this window.')
    expect((await readRule(page, universeId, rule.id)).description).toBe(
      'Always, in another window.',
    )

    await saveWith(page, () => page.getByTestId('world-rule-keep-mine').click())
    await expect(conflict).toHaveCount(0)
    expect((await readRule(page, universeId, rule.id)).description).toBe('Always, in this window.')

    // Again, and this time the other window's version is loaded - after asking.
    await description.fill('A third thought.')
    await writeElsewhere(page, universeId, rule.id, 'The other window wins.')
    await page.getByTestId('world-rule-save').click()
    await expect(conflict).toBeVisible()

    await page.getByTestId('world-rule-load-saved').click()
    await acceptConfirm(page)
    await expect(description).toHaveValue('The other window wins.')
    await expect(page.getByTestId('world-rule-status')).toHaveText('Saved')
  })

  test('leaving unsaved changes asks once, however the rule is left, and staying keeps them', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page)
    const base = `/app/universes/${universeId}`
    const rule = await seedRule(page, universeId, 'Magic has a cost', 'Always.')
    await seedRule(page, universeId, 'Wyvernsong binds the Pale Court')

    const questions: string[] = []
    let answer: 'stay' | 'leave' = 'stay'
    await answerConfirms(page, () => answer === 'leave', questions)

    await page.goto(`${base}/world-rules`)
    await page
      .getByTestId('world-rule-row')
      .filter({ hasText: 'Magic has a cost' })
      .getByTestId('world-rule-open')
      .click()
    await page.waitForURL(`${base}/world-rules/${rule.id}`)
    const description = page.getByTestId('world-rule-description')
    await description.fill('Always, and it is paid in years.')
    const here = `${base}/world-rules/${rule.id}`

    // A link.
    await page.getByTestId('workspace-timeline').click()
    await expect.poll(() => questions.length).toBe(1)
    await expect
      .poll(() => questions[0])
      .toBe('“Magic has a cost” has unsaved changes. Leave without saving them?')
    await expect(description).toHaveValue('Always, and it is paid in years.')
    expect(pathname(page)).toBe(here)

    // The browser's Back.
    await page.goBack()
    await expect.poll(() => questions.length).toBe(2)
    await expect(description).toHaveValue('Always, and it is paid in years.')
    expect(pathname(page)).toBe(here)

    // A search result that opens another rule.
    await search(page, 'Wyvernsong')
    await result(page, 'World rule', 'Wyvernsong binds the Pale Court').click()
    await expect.poll(() => questions.length).toBe(3)
    await expect(description).toHaveValue('Always, and it is paid in years.')
    expect(pathname(page)).toBe(here)

    // Leaving by choice leaves, asked once, and nothing was saved.
    answer = 'leave'
    await page.getByTestId('workspace-timeline').click()
    await page.waitForURL(`${base}/timeline`)
    await expect.poll(() => questions).toHaveLength(4)
    expect((await readRule(page, universeId, rule.id)).description).toBe('Always.')
  })

  test('delete sends a rule to the Trash, the Trash says what it is, and a restore brings it back where it lives', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page)
    const base = `/app/universes/${universeId}`
    await seedRule(page, universeId, 'Kept rule')
    const name = 'A bonded dragon dies if its rider dies'
    const rule = await seedRule(page, universeId, name, 'The bond is one life.')

    await page.goto(`${base}/world-rules/${rule.id}`)
    await page.getByTestId('world-rule-actions').click()
    await page.getByTestId('world-rule-delete').click()
    await expect(confirmDialog(page).locator('.confirm__title')).toHaveText(
      `Move “${name}” to the Trash?`,
    )
    await acceptConfirm(page, 'You can restore it from the Trash.')
    await page.waitForURL(`${base}/world-rules`)
    await expect(page.getByTestId('world-rules-deleted-notice')).toContainText(
      `“${name}” was moved to the Trash.`,
    )
    await expect(page.getByTestId('world-rule-row')).toHaveCount(1)

    // Gone from its address, which says where to look.
    await page.goto(`${base}/world-rules/${rule.id}`)
    await expect(page.getByTestId('world-rule-missing')).toBeVisible()

    // In the Trash, as a world rule, in words.
    await page.getByRole('link', { name: 'Open the Trash' }).click()
    await page.waitForURL(`${base}/trash`)
    const row = page.getByTestId(`trash-row-${name}`)
    await expect(row).toBeVisible()
    await expect(row.getByTestId('trash-kind')).toHaveText('World rule')
    await expect(row).toContainText('In World Rules')

    await row.getByRole('button', { name: `Restore world rule “${name}”` }).click()
    await expect(page.getByTestId('trash-message')).toHaveText(
      `The world rule “${name}” is back in World Rules.`,
    )
    await expect(page.getByTestId('trash-message')).toHaveAttribute('role', 'status')
    await expect(page.getByTestId('trash-empty')).toBeVisible()

    await page.getByTestId('trash-open').click()
    await page.waitForURL(`${base}/world-rules/${rule.id}`)
    await expect(page.getByTestId('world-rule-description')).toHaveValue('The bond is one life.')
  })

  test('the search bar finds a rule by its title or its description, labelled as a world rule, and opens that rule at an address Back leaves', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page)
    const base = `/app/universes/${universeId}`
    const rule = await seedRule(
      page,
      universeId,
      'Quennelmark bonds break at dawn',
      'Only the Tarrowlight wardens remember why.',
    )
    const binned = await seedRule(page, universeId, 'Hollowquay rule', 'In the Trash.')
    await api(page, 'DELETE', `${rulesApi(universeId)}/${binned.id}`)

    await page.goto(`${base}/timeline`)

    // By its title.
    await search(page, 'Quennelmark')
    await expect(results(page)).toHaveCount(1)
    await result(page, 'World rule', 'Quennelmark bonds break at dawn').click()
    await page.waitForURL(`${base}/world-rules/${rule.id}`)
    await expect(page.getByTestId('world-rule-heading')).toHaveText(
      'Quennelmark bonds break at dawn',
    )
    await expect(page.getByTestId('workspace-world-rules')).toHaveAttribute('aria-current', 'page')

    await page.goBack()
    await page.waitForURL(`${base}/timeline`)

    // By its description alone: the words around the match, the same rule, by keyboard.
    await search(page, 'Tarrowlight')
    const described = result(page, 'World rule', 'Quennelmark bonds break at dawn')
    await expect(described).toContainText('In the description')
    await expect(described.locator('mark')).toHaveText('Tarrowlight')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.waitForURL(`${base}/world-rules/${rule.id}`)
    await expect(page.getByTestId('universe-search-announcer')).toHaveText(
      'Opened World rule “Quennelmark bonds break at dawn”.',
    )

    // The address is the rule: a reload opens it again.
    await page.reload()
    await expect(page.getByTestId('world-rule-title')).toHaveValue(
      'Quennelmark bonds break at dawn',
    )

    // A rule in the Trash is not found.
    await search(page, 'Hollowquay')
    await expect(page.getByTestId('universe-search-empty')).toBeVisible()
    await expect(results(page)).toHaveCount(0)
  })

  test('World Rules read on a phone, in the dark and in the light, with long, unbroken and right-to-left words', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.setViewportSize({ width: 390, height: 844 })
    await signUp(page)
    const universeId = await seedUniverse(page)
    const base = `/app/universes/${universeId}`
    const rtl =
      'لا يعبر النقل الآني الحجاب أبدا مهما كانت قوة الساحر أو عمر التنين الذي يحمله عبر البحر'
    const description = `${'ᚠ'.repeat(160)}\n\nשבע שנים 七年 and the Veil.`
    const rule = await seedRule(page, universeId, rtl, description)

    // The section, from the folded bar.
    await page.goto(base)
    await page.getByTestId('workspace-nav-toggle').click()
    await page.getByTestId('workspace-world-rules').click()
    await page.waitForURL(`${base}/world-rules`)
    await expect(page.getByTestId('world-rule-row')).toHaveCount(1)
    expect(await scrollsSideways(page)).toBe(false)
    const row = (await page.getByTestId('world-rule-row').boundingBox())!
    expect(row.x + row.width).toBeLessThanOrEqual(391)

    // One rule: every control inside the screen.
    await page.getByTestId('world-rule-open').click()
    await page.waitForURL(`${base}/world-rules/${rule.id}`)
    await expect(page.getByTestId('world-rule-heading')).toHaveText(rtl)
    await expect(page.getByTestId('world-rule-description')).toHaveValue(description)
    expect(await scrollsSideways(page)).toBe(false)

    for (const id of [
      'world-rule-heading',
      'world-rule-title',
      'world-rule-description',
      'world-rule-save',
      'world-rule-actions',
    ]) {
      const box = (await page.getByTestId(id).boundingBox())!
      expect(box.x, id).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width, id).toBeLessThanOrEqual(391)
    }

    // The keyboard moves from the title to the description, and the focus shows: the box takes the accent. The edge eases
    // over 120ms, so it is read until it has moved rather than in the frame the focus lands in.
    const focused = page.getByTestId('world-rule-description')
    const edge = () => focused.evaluate((element) => getComputedStyle(element).borderTopColor)
    await page.getByTestId('world-rule-title').focus()
    const unfocused = await edge()
    await page.keyboard.press('Tab')
    await expect(focused).toBeFocused()
    await expect.poll(edge).not.toBe(unfocused)

    // A new rule on a phone.
    await page.goto(`${base}/world-rules/new`)
    await expect(page.getByTestId('world-rule-title')).toBeFocused()
    expect(await scrollsSideways(page)).toBe(false)

    // And in the light, on a desktop.
    await page.emulateMedia({ colorScheme: 'light' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${base}/world-rules/${rule.id}`)
    await expect(page.getByTestId('world-rule-heading')).toHaveText(rtl)
    expect(await scrollsSideways(page)).toBe(false)
    await page.goto(`${base}/world-rules`)
    await expect(page.getByTestId('world-rule-row')).toHaveCount(1)
    expect(await scrollsSideways(page)).toBe(false)
  })
})
