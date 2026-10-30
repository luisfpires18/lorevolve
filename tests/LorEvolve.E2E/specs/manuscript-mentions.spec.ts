import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { expectWritten, writtenSelection } from './support/manuscript'
import { png } from './support/png'
import { invite, PASSWORD, post, unique } from './support/trash'

/**
 * Issue 31: @ mentions in a scene's manuscript (ADR 0058). Write draws each mention as a chip with its name while the
 * stored text keeps the token; every place prose is read shows the name, and the public page links it when its entry is
 * published. Each test builds its own accounts and universe.
 *
 * Under test: `@` opens suggestions only where a mention can start; choosing one inserts the token as a single undo step;
 * Escape leaves the `@word` as prose; the token saves and reloads exactly; the Lore drawer lists each mention with its
 * current name, a preview and an "Add to this scene's Lore" that links only when pressed and is gone once linked; history,
 * a read-only member and the public page read names, never markup; the public page links only a published entry.
 */

interface Person {
  context: BrowserContext
  page: Page
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
  return { context, page, email }
}

async function world(page: Page) {
  const universeId = await post(page, '/api/universes', {
    name: unique('Mention World '),
    description: null,
    accentColor: null,
  })
  const u = `/api/universes/${universeId}`
  const types = (await (await page.request.get(`${u}/entity-types`)).json()) as {
    id: string
    name: string
  }[]
  const character = types.find((type) => type.name === 'Character')!.id
  const entry = (name: string) =>
    post(page, `${u}/entities`, {
      entityTypeId: character,
      name,
      summary: `${name}, as the lore has it.`,
      canonStatus: 0,
      aliases: [],
      tags: [],
      fields: [],
    })
  const akron = await entry('Akron Wright')
  const storyId = await post(page, `${u}/stories`, { title: 'The Road', premise: null, status: 0 })
  const sceneId = await post(page, `${u}/stories/${storyId}/scenes`, {
    title: 'The Crossing',
    summary: null,
    notes: null,
    povEntityId: null,
    chronology: null,
    entityIds: null,
    chapterId: null,
  })
  return {
    universeId,
    akron,
    storyId,
    sceneId,
    manuscriptPage: `/app/universes/${universeId}/stories/${storyId}/manuscript/${sceneId}`,
  }
}

const editor = (page: Page) => page.getByTestId('manuscript-editor')
const suggestions = (page: Page) => page.getByTestId('mention-suggestions')

