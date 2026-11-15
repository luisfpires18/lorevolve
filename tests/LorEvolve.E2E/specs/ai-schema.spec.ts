import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { makeTestPassword } from './support/account'
import { png } from './support/png'
import { stageAndReview } from './support/mcp-propose'

/**
 * Schema proposals and picture hand-over (issue 59, ADR 0062), staged by an AI app over MCP since M4 (issue #157) retired
 * the web assistant. A lore type with its fields is proposed on its own; approving it puts the type and its fields in Types,
 * and entries of the new type can be made with the ids it got. A picture is asked for rather than sent: the person uploads
 * the file on the review page, sees it there, and approving attaches it to the entry. No model is reached.
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

/**
 * Stages a schema proposal over MCP and opens its review: a new lore type, a short text field for each name but the
 * last, and the last one a link to the universe's first existing type. Schema goes in a proposal of its own
 * (ADR 0062), and an owner's connection may propose it as soon as it may propose at all.
 */
async function proposeType(page: Page, universeId: string, typeName: string, fieldNames: string[]) {
  await stageAndReview(page, universeId, `New type: ${typeName}`, (options) => {
    const linkTo = options.loreTypes[0].id
    return [
      { id: 'type-1', action: 'create', resource: 'lore_type', loreType: { name: typeName } },
      ...fieldNames.map((name, index) => ({
        id: `field-${index + 1}`,
        action: 'create',
        resource: 'lore_field',
        field:
          index === fieldNames.length - 1
            ? { type: { ref: 'type-1' }, name, kind: 'link', linksToType: { id: linkTo } }
            : { type: { ref: 'type-1' }, name, kind: 'short_text', linksToType: null },
      })),
    ]
  })
}

/** Stages a request for a picture of one entry, which the person then uploads on the review page. */
async function proposePicture(page: Page, universeId: string, entryId: string, note: string) {
  await stageAndReview(page, universeId, `A picture of ${note}`, () => [
    {
      id: 'picture-1',
      action: 'create',
      resource: 'image',
      image: { entry: entryId, note },
    },
  ])
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

    await proposeType(page, universe.id, typeName, ['AURA', 'POWER', 'WIELDER'])
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

    await proposePicture(page, universe.id, bilbo.id, name)
    const change = item(page, 'picture-1')
    await expect(change).toContainText(`Add a profile picture to ${name}`)
    await expect(change).toContainText('No picture yet')
    await expect(change.getByTestId('ai-change-select')).toHaveCount(0)
    // Said at the top too, so a long proposal never hides it.
    await expect(page.getByTestId('ai-change-awaiting-pictures')).toContainText('1 picture')

    await change.getByTestId('ai-change-media-file').setInputFiles({
      name: 'bilbo.png',
      mimeType: 'image/png',
      buffer: png(64, 48, () => [120, 160, 90]),
    })
    await expect(change.getByTestId('ai-change-media-preview')).toBeVisible()
    await expect(change).toContainText('64×48')
    // Said beside the picture; the warning at the top goes.
    await expect(change.getByTestId('ai-change-media-uploaded')).toBeVisible()
    await expect(page.getByTestId('ai-change-awaiting-pictures')).toHaveCount(0)

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
