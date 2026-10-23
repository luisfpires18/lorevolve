import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'
import { acceptConfirm } from './support/confirm'

/**
 * Issue 45 (ADR 0048), on the local Fake provider: the Assistant stages an entry's article, a world rule, a plot arc and beat,
 * and the owner's idea through the same Pending AI Changes; nothing exists before approval; an article reads as prose; a
 * collaborator is never shown a proposal holding the owner's idea; and a relationship or a timeline moment removed by hand
 * waits in the Trash and comes back from it.
 */

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('content')
  const password = makeTestPassword()
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return `${username}@example.test`
}

async function api<T>(
  request: APIRequestContext,
  method: 'GET' | 'POST',
  url: string,
  data?: unknown,
) {
  const response = await request.fetch(url, { method, data })
  expect(response.ok(), `${method} ${url} answered ${response.status()}`).toBe(true)
  return (await response.json()) as T
}

async function seed(page: Page) {
  const universe = await api<{ id: string }>(page.request, 'POST', '/api/universes', {
    name: unique('Forged '),
    description: null,
    accentColor: null,
  })
  await api(page.request, 'POST', `/api/universes/${universe.id}/stories`, {
    title: 'The Forging',
    premise: null,
    status: 0,
  })
  return universe.id
}

async function propose(page: Page, universeId: string, question: string) {
  await page.goto(`/app/universes/${universeId}`)
  await page.getByRole('button', { name: 'Assistant' }).click()
  const drawer = page.getByTestId('assistant-drawer')
  await drawer.getByLabel('Propose changes').check()
  await drawer.getByLabel('The changes you want').fill(question)
  await drawer.getByTestId('assistant-ask').click()
  const review = drawer.getByTestId('assistant-proposal-review')
  await expect(review).toBeVisible()
  const href = await review.getAttribute('href')
  await review.click()
  await expect(page.getByTestId('ai-change')).toBeVisible()
  return href!
}

function item(page: Page, key: string) {
  return page.locator(`[data-testid="ai-change-item"][data-key="${key}"]`)
}

async function newPerson(browser: Browser) {
  const context = await browser.newContext()
  const page = await context.newPage()
  const email = await signUp(page)
  return { page, email }
}

test.describe('AI changes to every authored resource', () => {
  test('an article, a rule, an arc with a beat and an idea wait for review and apply together', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seed(page)
    const name = unique('Smith ')
    await propose(page, universeId, `Create "${name}" with an article, a rule, an arc and an idea.`)

    await expect(page.getByTestId('ai-change-item')).toHaveCount(6)
    await expect(item(page, 'article-1')).toContainText('Prose')
    await expect(item(page, 'article-1')).toContainText(`${name}, as the assistant wrote it.`)
    await expect(item(page, 'rule-1')).toContainText(`New world rule: The rule of ${name}`)
    await expect(item(page, 'beat-1')).toContainText('Needs:')
    await expect(item(page, 'idea-1')).toContainText(`New idea: What if ${name}?`)

    // Nothing exists before approval.
    const rules = await api<{ totalCount: number }>(
      page.request,
      'GET',
      `/api/universes/${universeId}/world-rules`,
    )
    expect(rules.totalCount).toBe(0)

    await page.getByTestId('ai-change-select-all').click()
    await page.getByTestId('ai-change-approve').click()
    await expect(page.getByTestId('ai-change-feedback')).toHaveText('6 changes were applied.')

    await item(page, 'article-1').getByTestId('ai-change-open-item').click()
    await expect(page.getByTestId('article')).toContainText(`${name}, as the assistant wrote it.`)

    await page.goto(`/app/universes/${universeId}/world-rules`)
    await expect(page.getByText(`The rule of ${name}`)).toBeVisible()
    const ideas = await api<{ items: { title: string }[] }>(
      page.request,
      'GET',
      `/api/ideas?universeId=${universeId}`,
    )
    expect(ideas.items.map((idea) => idea.title)).toEqual([`What if ${name}?`])
  })

  test('a collaborator is never shown a proposal holding the owner’s idea', async ({
    page,
    browser,
  }) => {
    await signUp(page)
    const universeId = await seed(page)
    const editor = await newPerson(browser)
    const invitation = await api<{ id: string }>(
      page.request,
      'POST',
      `/api/universes/${universeId}/invitations`,
      {
        email: editor.email,
        role: 3,
      },
    )
    expect((await editor.page.request.post(`/api/invitations/${invitation.id}/accept`)).ok()).toBe(
      true,
    )

    const review = await propose(page, universeId, `Create "${unique('Lia ')}" with an idea.`)
    await expect(page.getByTestId('ai-change-item')).toHaveCount(2)

    await editor.page.goto(review)
    await expect(editor.page.getByTestId('ai-change')).toHaveCount(0)
    const listed = await api<{ items: unknown[] }>(
      editor.page.request,
      'GET',
      `/api/ai-changes?universeId=${universeId}`,
    )
    expect(listed.items).toEqual([])
    await editor.page.context().close()
  })

  test('a relationship and a moment removed by hand wait in the Trash and come back', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seed(page)
    const types = await api<{ id: string; name: string }[]>(
      page.request,
      'GET',
      `/api/universes/${universeId}/entity-types`,
    )
    const character = types.find((type) => type.name === 'Character')!.id
    const make = (name: string) =>
      api<{ id: string }>(page.request, 'POST', `/api/universes/${universeId}/entities`, {
        entityTypeId: character,
        name,
        summary: null,
        canonStatus: 0,
        aliases: null,
        tags: null,
        fields: null,
      })
    const arin = await make('Arin')
    const varn = await make('Varn')
    const kind = await api<{ id: string }>(
      page.request,
      'POST',
      `/api/universes/${universeId}/relationship-types`,
      {
        name: 'rules',
        inverseName: 'ruled by',
        isSymmetric: false,
        description: null,
        displayOrder: null,
      },
    )
    await api(page.request, 'POST', `/api/universes/${universeId}/relationships`, {
      relationshipTypeId: kind.id,
      sourceEntityId: arin.id,
      targetEntityId: varn.id,
      canonStatus: 0,
    })
    await api(page.request, 'POST', `/api/universes/${universeId}/timeline`, {
      title: 'The crowning',
      canonStatus: 0,
      dateKind: 0,
      startYear: 5,
      entityIds: [arin.id],
    })

    await page.goto(`/app/universes/${universeId}/lore/${arin.id}/relations`)
    await page.getByTestId('relationship-actions-Varn').click()
    await page.getByTestId('delete-relationship-Varn').click()
    await acceptConfirm(page)
    await expect(page.getByTestId('relations-empty')).toBeVisible()

    await page.goto(`/app/universes/${universeId}/timeline`)
    await page.getByTestId('moment-actions-The crowning').click()
    await page.getByTestId('delete-moment-The crowning').click()
    await acceptConfirm(page)
    await expect(page.getByText('The crowning')).toHaveCount(0)

    await page.goto(`/app/universes/${universeId}/trash`)
    await expect(page.getByTestId('trash-row-Arin rules Varn')).toContainText('Relationship')
    await expect(page.getByTestId('trash-row-The crowning')).toContainText('Timeline moment')

    await page.getByTestId('restore-Arin rules Varn').click()
    await expect(page.getByTestId('trash-message')).toContainText('back on both of its entries')
    await page.getByTestId('restore-The crowning').click()
    await expect(page.getByTestId('trash-message')).toContainText('back on the timeline')

    await page.goto(`/app/universes/${universeId}/lore/${arin.id}/relations`)
    await expect(page.getByTestId('relationship-list')).toContainText('Varn')
  })
})
