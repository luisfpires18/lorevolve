import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'
import { png } from './support/png'

/**
 * Schema proposals and picture hand-over (issue 59, ADR 0062), on the local Fake provider. Asked for a "type", the Fake stages
 * a lore type with its fields in a proposal of their own; approving it puts the type and its fields in Types, and entries of
 * the new type can be made with the ids it got. Asked for a "picture", it asks for one for an entry; the person uploads the
 * file on the review page, sees it there, and approving attaches it to the entry. No real model is reached.
 */

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('schema')
  const password = makeTestPassword()
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm password').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
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

/** Asks the Assistant, with Propose changes on, and opens the review of what it staged. */
async function ask(page: Page, universeId: string, question: string) {
  await page.goto(`/app/universes/${universeId}`)
  await page.getByRole('button', { name: 'Assistant' }).click()
  const drawer = page.getByTestId('assistant-drawer')
  await expect(drawer).toBeVisible()
  await drawer.getByLabel('Propose changes').check()
  await drawer.getByLabel('The changes you want').fill(question)
  await drawer.getByTestId('assistant-ask').click()
  const review = drawer.getByTestId('assistant-proposal-review')
  await expect(review).toBeVisible()
  await review.click()
  await expect(page.getByTestId('ai-change')).toBeVisible()
}

function item(page: Page, key: string) {
  return page.locator(`[data-testid="ai-change-item"][data-key="${key}"]`)
}

test.describe('AI schema and pictures', () => {
  test('a new type with its fields is reviewed, approved, and then used by an entry', async ({
    page,
  }) => {
    await signUp(page)
    const universe = await api<{ id: string }>(page.request, 'POST', '/api/universes', {
      name: unique('Arms '),
      description: null,
      accentColor: null,
    })
    const typeName = unique('WEAPON OF ORDER ')

    await ask(
      page,
      universe.id,
      `Create a type "${typeName}" with "AURA" "POWER" and a "WIELDER" link.`,
    )
    await expect(page.getByTestId('ai-change-item')).toHaveCount(4)
    await expect(item(page, 'type-1')).toContainText(`New lore type: ${typeName}`)
    await expect(item(page, 'field-3')).toContainText(`New field on ${typeName} (new): WIELDER`)
    await expect(item(page, 'field-3')).toContainText('Link to an entry')
    await expect(item(page, 'field-3')).toContainText('Needs:')

    // Nothing in the schema until it is approved.
    const before = await api<{ name: string }[]>(
      page.request,
      'GET',
      `/api/universes/${universe.id}/entity-types`,
    )
    expect(before.map((type) => type.name)).not.toContain(typeName)

    await item(page, 'field-3').getByTestId('ai-change-select').check()
    await expect(page.locator('[data-testid="ai-change-select"]:checked')).toHaveCount(2)
    await item(page, 'field-1').getByTestId('ai-change-select').check()
    await item(page, 'field-2').getByTestId('ai-change-select').check()
    await page.getByTestId('ai-change-approve').click()
    await expect(page.getByTestId('ai-change-status')).toHaveText('Approved')

    const types = await api<{ id: string; name: string; fields: { id: string; name: string }[] }[]>(
      page.request,
      'GET',
      `/api/universes/${universe.id}/entity-types`,
    )
    const weapon = types.find((type) => type.name === typeName)!
    expect(weapon.fields.map((field) => field.name)).toEqual(['AURA', 'POWER', 'WIELDER'])

    // The type is a real one: an entry of it, with a value in its new field, by the ids the approval made.
    const aura = weapon.fields.find((field) => field.name === 'AURA')!
    const entry = await api<{ id: string }>(
      page.request,
      'POST',
      `/api/universes/${universe.id}/entities`,
      {
        entityTypeId: weapon.id,
        name: 'Oathkeeper',
        summary: null,
        canonStatus: 1,
        aliases: null,
        tags: null,
        fields: [
          {
            fieldDefinitionId: aura.id,
            text: 'Gold',
            number: null,
            boolean: null,
            date: null,
            optionIds: null,
            referencedEntityId: null,
          },
        ],
      },
    )
    await page.goto(`/app/universes/${universe.id}/lore/${entry.id}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Oathkeeper')
    await expect(page.getByText('Gold')).toBeVisible()
  })

  test('a picture asked for is uploaded on the review page, seen there, and attached by approval', async ({
    page,
  }) => {
    await signUp(page)
    const universe = await api<{ id: string }>(page.request, 'POST', '/api/universes', {
      name: unique('Shire '),
      description: null,
      accentColor: null,
    })
    const types = await api<{ id: string; name: string }[]>(
      page.request,
      'GET',
      `/api/universes/${universe.id}/entity-types`,
    )
    const name = unique('Bilbo ')
    const bilbo = await api<{ id: string }>(
      page.request,
      'POST',
      `/api/universes/${universe.id}/entities`,
      {
        entityTypeId: types.find((type) => type.name === 'Character')!.id,
        name,
        summary: null,
        canonStatus: 1,
        aliases: null,
        tags: null,
        fields: null,
      },
    )

    await ask(page, universe.id, `Find a picture of "${name}".`)
    const change = item(page, 'picture-1')
    await expect(change).toContainText(`Add a profile picture to ${name}`)
    await expect(change).toContainText('No picture yet')
    await expect(change.getByTestId('ai-change-select')).toHaveCount(0)

    await change.getByTestId('ai-change-media-file').setInputFiles({
      name: 'bilbo.png',
      mimeType: 'image/png',
      buffer: png(64, 48, () => [120, 160, 90]),
    })
    await expect(change.getByTestId('ai-change-media-preview')).toBeVisible()
    await expect(change).toContainText('64×48')

    // Not his picture until approved.
    const waiting = await api<{ image: unknown }>(
      page.request,
      'GET',
      `/api/universes/${universe.id}/entities/${bilbo.id}`,
    )
    expect(waiting.image).toBeNull()

    await change.getByTestId('ai-change-select').check()
    await page.getByTestId('ai-change-approve').click()
    await expect(page.getByTestId('ai-change-status')).toHaveText('Approved')
    const attached = await api<{ image: { width: number } | null }>(
      page.request,
      'GET',
      `/api/universes/${universe.id}/entities/${bilbo.id}`,
    )
    expect(attached.image?.width).toBe(64)
  })
})
