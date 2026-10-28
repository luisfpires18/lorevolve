import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { invite, PASSWORD, post, unique } from './support/trash'

/**
 * Issue 15: an entry's Knowledge view, as two people in their own browsers. The API's rules are proved by its own tests;
 * this proves what each person sees: a record written from the entry and anchored to a scene, listed in the story's order
 * under the story, marked while the knower is not in that scene's lore and unmarked once it is; a record known from the
 * start listed first; the subject's page reading it the other way round; a Viewer offered nothing to write.
 */

interface Person {
  context: BrowserContext
  page: Page
  username: string
  email: string
}

async function person(browser: Browser, prefix: string): Promise<Person> {
  const context = await browser.newContext()
  const page = await context.newPage()
  const username = unique(prefix)
  const email = `${username}@example.test`
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return { context, page, username, email }
}

async function world(owner: Page) {
  const universeId = await post(owner, '/api/universes', {
    name: unique('Knowing World '),
    description: null,
    accentColor: null,
  })
  const types = (await (
    await owner.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string }[]
  const character = types.find((type) => type.name === 'Character')!.id
  const entry = (name: string) =>
    post(owner, `/api/universes/${universeId}/entities`, {
      entityTypeId: character,
      name,
      summary: null,
      canonStatus: 2,
      aliases: [],
      tags: [],
      fields: [],
    })
  const miraId = await entry('Mira Vale')
  const heirId = await entry('The Drowned Heir')
  const storyId = await post(owner, `/api/universes/${universeId}/stories`, {
    title: 'The Tide',
    premise: null,
    status: 0,
  })
  const scene = (title: string, chapterId: string | null) =>
    post(owner, `/api/universes/${universeId}/stories/${storyId}/scenes`, {
      title,
      summary: null,
      notes: null,
      povEntityId: null,
      chronology: null,
      entityIds: null,
      chapterId,
    })
  const openingId = await scene('Opening', null)
  const chapterId = await post(owner, `/api/universes/${universeId}/stories/${storyId}/chapters`, {
    title: 'Arrival',
    summary: null,
    notes: null,
  })
  const causewayId = await scene('The Causeway', chapterId)
  return { universeId, miraId, heirId, storyId, openingId, causewayId }
}

const records = (page: Page) => page.getByTestId('knowledge-record')

test.describe('knowledge records', () => {
  test('what an entry knows is written, placed in the story, read without inferring, and read back from the subject', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const owner = await person(browser, 'knowowner')
    const viewer = await person(browser, 'knowviewer')
    const { universeId, miraId, heirId, storyId, causewayId } = await world(owner.page)
    await invite(
      owner.page,
      viewer.page,
      `/api/universes/${universeId}/invitations`,
      viewer.email,
      1,
    )

    // Knowledge lives under the entry's relations, read by every member.
    await owner.page.goto(`/app/universes/${universeId}/lore/${miraId}`)
    await expect(owner.page.getByTestId('entry-name')).toHaveText('Mira Vale')
    await owner.page.getByTestId('entry-view-relations').click()
    await expect(owner.page).toHaveURL(new RegExp(`/lore/${miraId}/relations$`))
    await expect(owner.page.getByTestId('knowledge-view')).toBeVisible()
    await expect(owner.page.getByTestId('knowledge-knows-empty')).toBeVisible()

    // A record anchored to a scene in a chapter, chosen story first and then scene in reading order.
    await owner.page.getByTestId('knowledge-add').click()
    const form = owner.page.getByTestId('knowledge-form')
    await expect(form).toBeVisible()
    await expect(form.getByTestId('knowledge-knower')).toHaveText('Mira Vale')
    await form.getByLabel('About (optional)').fill('Drowned')
    await form.getByRole('option', { name: /The Drowned Heir/ }).click()
    await form.getByTestId('knowledge-statement').fill('The heir survived the causeway.')
    await form.getByTestId('knowledge-story').selectOption({ label: 'The Tide' })
    await expect(form.getByTestId('knowledge-scene')).toBeEnabled()
    await form.getByTestId('knowledge-scene').selectOption({ label: 'The Causeway' })
    await form.getByTestId('knowledge-save').click()
    await expect(form).toHaveCount(0)

    const row = records(owner.page).first()
    await expect(records(owner.page)).toHaveCount(1)
    await expect(row.getByTestId('knowledge-statement-text')).toHaveText(
      'The heir survived the causeway.',
    )
    await expect(row.getByRole('link', { name: 'The Drowned Heir' })).toBeVisible()
    await expect(row.getByTestId('knowledge-scene-link')).toHaveText('The Causeway')
    await expect(row).toContainText('Chapter 1, scene 1 of The Tide')
    // Nothing is inferred: Mira is not in that scene's lore, and the list says so.
    await expect(row.getByTestId('knowledge-issue')).toHaveText('Not in this scene’s Lore')
    await expect(owner.page.getByTestId('knowledge-knows').getByRole('heading')).toHaveText([
      'The Tide',
    ])

    // Known from the start is listed first, under its own heading.
    await owner.page.getByTestId('knowledge-add').click()
    await form.getByTestId('knowledge-statement').fill('Her own name.')
    await form.getByTestId('knowledge-from-start').check()
    await expect(form.getByTestId('knowledge-story')).toHaveCount(0)
    await form.getByTestId('knowledge-save').click()
    await expect(form).toHaveCount(0)
    await expect(records(owner.page)).toHaveCount(2)
    await expect(records(owner.page).first().getByTestId('knowledge-statement-text')).toHaveText(
      'Her own name.',
    )
    await expect(owner.page.getByTestId('knowledge-knows').getByRole('heading')).toHaveText([
      'Known from the start',
      'The Tide',
    ])

    // Linking Mira to the scene takes the mark away: the page reads it again on arrival.
    const scene = (await (
      await owner.page.request.get(
        `/api/universes/${universeId}/stories/${storyId}/scenes/${causewayId}`,
      )
    ).json()) as { version: number }
    const linked = await owner.page.request.put(
      `/api/universes/${universeId}/stories/${storyId}/scenes/${causewayId}`,
      {
        data: {
          title: 'The Causeway',
          summary: null,
          notes: null,
          povEntityId: null,
          chronology: null,
          entityIds: [miraId],
          chapterId: null,
          expectedVersion: scene.version,
        },
      },
    )
    expect(linked.ok(), await linked.text()).toBe(true)
    await owner.page.reload()
    await expect(records(owner.page)).toHaveCount(2)
    await expect(owner.page.getByTestId('knowledge-issue')).toHaveCount(0)

    // From the subject's page, the same record reads the other way round, and nothing is offered twice.
    await owner.page.goto(`/app/universes/${universeId}/lore/${heirId}/relations`)
    await expect(owner.page.getByTestId('knowledge-knows-empty')).toBeVisible()
    const about = owner.page.getByTestId('knowledge-known-about')
    await expect(about.getByTestId('knowledge-record')).toHaveCount(1)
    await expect(about.getByTestId('knowledge-statement-text')).toContainText(
      'Mira Vale knows: The heir survived the causeway.',
    )

    // A Viewer reads every record and is offered nothing to write; the API refuses them too.
    await viewer.page.goto(`/app/universes/${universeId}/lore/${miraId}/relations`)
    await expect(records(viewer.page)).toHaveCount(2)
    await expect(viewer.page.getByTestId('knowledge-add')).toHaveCount(0)
    await expect(viewer.page.getByTestId('knowledge-actions')).toHaveCount(0)
    const refused = await viewer.page.request.post(`/api/universes/${universeId}/knowledge`, {
      data: {
        knowerEntityId: miraId,
        subjectEntityId: null,
        statement: 'Mine.',
        sceneId: null,
        knownFromStart: true,
      },
    })
    expect(refused.status()).toBe(403)

    // Removing asks first, then the row goes.
    await owner.page.goto(`/app/universes/${universeId}/lore/${miraId}/relations`)
    await expect(records(owner.page)).toHaveCount(2)
    await records(owner.page).first().getByTestId('knowledge-actions').click()
    await owner.page.getByTestId('knowledge-delete').click()
    await owner.page.getByRole('button', { name: 'Remove' }).click()
    await expect(records(owner.page)).toHaveCount(1)

    await owner.context.close()
    await viewer.context.close()
  })
})
