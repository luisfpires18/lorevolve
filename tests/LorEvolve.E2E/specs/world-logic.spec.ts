import { expect, test, type Page } from '@playwright/test'

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

const purityAtLeastTwo = {
  kind: 'compare',
  left: { attribute: 'Purity', of: { subject: 'self' } },
  op: 'gte',
  right: { literal: 2, type: 'number' },
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

    // Integrity says nothing has been checked, which is not the same as nothing being wrong.
    await expect(page.getByTestId('world-logic-integrity-empty')).toContainText(
      'Nothing has been checked yet',
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
