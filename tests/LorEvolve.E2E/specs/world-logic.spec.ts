import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * World Logic, end to end (#152, ADR 0072): one place that reads both kinds of rule, the Systems that group them, and
 * what checking them found.
 *
 * What these tests are written against is the promise that nothing moved out from under an author. The sidebar now
 * opens World Logic, and every world rule address still works: the list, a rule's own editor, and the new-rule form.
 * The Rules tab shows both kinds and says which each is; Systems shows a System and, when it is opened, the rule
 * definitions it references; Integrity says plainly that nothing has been checked rather than showing an empty list
 * that reads like a clean bill.
 *
 * Each test registers its own account and builds what it needs through the API.
 */
const PASSWORD = 'Test-password-123!'

/** Mirrors WORLD_LOGIC_PAGE_SIZE in src/LorEvolve.Web/src/worldLogic/api.ts. */
const WORLD_LOGIC_PAGE_SIZE = 50

/** The title of each row of either list, which both draw with the same class. */
async function titlesOf(rows: Locator) {
  return rows.locator('.rulerow__title').allInnerTexts()
}

/** Seeds `count` things a few at a time, because one at a time is slow and all at once floods the API. */
async function inBatches(count: number, size: number, make: (at: number) => Promise<unknown>) {
  for (let from = 0; from < count; from += size) {
    const batch = []
    for (let at = from; at < Math.min(from + size, count); at += 1) batch.push(make(at))
    await Promise.all(batch)
  }
}

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('logician')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

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

async function seedUniverse(page: Page) {
  const universe = await api<{ id: string }>(page, 'POST', '/api/universes', {
    name: unique('Logical '),
    description: null,
    accentColor: '#4f6bd6',
  })
  return universe.id
}

/** A rule written with `self`, so a sweep with no target cannot answer it: an unknown, never a pass. */
const purityAtLeastTwo = {
  kind: 'compare',
  left: { attribute: 'Purity', of: { subject: 'self' } },
  op: 'gte',
  right: { literal: 2, type: 'number' },
}

/** Text against a number: the rule itself is broken, which is a third thing again. */
const textAtLeastNumber = {
  kind: 'compare',
  left: { literal: 'two', type: 'text' },
  op: 'gte',
  right: { literal: 2, type: 'number' },
}

/** One named entry is of that type. It names the entry rather than `self`, so a sweep can answer it. */
function entryIsOfType(entryId: string, type: string) {
  return {
    kind: 'compare',
    left: { field: 'type', from: 'subjects', of: { subject: entryId } },
    op: 'eq',
    right: { literal: type, type: 'text' },
  }
}

async function seedEntity(page: Page, universeId: string, name: string) {
  const types = await api<{ id: string; name: string }[]>(
    page,
    'GET',
    `/api/universes/${universeId}/entity-types`,
  )

  return (
    await api<{ id: string }>(page, 'POST', `/api/universes/${universeId}/entities`, {
      entityTypeId: types.find((type) => type.name === 'Character')!.id,
      name,
      summary: null,
      canonStatus: 2,
      aliases: [],
      tags: [],
      fields: [],
    })
  ).id
}

async function seedRule(page: Page, universeId: string, title: string, condition: unknown) {
  return (
    await api<{ id: string }>(page, 'POST', `/api/universes/${universeId}/system-rules`, {
      title,
      description: null,
      schemaVersion: 1,
      condition,
    })
  ).id
}

test.describe('World Logic', () => {
  test('the sidebar opens World Logic, and both kinds of rule are in it', async ({ page }) => {
    await signUp(page)
    const universeId = await seedUniverse(page)
    const base = `/app/universes/${universeId}`

    await api(page, 'POST', `/api/universes/${universeId}/world-rules`, {
      title: 'Blink has a cost',
      description: 'It always does.',
    })

    const definition = await api<{ id: string }>(
      page,
      'POST',
      `/api/universes/${universeId}/system-rules`,
      {
        title: 'Age of majority',
        description: 'Sixteen.',
        schemaVersion: 1,
        condition: purityAtLeastTwo,
      },
    )

    await page.goto(base)
    await page.getByTestId('workspace-world-logic').click()
    await page.waitForURL(`${base}/world-logic`)
    await expect(page.getByTestId('workspace-world-logic')).toHaveAttribute('aria-current', 'page')

    // Both rows are here, each saying which kind it is.
    const rows = page.getByTestId('world-logic-rule-row')
    await expect(rows).toHaveCount(2)

    const worldRule = rows.filter({ hasText: 'Blink has a cost' })
    await expect(worldRule).toHaveAttribute('data-source', 'worldRule')
    await expect(worldRule.getByTestId('world-logic-rule-kind')).toContainText('World rule')

    const ruleDefinition = rows.filter({ hasText: 'Age of majority' })
    await expect(ruleDefinition).toHaveAttribute('data-source', 'systemRule')
    await expect(ruleDefinition.getByTestId('world-logic-rule-kind')).toContainText(
      'Rule definition',
    )
    await expect(ruleDefinition.getByTestId('world-logic-rule-has-condition')).toBeVisible()

    // The world rule opens in its own editor, at its own address.
    await worldRule.getByTestId('world-logic-rule-open').click()
    await page.waitForURL(/\/world-rules\/[0-9a-f-]+$/)
    await expect(page.getByLabel('Title')).toHaveValue('Blink has a cost')

    // And every world rule address still works, typed straight in.
    await page.goto(`${base}/world-rules`)
    await expect(page.getByTestId('world-rule-row')).toHaveCount(1)

    await page.goto(`${base}/world-rules/new`)
    await expect(page.getByLabel('Title')).toHaveValue('')

    expect(definition.id).toMatch(/[0-9a-f-]{36}/)
  })

  test('a System shows the rule definitions it references when it is opened', async ({ page }) => {
    await signUp(page)
    const universeId = await seedUniverse(page)

    const shared = await api<{ id: string }>(
      page,
      'POST',
      `/api/universes/${universeId}/system-rules`,
      {
        title: 'Shared floor',
        description: 'At least two.',
        schemaVersion: 1,
        condition: purityAtLeastTwo,
      },
    )

    const wordsOnly = await api<{ id: string }>(
      page,
      'POST',
      `/api/universes/${universeId}/system-rules`,
      { title: 'Said in words', description: 'No condition.' },
    )

    const system = await api<{ id: string }>(page, 'POST', `/api/universes/${universeId}/systems`, {
      name: 'Runeforging',
      summary: 'How metal is worked.',
    })

    const other = await api<{ id: string }>(page, 'POST', `/api/universes/${universeId}/systems`, {
      name: 'Succession',
      summary: 'Who may hold a seat.',
    })

    for (const owner of [system.id, other.id]) {
      await api(page, 'PUT', `/api/universes/${universeId}/systems/${owner}/rules/${shared.id}`, {})
    }

    await api(
      page,
      'PUT',
      `/api/universes/${universeId}/systems/${system.id}/rules/${wordsOnly.id}`,
      {},
    )

    await page.goto(`/app/universes/${universeId}/world-logic`)
    await page.getByTestId('world-logic-tab-systems').click()

    const systems = page.getByTestId('world-logic-system-row')
    await expect(systems).toHaveCount(2)

    const runeforging = systems.filter({ hasText: 'Runeforging' })
    await expect(runeforging).toContainText('2 rules')
    await expect(runeforging.getByTestId('world-logic-system-scope')).toContainText(
      'Whole universe',
    )

    // Closed until it is opened, then its rules are read.
    await expect(runeforging.getByTestId('world-logic-system-rules')).toBeHidden()
    await runeforging.getByTestId('world-logic-system-toggle').click()
    await expect(runeforging.getByTestId('world-logic-system-rule')).toHaveCount(2)

    // One definition, in two Systems, and not a copy of itself.
    await expect(
      runeforging.getByTestId('world-logic-system-rule').filter({ hasText: 'Shared floor' }),
    ).toContainText('In 2 Systems')

    await expect(
      runeforging.getByTestId('world-logic-system-rule').filter({ hasText: 'Said in words' }),
    ).toContainText('Words only')

    // It closes again. The rules stay in the page, hidden, so opening it a second time reads nothing more.
    await runeforging.getByTestId('world-logic-system-toggle').click()
    await expect(runeforging.getByTestId('world-logic-system-rules')).toBeHidden()
    await expect(runeforging.getByTestId('world-logic-system-toggle')).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  test('the tabs keep their place in the address and work from the keyboard', async ({ page }) => {
    await signUp(page)
    const universeId = await seedUniverse(page)
    const base = `/app/universes/${universeId}/world-logic`

    await page.goto(base)
    await expect(page.getByTestId('world-logic-tab-rules')).toHaveAttribute('aria-selected', 'true')

    // Arrow keys walk the tabs, which is the tab pattern's contract.
    await page.getByTestId('world-logic-tab-rules').focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('world-logic-tab-systems')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page).toHaveURL(`${base}?tab=systems`)

    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('world-logic-tab-integrity')).toHaveAttribute(
      'aria-selected',
      'true',
    )

    // Integrity says no finding is recorded, and says plainly that this is not the same as a clean bill: nothing
    // stores when a check last ran, so an empty list cannot tell the two apart until one is run from here.
    await expect(page.getByTestId('world-logic-integrity-empty')).toContainText(
      'No findings are recorded',
    )

    // A reload lands on the same tab, because the tab is in the address.
    await page.goto(`${base}?tab=integrity`)
    await expect(page.getByTestId('world-logic-tab-integrity')).toHaveAttribute(
      'aria-selected',
      'true',
    )

    // The Canon findings that exist today are one click away.
    await page.getByTestId('world-logic-canon-link').click()
    await page.waitForURL(`/app/universes/${universeId}/canon`)
  })

  test('an empty universe says what a rule and a System are', async ({ page }) => {
    await signUp(page)
    const universeId = await seedUniverse(page)

    await page.goto(`/app/universes/${universeId}/world-logic`)
    await expect(page.getByTestId('world-logic-rules-empty')).toContainText('No world rules yet')

    await page.getByTestId('world-logic-tab-systems').click()
    await expect(page.getByTestId('world-logic-systems-empty')).toContainText('No Systems yet')
  })

  test('each list reaches page 2, keeps its page in the address, and pages on its own', async ({
    page,
  }) => {
    test.slow()
    await signUp(page)
    const universeId = await seedUniverse(page)

    // One more than a page of each kind, so page 2 holds exactly one row.
    const overAPage = WORLD_LOGIC_PAGE_SIZE + 1
    const index = (at: number) => String(at + 1).padStart(3, '0')

    await inBatches(overAPage, 10, (at) =>
      api(page, 'POST', `/api/universes/${universeId}/system-rules`, {
        title: `Rule ${index(at)}`,
        description: 'Seeded for paging.',
      }),
    )
    await inBatches(overAPage, 10, (at) =>
      api(page, 'POST', `/api/universes/${universeId}/systems`, {
        name: `System ${index(at)}`,
        summary: 'Seeded for paging.',
      }),
    )

    const base = `/app/universes/${universeId}/world-logic`
    await page.goto(base)

    // Rules: a pager, a full first page, and a second page holding what the first did not.
    const ruleRows = page.getByTestId('world-logic-rule-row')
    await expect(ruleRows).toHaveCount(WORLD_LOGIC_PAGE_SIZE)
    const rulesPager = page.getByTestId('world-logic-rules-pager')
    await expect(rulesPager).toBeVisible()
    await expect(rulesPager).toContainText('Page 1 of 2')

    const firstRuleTitles = await titlesOf(ruleRows)
    await rulesPager.getByRole('button', { name: 'Next' }).click()
    await expect(page).toHaveURL(`${base}?rulesPage=2`)
    await expect(ruleRows).toHaveCount(1)
    await expect(rulesPager).toContainText('Page 2 of 2')
    const secondRuleTitles = await titlesOf(ruleRows)
    expect(secondRuleTitles.filter((title) => firstRuleTitles.includes(title))).toEqual([])

    // The page is in the address, so a reload lands on it again.
    await page.reload()
    await expect(ruleRows).toHaveCount(1)
    await expect(page.getByTestId('world-logic-rules-pager')).toContainText('Page 2 of 2')
    expect(await titlesOf(ruleRows)).toEqual(secondRuleTitles)

    // Systems page on their own: moving them leaves the rules where the author left them.
    await page.getByTestId('world-logic-tab-systems').click()
    const systemRows = page.getByTestId('world-logic-system-row')
    await expect(systemRows).toHaveCount(WORLD_LOGIC_PAGE_SIZE)
    const systemsPager = page.getByTestId('world-logic-systems-pager')
    await expect(systemsPager).toContainText('Page 1 of 2')
    const firstSystemTitles = await titlesOf(systemRows)

    await systemsPager.getByRole('button', { name: 'Next' }).click()
    await expect(systemRows).toHaveCount(1)
    const secondSystemTitles = await titlesOf(systemRows)
    expect(secondSystemTitles.filter((title) => firstSystemTitles.includes(title))).toEqual([])

    const address = new URL(page.url())
    expect(address.searchParams.get('systemsPage')).toBe('2')
    expect(address.searchParams.get('rulesPage')).toBe('2')

    // And moving the Systems back to page 1 leaves the rules on page 2.
    await systemsPager.getByRole('button', { name: 'Previous' }).click()
    await expect(systemRows).toHaveCount(WORLD_LOGIC_PAGE_SIZE)
    expect(new URL(page.url()).searchParams.get('systemsPage')).toBeNull()
    expect(new URL(page.url()).searchParams.get('rulesPage')).toBe('2')

    await page.getByTestId('world-logic-tab-rules').click()
    await expect(ruleRows).toHaveCount(1)
  })

  test('Integrity lists what the rules found and keeps the three outcomes apart', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page)
    const arlen = await seedEntity(page, universeId, 'Arlen')

    // One of each: a proven contradiction, a rule the stored facts cannot answer, and a broken rule.
    await seedRule(page, universeId, 'Arlen is a dragon', entryIsOfType(arlen, 'Dragon'))
    await seedRule(page, universeId, 'Purity floor', purityAtLeastTwo)
    await seedRule(page, universeId, 'Mismatched', textAtLeastNumber)

    await page.goto(`/app/universes/${universeId}/world-logic?tab=integrity`)

    // Checking is what produces the findings, and it is run from this tab.
    await page.getByTestId('world-logic-integrity-check').click()
    await expect(page.getByTestId('world-logic-integrity-checked')).toBeVisible()

    const rows = page.getByTestId('world-logic-finding-row')
    await expect(rows).toHaveCount(3)

    // All three are here and no outcome is reported as another. One sweep stamps every finding it records with the
    // one instant it ran, so these three are the same age and their order among themselves says nothing: what the
    // list promises is that a later sweep's finding leads, which the API tests cover.
    expect(
      (await rows.evaluateAll((items) => items.map((item) => item.dataset.outcome))).sort(),
    ).toEqual(['error', 'unknown', 'violation'])

    const contradiction = rows.filter({ hasText: 'Arlen is a dragon' })
    await expect(contradiction.getByTestId('world-logic-finding-outcome')).toHaveText(
      'Contradiction',
    )
    await expect(contradiction.getByTestId('world-logic-finding-status')).toHaveText('Open')

    const unanswered = rows.filter({ hasText: 'Purity floor' })
    await expect(unanswered.getByTestId('world-logic-finding-outcome')).toHaveText(
      'Could not be answered',
    )
    await expect(unanswered).toContainText('This is not a pass')

    const broken = rows.filter({ hasText: 'Mismatched' })
    await expect(broken.getByTestId('world-logic-finding-outcome')).toHaveText('The rule is broken')
    await expect(broken.getByTestId('world-logic-finding-code')).toBeVisible()

    // Opened, a finding shows the records its outcome rested on and what has happened to it.
    await expect(contradiction.getByTestId('world-logic-finding-detail')).toBeHidden()
    await contradiction.getByTestId('world-logic-finding-toggle').click()
    await expect(contradiction.getByTestId('world-logic-finding-evidence')).toContainText(arlen)
    await expect(contradiction.getByTestId('world-logic-finding-history')).toContainText('Found')
    await expect(contradiction.getByTestId('world-logic-finding-history')).toContainText(
      'By the check itself',
    )
  })

  test('a finding is dismissed and taken up again, and the state survives a reload', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page)
    const arlen = await seedEntity(page, universeId, 'Arlen')
    await seedRule(page, universeId, 'Arlen is a dragon', entryIsOfType(arlen, 'Dragon'))
    await api(page, 'POST', `/api/universes/${universeId}/world-logic/findings/evaluate`)

    const address = `/app/universes/${universeId}/world-logic?tab=integrity`
    await page.goto(address)

    const row = page.getByTestId('world-logic-finding-row')
    await expect(row).toHaveCount(1)
    await row.getByTestId('world-logic-finding-toggle').click()
    await row.getByTestId('world-logic-finding-dismiss').click()
    await expect(row.getByTestId('world-logic-finding-status')).toHaveText('Dismissed')

    // The dismissal is in the store, not in this page: a reload still finds it dismissed.
    await page.goto(address)
    await expect(row).toHaveAttribute('data-status', 'dismissed')
    await expect(row.getByTestId('world-logic-finding-status')).toHaveText('Dismissed')

    // And the way back is open, which is taking the problem up rather than suppressing it.
    await row.getByTestId('world-logic-finding-toggle').click()
    await row.getByTestId('world-logic-finding-undismiss').click()
    await expect(row.getByTestId('world-logic-finding-status')).toHaveText('Reviewing')

    await page.goto(address)
    await expect(row).toHaveAttribute('data-status', 'reviewing')
  })

  test('an empty Integrity tab says it cannot tell, and a check that finds nothing says so', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page)
    await page.goto(`/app/universes/${universeId}/world-logic?tab=integrity`)

    // Nothing recorded is not a clean bill, and the page does not pretend it knows which it is.
    const nothing = page.getByTestId('world-logic-integrity-empty')
    await expect(nothing).toContainText('No findings are recorded')
    await expect(nothing).toContainText('no check has run yet')

    // A check run from here does know: it found nothing, so every rule it could answer passed.
    await page.getByTestId('world-logic-integrity-check').click()
    const passed = page.getByTestId('world-logic-integrity-passed')
    await expect(passed).toContainText('Every rule that could be answered passed')
    await expect(page.getByTestId('world-logic-integrity-empty')).toBeHidden()
  })

  test('it reads on a phone, and the sections sheet reaches it', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signUp(page)
    const universeId = await seedUniverse(page)

    await api(page, 'POST', `/api/universes/${universeId}/systems`, {
      name: 'Runeforging',
      summary: 'How metal is worked.',
    })

    await page.goto(`/app/universes/${universeId}`)
    await page.getByTestId('workspace-nav-toggle').click()
    await page.getByTestId('workspace-world-logic').click()
    await page.waitForURL(`/app/universes/${universeId}/world-logic`)

    await page.getByTestId('world-logic-tab-systems').click()
    await expect(page.getByTestId('world-logic-system-row')).toHaveCount(1)

    // Nothing of the page overflows the phone's width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
