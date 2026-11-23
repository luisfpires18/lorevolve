import { expect, type Page } from '@playwright/test'
import { png } from './png'
import { post, signUp } from './trash'

// Fixtures of the #567 polish specs: an account with a universe, and a Character entry, with a picture if asked.

export async function world(page: Page, name = 'Detail World') {
  await signUp(page)
  const universeId = await post(page, '/api/universes', {
    name,
    description: null,
    accentColor: null,
  })
  const types = (await (
    await page.request.get(`/api/universes/${universeId}/entity-types`)
  ).json()) as Array<{ id: string; name: string }>
  const character = types.find((type) => type.name === 'Character')!.id
  return { universeId, character, u: `/app/universes/${universeId}` }
}

export async function entry(page: Page, universeId: string, character: string, picture = false) {
  const id = await post(page, `/api/universes/${universeId}/entities`, {
    entityTypeId: character,
    name: 'Oressa Venn',
    summary: 'Reads the tide.',
    canonStatus: 2,
    aliases: [],
    tags: [],
    fields: [],
  })
  if (picture) {
    const put = await page.request.put(`/api/universes/${universeId}/entities/${id}/image`, {
      multipart: {
        file: {
          name: 'portrait.png',
          mimeType: 'image/png',
          buffer: png(600, 800, () => [60, 90, 120]),
        },
      },
    })
    expect(put.ok()).toBe(true)
  }
  return id
}