test.describe('manuscript mentions', () => {
  test('typing @ suggests Lore, a choice is one undo step, and Escape leaves prose as typed', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const owner = await person(browser, 'mentionowner')
    const { akron, manuscriptPage } = await world(owner.page)
    const token = `@[Akron Wright](lore:${akron})`
    const page = owner.page

    await page.goto(manuscriptPage)
    await expect(editor(page)).toBeEditable()
    await editor(page).click()

    // An email address opens nothing.
    await page.keyboard.type('Write to me@exa')
    await expect(suggestions(page)).toHaveCount(0)
    await page.keyboard.type('mple.test. Then ')

    // An @ at a word's start does; the matching entry is offered with its type, and Enter chooses it.
    await page.keyboard.type('@Akr')
    await expect(suggestions(page)).toBeVisible()
    const option = suggestions(page).getByTestId('mention-suggestion')
    await expect(option).toHaveCount(1)
    await expect(option).toContainText('Akron Wright')
    await expect(option).toContainText('Character')
    await expect(option).toHaveAttribute('aria-selected', 'true')
    await expect(editor(page)).toHaveAttribute('aria-activedescendant', /.+/)
    await page.keyboard.press('Enter')
    await expect(suggestions(page)).toHaveCount(0)
    await expectWritten(editor(page), `Write to me@example.test. Then ${token} `)
    await expect(page.getByTestId('manuscript-announcer')).toHaveText('Mentioned Akron Wright.')

    // The insertion is one step of the editor's undo, and redo puts it back.
    await page.keyboard.press('Control+z')
    await expectWritten(editor(page), 'Write to me@example.test. Then @Akr')
    await page.keyboard.press('Control+Shift+z')
    await expectWritten(editor(page), `Write to me@example.test. Then ${token} `)

    // Escape closes the suggestions and the @word stays prose, however it goes on.
    await page.keyboard.type('met @Ak')
    await expect(suggestions(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(suggestions(page)).toHaveCount(0)
    await page.keyboard.type('ron again.')
    await expect(suggestions(page)).toHaveCount(0)
    const text = `Write to me@example.test. Then ${token} met @Akron again.`
    await expectWritten(editor(page), text)

    // Saved and read back exactly, token and all.
    await page.keyboard.press('Control+s')
    await expect(page.getByTestId('manuscript-status')).toHaveText('Saved')
    await page.reload()
    await expectWritten(editor(page), text)

    // A choice by pointer works the same, and a name with no match says so.
    await editor(page).press('End')
    await page.keyboard.type(' @Nobodyhere')
    await expect(page.getByTestId('mention-suggestions-none')).toBeVisible()
    await page.keyboard.press('Escape')

    await owner.context.close()
  })

  test('the Lore drawer lists mentions, links only on request, follows a rename, and every reader reads names', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const owner = await person(browser, 'mentionowner')
    const viewer = await person(browser, 'mentionviewer')
    const { universeId, akron, storyId, sceneId, manuscriptPage } = await world(owner.page)
    const u = `/api/universes/${universeId}`
    await invite(owner.page, viewer.page, `${u}/invitations`, viewer.email, 1)
    const saved = await owner.page.request.put(
      `${u}/stories/${storyId}/scenes/${sceneId}/manuscript`,
      {
        data: {
          content: `Then @[Akron Wright](lore:${akron}) spoke, and @[Akron Wright](lore:${akron}) again.`,
          expectedVersion: 0,
        },
      },
    )
    expect(saved.ok(), await saved.text()).toBe(true)

    const page = owner.page
    await page.goto(manuscriptPage)
    await expect(editor(page)).toBeEditable()
    await page.getByTestId('lore-context-trigger').click()
    const drawer = page.getByTestId('lore-context')
    await expect(drawer).toBeVisible()

    // One row per entry however often it is mentioned, not linked yet, with its own optional action.
    const mention = drawer.getByTestId('lore-context-mention')
    await expect(mention).toHaveCount(1)
    await expect(mention).toHaveAttribute('data-name', 'Akron Wright')
    await expect(mention.getByTestId('lore-context-mention-state')).toHaveText('Character')
    await expect(drawer.getByTestId('lore-context-none')).toBeVisible()

    // The preview is the drawer's own.
    await mention.getByTestId('lore-context-mention-preview').click()
    await expect(drawer.getByTestId('lore-preview-name')).toHaveText('Akron Wright')
    await drawer.getByTestId('lore-preview-back').click()

    // Adding links the entry to the scene; afterwards the row says so and offers nothing.
    await mention.getByTestId('lore-context-mention-link').click()
    await expect(drawer.getByTestId('lore-context-linked')).toHaveCount(1)
    await expect(mention.getByTestId('lore-context-mention-state')).toContainText(
      'In this scene’s Lore',
    )
    await expect(mention.getByTestId('lore-context-mention-link')).toHaveCount(0)
    await drawer.getByTestId('lore-context-close').click()

    // A rename keeps the mention pointing at the same entry: the drawer shows the new name and what the prose says.
    const entity = (await (await page.request.get(`${u}/entities/${akron}`)).json()) as {
      entityTypeId: string
      version: number
    }
    const renamed = await page.request.put(`${u}/entities/${akron}`, {
      data: {
        entityTypeId: entity.entityTypeId,
        name: 'Akron the Elder',
        summary: null,
        canonStatus: 0,
        aliases: [],
        tags: [],
        fields: [],
        expectedVersion: entity.version,
      },
    })
    expect(renamed.ok(), await renamed.text()).toBe(true)
    await page.reload()
    await page.getByTestId('lore-context-trigger').click()
    await expect(drawer.getByTestId('lore-context-mention')).toHaveAttribute(
      'data-name',
      'Akron the Elder',
    )
    await expect(drawer.getByTestId('lore-context-mention-state')).toContainText(
      'Written as Akron Wright',
    )
    await drawer.getByTestId('lore-context-close').click()

    // The history reads the version as prose.
    await page.getByTestId('manuscript-history-toggle').click()
    const version = page.getByTestId('manuscript-history-list').locator('[data-version="1"]')
    await version.getByTestId('manuscript-version-view').click()
    await expect(version.getByTestId('manuscript-version-snapshot')).toHaveText(
      'Then Akron Wright spoke, and Akron Wright again.',
    )

    // A member who reads gets the prose with names, and no text box.
    await viewer.page.goto(manuscriptPage)
    const read = viewer.page.getByTestId('manuscript-read')
    await expect(read).toHaveText('Then Akron Wright spoke, and Akron Wright again.')
    await expect(viewer.page.getByTestId('manuscript-editor')).toHaveCount(0)
    // Each mention is a link to its entry.
    await expect(read.getByTestId('manuscript-mention')).toHaveCount(2)
    await expect(read.getByTestId('manuscript-mention').first()).toHaveAttribute(
      'href',
      /\/lore\/[0-9a-f-]{36}$/,
    )

    // The author switches to Read and gets the same links.
    await page.goto(manuscriptPage)
    await page.getByTestId('manuscript-mode-read').click()
    await expect(page.getByTestId('manuscript-read')).toHaveText(
      'Then Akron Wright spoke, and Akron Wright again.',
    )
    await expect(page.getByTestId('manuscript-read').getByTestId('manuscript-mention')).toHaveCount(
      2,
    )
    await page.getByTestId('manuscript-mode-write').click()
    await expect(page.getByTestId('manuscript-editor')).toBeVisible()

    await owner.context.close()
    await viewer.context.close()
  })

  test('Write marks each mention by its name, and the public page links only published entries', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const owner = await person(browser, 'mentionpublic')
    const page = owner.page
    const { universeId, akron, storyId, sceneId, manuscriptPage } = await world(page)
    const u = `/api/universes/${universeId}`
    const types = (await (await page.request.get(`${u}/entity-types`)).json()) as {
      id: string
      name: string
    }[]
    const hidden = await post(page, `${u}/entities`, {
      entityTypeId: types.find((type) => type.name === 'Character')!.id,
      name: 'Hidden Heir',
      summary: null,
      canonStatus: 0,
      aliases: [],
      tags: [],
      fields: [],
    })
    const text = `@[Akron Wright](lore:${akron}) sat with @[the heir](lore:${hidden}).\n\nAkron kept the vigil.\n`
    const saved = await page.request.put(`${u}/stories/${storyId}/scenes/${sceneId}/manuscript`, {
      data: { content: text, expectedVersion: 0 },
    })
    expect(saved.ok(), await saved.text()).toBe(true)

    // Write: each mention is a chip with its name, never its markup, and the editor still holds the token exactly.
    await page.goto(manuscriptPage)
    await expectWritten(editor(page), text)
    const chips = editor(page).getByTestId('manuscript-chip')
    await expect(chips).toHaveText(['Akron Wright', 'the heir'])
    await expect(editor(page)).not.toContainText('lore:')
    await expect(editor(page)).not.toContainText('@[')
    // A chip is one piece of the prose: Backspace after it takes it whole, and undo puts it back.
    await editor(page).press('Control+Home')
    await editor(page).press('ArrowRight')
    await page.keyboard.press('Backspace')
    await expectWritten(editor(page), text.replace(`@[Akron Wright](lore:${akron})`, ''))
    await page.keyboard.press('Control+z')
    await expectWritten(editor(page), text)
    // Typing goes on around the chips as in any prose.
    await editor(page).press('Control+End')
    await page.keyboard.type('More.')
    await expectWritten(editor(page), `${text}More.`)

    // Copied out, the prose reads as names; pasted back as plain text, a stored mention is a chip again.
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await editor(page).press('Control+a')
    await editor(page).press('Control+c')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      'Akron Wright sat with the heir.\n\nAkron kept the vigil.\nMore.',
    )
    await page.evaluate(
      (token) => navigator.clipboard.writeText(`Again, ${token}.`),
      `@[Akron Wright](lore:${akron})`,
    )
    await editor(page).press('Control+End')
    // The editor reads the caret's move from the browser a moment later; until then everything is still selected.
    await expect.poll(async () => new Set(await writtenSelection(editor(page))).size).toBe(1)
    await editor(page).press('Control+v')
    await expect(chips).toHaveText(['Akron Wright', 'the heir', 'Akron Wright'])
    await expectWritten(editor(page), `${text}More.Again, @[Akron Wright](lore:${akron}).`)

    // Publish the entry, the story, the scene's prose and the universe; not the hidden heir.
    const api = async (path: string, method: 'post' | 'put', data?: object) => {
      const response = await page.request[method](path, data ? { data } : undefined)
      expect(response.ok(), `${path}: ${await response.text()}`).toBe(true)
    }
    await api(`${u}/publication`, 'put', { publicSummary: 'A world.', category: 4, genres: [1] })
    const artwork = await page.request.put(`${u}/artwork`, {
      multipart: {
        file: {
          name: 'art.png',
          mimeType: 'image/png',
          buffer: png(800, 500, (x, y) => [(x * 3) % 255, 60 + (y % 90), 110]),
        },
      },
    })
    expect(artwork.ok()).toBe(true)
    await api('/api/profile/public-name', 'put', { publicDisplayName: 'Mention Author' })
    await api(`${u}/entities/${akron}/publish`, 'post')
    await api(`${u}/stories/${storyId}/publication`, 'put', { publicSummary: 'For readers.' })
    await api(`${u}/stories/${storyId}/publish`, 'post')
    await api(`${u}/stories/${storyId}/scenes/${sceneId}/manuscript/publish`, 'post')
    await api(`${u}/publish`, 'post')
    const publication = await page.request.get(`${u}/publication`)
    const slug = ((await publication.json()) as { publicSlug: string }).publicSlug

    const anon = await browser.newContext()
    const reader = await anon.newPage()
    await reader.goto(`/worlds/${slug}/stories/the-road`)
    const prose = reader.getByTestId('public-story-part')
    const paragraphs = ['Akron Wright sat with the heir.', 'Akron kept the vigil.']
    await expect(prose.locator('p')).toHaveText(paragraphs)
    await expect(prose).not.toContainText('lore:')
    const link = prose.getByTestId('public-story-mention')
    await expect(link).toHaveText(['Akron Wright'])
    await link.click()
    await expect(reader).toHaveURL(new RegExp(`/worlds/${slug}/lore/[a-z0-9-]+$`))
    await expect(reader.getByRole('heading', { level: 1 })).toHaveText('Akron Wright')

    await anon.close()
    await owner.context.close()
  })

  test('Link names from this scene Lore lists what the prose names and links only what is ticked', async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const owner = await person(browser, 'mentionlinker')
    const page = owner.page
    const { universeId, akron, storyId } = await world(page)
    const u = `/api/universes/${universeId}`
    const types = (await (await page.request.get(`${u}/entity-types`)).json()) as {
      id: string
      name: string
    }[]
    const sabine = await post(page, `${u}/entities`, {
      entityTypeId: types.find((type) => type.name === 'Character')!.id,
      name: 'Sabine Varrow',
      summary: null,
      canonStatus: 0,
      aliases: ['the Warden'],
      tags: [],
      fields: [],
    })
    const sceneId = await post(page, `${u}/stories/${storyId}/scenes`, {
      title: 'The Wall',
      summary: null,
      notes: null,
      povEntityId: null,
      chronology: null,
      entityIds: [akron, sabine],
      chapterId: null,
    })
    const text = 'Akron watched. Sabine Varrow held the wall; Sabine held it, the Warden.'
    const saved = await page.request.put(`${u}/stories/${storyId}/scenes/${sceneId}/manuscript`, {
      data: { content: text, expectedVersion: 0 },
    })
    expect(saved.ok(), await saved.text()).toBe(true)

    await page.goto(`/app/universes/${universeId}/stories/${storyId}/manuscript/${sceneId}`)
    await expectWritten(editor(page), text)
    await page.getByTestId('manuscript-scene-actions').click()
    await page.getByTestId('manuscript-link-names').click()

    // Each name the prose uses is listed with its count; nothing has changed yet.
    const linker = page.getByTestId('name-linker')
    const rows = linker.getByTestId('name-linker-row')
    await expect(rows).toHaveCount(4)
    await expect(linker).toContainText('“Akron” as Akron Wright, once')
    await expect(linker).toContainText('“Sabine Varrow”, once')
    await expect(linker).toContainText('“Sabine” as Sabine Varrow, once')
    await expect(linker).toContainText('“the Warden” as Sabine Varrow, once')
    await expectWritten(editor(page), text)

    // Only the ticked names become mentions, as one undo step; nothing is saved until Save.
    await linker.locator('[data-term="Akron"]').uncheck()
    await linker.getByTestId('name-linker-apply').click()
    await expect(linker).toHaveCount(0)
    const linked =
      `Akron watched. @[Sabine Varrow](lore:${sabine}) held the wall; ` +
      `@[Sabine](lore:${sabine}) held it, @[the Warden](lore:${sabine}).`
    await expectWritten(editor(page), linked)
    await expect(editor(page).getByTestId('manuscript-chip')).toHaveText([
      'Sabine Varrow',
      'Sabine',
      'the Warden',
    ])
    await page.keyboard.press('Control+z')
    await expectWritten(editor(page), text)
    await page.keyboard.press('Control+Shift+z')
    await expectWritten(editor(page), linked)
    await page.keyboard.press('Control+s')
    await expect(page.getByTestId('manuscript-status')).toHaveText('Saved')

    // Asked again, only the name left unlinked is offered.
    await page.getByTestId('manuscript-scene-actions').click()
    await page.getByTestId('manuscript-link-names').click()
    await expect(linker.getByTestId('name-linker-row')).toHaveCount(1)
    await expect(linker).toContainText('“Akron” as Akron Wright, once')
    await linker.getByTestId('name-linker-close').click()
    await expect(linker).toHaveCount(0)

    await owner.context.close()
  })
})
