import { expect, test, type Page } from '@playwright/test'
import { post, signUp, unique, world } from './support/trash'

/**
 * The author's orders (Product request 2026-11-11): a universe's stories read in the order the author sets from each row's
 * ⋯ menu, not by title, and a scene's lore reads in the order it was picked, not by name. Each test registers its own
 * account and builds its own universe through the API.
 */

async function entity(page: Page, universeId: string, name: string) {
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as { id: string; name: string }[]
  return post(page, `/api/universes/${universeId}/entities`, {
    entityTypeId: types.find((type) => type.name === 'Character')!.id,
    name,
    summary: null,
    canonStatus: 2,
    aliases: [],
    tags: [],
    fields: [],
  })
}

function titles(page: Page) {
  return page
    .getByTestId('story-row')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-title')))
}

test.describe('author order', () => {
  test('stories are moved up and down from their menu, and the order is kept', async ({ page }) => {
    await signUp(page)
    const universeId = await world(page)
    for (const title of ['The Endless War', 'The Great Forging', 'The Legacy']) {
      await post(page, `/api/universes/${universeId}/stories`, { title, premise: null, status: 1 })
    }

    await page.goto(`/app/universes/${universeId}/stories`)
    await expect
      .poll(() => titles(page))
      .toEqual(['The Endless War', 'The Great Forging', 'The Legacy'])

    // The first offers no Move up and the last no Move down.
    const first = page.locator('[data-testid="story-row"][data-title="The Endless War"]')
    await first.getByTestId('story-actions').click()
    await expect(first.getByTestId('story-move-up')).toHaveCount(0)
    await first.getByTestId('story-move-down').click()
    await expect
      .poll(() => titles(page))
      .toEqual(['The Great Forging', 'The Endless War', 'The Legacy'])
    await expect(page.getByTestId('stories-announcement')).toHaveText(
      '“The Endless War” is now story 2 of 3.',
    )
    // The focus stays with the story that moved.
    await expect(first.getByTestId('story-actions')).toBeFocused()

    const last = page.locator('[data-testid="story-row"][data-title="The Legacy"]')
    await last.getByTestId('story-actions').click()
    await expect(last.getByTestId('story-move-down')).toHaveCount(0)
    await last.getByTestId('story-move-up').click()
    await expect
      .poll(() => titles(page))
      .toEqual(['The Great Forging', 'The Legacy', 'The Endless War'])

    await page.reload()
    await expect
      .poll(() => titles(page))
      .toEqual(['The Great Forging', 'The Legacy', 'The Endless War'])

    // A new story goes last.
    await post(page, `/api/universes/${universeId}/stories`, {
      title: 'A late one',
      premise: null,
      status: 1,
    })
    await page.reload()
    await expect
      .poll(() => titles(page))
      .toEqual(['The Great Forging', 'The Legacy', 'The Endless War', 'A late one'])
  })

  test("a scene's lore reads in the order it was picked, on its card and in its drawer", async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await world(page)
    const marcus = await entity(page, universeId, 'Marcus Coyote')
    const ruth = await entity(page, universeId, 'Ruth Lestasc')
    const theo = await entity(page, universeId, 'Theo Blake')
    const fortis = await entity(page, universeId, 'Fortis')
    const storyId = await post(page, `/api/universes/${universeId}/stories`, {
      title: unique('Forging '),
      premise: null,
      status: 1,
    })
    const sceneId = await post(page, `/api/universes/${universeId}/stories/${storyId}/scenes`, {
      title: "King's Orders",
      summary: null,
      notes: null,
      povEntityId: null,
      chronology: null,
      entityIds: [marcus, ruth, theo, fortis],
      chapterId: null,
    })

    await page.goto(`/app/universes/${universeId}/stories/${storyId}`)
    const card = page.locator(`#scene-${sceneId}`)
    await expect(card.getByTestId('scene-lore').getByRole('listitem')).toHaveText([
      'Marcus Coyote',
      'Ruth Lestasc',
      'Theo Blake',
      'Fortis',
    ])

    // Taken out and picked again, an entry goes last; saved, the card reads that way.
    await card.getByTestId('scene-edit').click()
    const form = page.getByTestId('scene-form')
    await form.getByRole('button', { name: 'Remove Marcus Coyote' }).click()
    await expect(page.getByTestId('save-scene')).toBeEnabled()
    const search = form.getByRole('combobox', { name: 'Linked lore' })
    await search.fill('Marcus')
    await page.getByRole('option', { name: /Marcus Coyote/ }).click()
    await page.getByTestId('save-scene').click()
    await expect(form).toHaveCount(0)
    await expect(card.getByTestId('scene-lore').getByRole('listitem')).toHaveText([
      'Ruth Lestasc',
      'Theo Blake',
      'Fortis',
      'Marcus Coyote',
    ])

    await page.reload()
    await expect(card.getByTestId('scene-lore').getByRole('listitem')).toHaveText([
      'Ruth Lestasc',
      'Theo Blake',
      'Fortis',
      'Marcus Coyote',
    ])
  })
})
