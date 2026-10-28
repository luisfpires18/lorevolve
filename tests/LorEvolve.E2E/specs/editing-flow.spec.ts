import { expect, test, type Locator, type Page, type Route } from '@playwright/test'

/**
 * The workspace's editing flow (Product refinement 017): a new idea is created and handed back to its list; an existing
 * document's one save button carries its own state - quiet when there is nothing to save, the verb when there is,
 * "Saving…", "✓ Saved" for a moment, then quiet again - with one hidden status saying the same; and Chronology sits
 * after Timeline. Each test registers its own account.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('editor')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function api<T>(page: Page, method: string, url: string, data?: unknown): Promise<T> {
  const response = await page.request.fetch(url, { method, data })
  expect(response.ok(), `${method} ${url}`).toBe(true)
  return (await response.json()) as T
}

async function seedUniverse(page: Page, name = unique('Editing ')) {
  return (
    await api<{ id: string }>(page, 'POST', '/api/universes', {
      name,
      description: null,
      accentColor: null,
    })
  ).id
}

async function seedIdea(page: Page, title: string, universeId: string | null = null) {
  return (
    await api<{ id: string }>(page, 'POST', '/api/ideas', {
      title,
      body: 'Grey ships in the west.',
      universeId,
      references: [],
      expectedUpdatedAt: null,
    })
  ).id
}

async function seedRule(page: Page, universeId: string, title: string) {
  return (
    await api<{ id: string }>(page, 'POST', `/api/universes/${universeId}/world-rules`, {
      title,
      description: 'Rings bind.',
      expectedUpdatedAt: null,
    })
  ).id
}

async function seedScene(page: Page, universeId: string) {
  const story = await api<{ id: string }>(page, 'POST', `/api/universes/${universeId}/stories`, {
    title: 'The Fellowship',
    premise: null,
    status: 1,
  })
  const scene = await api<{ id: string }>(
    page,
    'POST',
    `/api/universes/${universeId}/stories/${story.id}/scenes`,
    {
      title: 'Bag End',
      summary: null,
      notes: null,
      povEntityId: null,
      chronology: null,
      entityIds: [],
      chapterId: null,
    },
  )
  await api(
    page,
    'PUT',
    `/api/universes/${universeId}/stories/${story.id}/scenes/${scene.id}/manuscript`,
    { content: 'A long-expected party.', expectedVersion: 0 },
  )
  return `/app/universes/${universeId}/stories/${story.id}/manuscript/${scene.id}`
}

async function seedEra(page: Page, universeId: string) {
  await api(page, 'PUT', `/api/universes/${universeId}/chronology`, {
    eras: [{ id: null, name: 'Third Age', abbreviation: 'TA', direction: 0, labelPosition: 1 }],
  })
}

/** Holds the next matching request until released, so the state it is in flight can be seen. */
async function holdNext(page: Page, pattern: RegExp, method: string) {
  let release: () => void = () => undefined
  const released = new Promise<void>((resolve) => (release = resolve))
  let held = false
  await page.route(pattern, async (route: Route) => {
    if (held || route.request().method() !== method) return route.fallback()
    held = true
    await released
    await route.fallback()
  })
  return release
}

/**
 * One document's save, all the way round: quiet and unavailable, the verb once something changes, "Saving…" while it goes,
 * "✓ Saved" after, then quiet again - with the hidden status saying the same, and never "Saved" beside a button.
 */
async function walkSave(
  page: Page,
  options: {
    button: Locator
    status: Locator
    label: string
    edit: () => Promise<void>
    request: RegExp
    method: string
  },
) {
  const { button, status, label, edit, request, method } = options
  await expect(button).toHaveText(label)
  await expect(button).toBeDisabled()
  await expect(button).toHaveAttribute('aria-disabled', 'true')
  await expect(status).toHaveText('Saved')
  // Said to assistive technology, never drawn beside the button.
  await expect(status).toHaveClass(/visually-hidden/)

  await edit()
  await expect(button).toBeEnabled()
  await expect(button).toHaveText(label)
  await expect(status).toHaveText('Unsaved changes')

  const release = await holdNext(page, request, method)
  await button.click()
  await expect(button).toHaveText('Saving…')
  await expect(button).toBeDisabled()
  await expect(status).toHaveText('Saving…')
  // The button keeps the focus while it works: nothing jumps.
  await expect(button).toBeFocused()
  release()

  await expect(button).toHaveText('Saved')
  await expect(button).toHaveAttribute('data-state', 'saved')
  await expect(status).toHaveText('Saved')
  await expect(button).toBeFocused()

  // Then quiet again, still focused, with no second word left beside it.
  await expect(button).toHaveText(label, { timeout: 6000 })
  await expect(button).toBeDisabled()
  await expect(button).toBeFocused()
  await expect(button.locator('xpath=..')).not.toContainText('Unsaved changes')
}

function scrollsSideways(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
}

test.describe('creating an idea returns to its list', () => {
  test('a new idea goes back to all ideas, Back does not reopen the finished form, and an existing idea stays put', async ({
    page,
  }) => {
    await signUp(page)
    await page.goto('/app/ideas')
    await page.getByTestId('new-idea').click()
    await page.waitForURL('/app/ideas/new')

    // A create that fails stays, with everything written still there.
    await page.getByTestId('idea-title').fill('The Grey Havens')
    await page.getByTestId('idea-body').fill('Where the ships leave from.')
    await page.route('**/api/ideas', (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 500, body: '' })
        : route.fallback(),
    )
    await expect(page.getByTestId('idea-save')).toHaveText('Create idea')
    await page.getByTestId('idea-save').click()
    await expect(page.getByTestId('idea-error')).toContainText('could not be saved')
    await expect(page).toHaveURL('/app/ideas/new')
    await expect(page.getByTestId('idea-title')).toHaveValue('The Grey Havens')
    await expect(page.getByTestId('idea-body')).toHaveValue('Where the ships leave from.')
    await expect(page.getByTestId('idea-save')).toBeEnabled()
    await page.unrouteAll()

    // Then it is created, and the author is back among all ideas - not on the idea.
    await page.getByTestId('idea-save').click()
    await page.waitForURL('/app/ideas')
    await expect(page.getByTestId('ideas-created-notice')).toHaveText('Created “The Grey Havens”.')
    const row = page.locator('[data-testid="idea-row"][data-title="The Grey Havens"]')
    await expect(row).toBeVisible()
    await expect(page.getByTestId('idea-editor')).toHaveCount(0)

    // Back leaves the list for where it was before New idea, never the finished form.
    await page.goBack()
    await expect(page).toHaveURL('/app/ideas')
    await expect(page.getByTestId('idea-editor')).toHaveCount(0)

    // An existing idea saves where it is, by button and by keyboard.
    await row.getByTestId('idea-open').click()
    await page.waitForURL(/\/app\/ideas\/[0-9a-f-]+$/)
    const url = page.url()
    await page.getByTestId('idea-body').fill('Where the ships leave from, into the West.')
    await page.getByTestId('idea-save').click()
    await expect(page.getByTestId('idea-status')).toHaveText('Saved')
    expect(page.url()).toBe(url)
    await page.getByTestId('idea-body').fill('Into the West.')
    await expect(page.getByTestId('idea-save')).toBeEnabled()
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.getByTestId('idea-status')).toHaveText('Saved')
    await expect(page.getByTestId('idea-save')).toBeDisabled({ timeout: 6000 })
    expect(page.url()).toBe(url)
  })
})

test.describe('explicit save states', () => {
  test('an idea: quiet, the verb, Saving…, Saved, quiet - and new writing is never hidden by Saved', async ({
    page,
  }) => {
    await signUp(page)
    const id = await seedIdea(page, 'Mithril')
    await page.goto(`/app/ideas/${id}`)

    const button = page.getByTestId('idea-save')
    const status = page.getByTestId('idea-status')
    const body = page.getByTestId('idea-body')
    await walkSave(page, {
      button,
      status,
      label: 'Save changes',
      edit: () => body.fill('Light as a feather.'),
      request: /\/api\/ideas\/[0-9a-f-]+$/,
      method: 'PUT',
    })

    // A second edit straight after a save is unsaved at once, whatever "Saved" was saying.
    await body.fill('Light as a feather, hard as dragon scales.')
    await button.click()
    await expect(status).toHaveText('Saved')
    await body.press('End')
    await body.pressSequentially('!')
    await expect(status).toHaveText('Unsaved changes')
    await expect(button).toHaveText('Save changes')
    await expect(button).toBeEnabled()
  })

  test('a world rule: the same save, and a new rule is still created', async ({ page }) => {
    await signUp(page)
    const universeId = await seedUniverse(page)
    const base = `/app/universes/${universeId}`

    await page.goto(`${base}/world-rules/new`)
    await expect(page.getByTestId('world-rule-save')).toHaveText('Create rule')
    await expect(page.getByTestId('world-rule-save')).toBeDisabled()

    const id = await seedRule(page, universeId, 'The One Ring')
    await page.goto(`${base}/world-rules/${id}`)
    await walkSave(page, {
      button: page.getByTestId('world-rule-save'),
      status: page.getByTestId('world-rule-status'),
      label: 'Save changes',
      edit: () =>
        page.getByTestId('world-rule-description').fill('Rings bind, and one rules them.'),
      request: /\/world-rules\/[0-9a-f-]+$/,
      method: 'PUT',
    })
  })

  test('a manuscript: the same save beside its publication, which still fits on a phone', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page)
    const url = await seedScene(page, universeId)
    await page.goto(url)

    const bar = page.locator('.manuscript__bar')
    await expect(bar.locator('.manuscript__publication')).toBeVisible()
    await walkSave(page, {
      button: page.getByTestId('manuscript-save'),
      status: page.getByTestId('manuscript-status'),
      label: 'Save changes',
      edit: () => page.getByTestId('manuscript-editor').fill('A long-expected party, at last.'),
      request: /\/manuscript$/,
      method: 'PUT',
    })

    await page.setViewportSize({ width: 360, height: 780 })
    await page.getByTestId('manuscript-editor').fill('Eleventy-one years.')
    await expectApart(bar.locator('.manuscript__publication'), page.getByTestId('manuscript-save'))
    expect(await scrollsSideways(page)).toBe(false)
  })

  test('chronology: dirty enables its save, success is brief, and no saved message sits beside it', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page)
    await seedEra(page, universeId)
    await page.goto(`/app/universes/${universeId}/chronology`)

    await walkSave(page, {
      button: page.getByTestId('save-chronology'),
      status: page.getByTestId('chronology-status'),
      label: 'Save chronology',
      edit: () => page.getByTestId('era-name').first().fill('Fourth Age'),
      request: /\/chronology$/,
      method: 'PUT',
    })
    await expect(page.getByText('Chronology saved.')).toHaveCount(0)
  })
})

/** Two boxes that do not overlap. */
async function expectApart(first: Locator, second: Locator) {
  const [a, b] = [(await first.boundingBox())!, (await second.boundingBox())!]
  const overlaps =
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  expect(overlaps, 'the two controls overlap').toBe(false)
}

test.describe('workspace navigation', () => {
  test('Timeline sits between Stories and Ideas in the sidebar, the phone sheet and the Overview', async ({
    page,
  }) => {
    await signUp(page)
    const universeId = await seedUniverse(page)
    await page.goto(`/app/universes/${universeId}`)

    // The world, its rules, then the writing - Stories, the Timeline it is told against, Ideas (Issue #48).
    const world = ['Lore', 'Types', 'Family Tree', 'Maps', 'World Rules', 'Canon', 'Chronology']
    const writing = ['Stories', 'Timeline', 'Ideas']
    const sections = page.getByRole('navigation', { name: 'Universe', exact: true })
    await expect(sections.getByRole('link')).toContainText([
      'All universes',
      'Overview',
      ...world,
      ...writing,
    ])
    await expect(page.locator('[data-testid="overview-lore"]')).toBeVisible()
    // Canon carries a WIP badge after its name.
    const links = (await sections.getByRole('link').allTextContents()).map((text) =>
      text.replace(/WIP$/, '').trim(),
    )
    expect(links.slice(2, 2 + world.length + writing.length)).toEqual([...world, ...writing])

    const doorways = [
      'lore',
      'types',
      'family-tree',
      'maps',
      'world-rules',
      'chronology',
      'stories',
      'timeline',
      'ideas',
    ]
    const overview = await page
      .locator('[data-testid^="overview-"]')
      .evaluateAll((all) => all.map((one) => one.getAttribute('data-testid')))
    expect(overview.filter((id) => doorways.includes(id!.replace('overview-', '')))).toEqual(
      doorways.map((segment) => `overview-${segment}`),
    )

    // The Timeline is still where it was, and its link is the current page there.
    await sections.getByRole('link', { name: 'Timeline' }).click()
    await page.waitForURL(`/app/universes/${universeId}/timeline`)
    await expect(sections.getByRole('link', { name: 'Timeline' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/app/universes/${universeId}`)
    await page.getByTestId('workspace-nav-toggle').click()
    await expect(page.getByTestId('workspace-timeline')).toBeVisible()
    const sheet = (
      await page
        .getByRole('navigation', { name: 'Universe', exact: true })
        .getByRole('link')
        .allTextContents()
    ).map((text) => text.trim())
    expect(
      sheet.slice(sheet.indexOf('Lore'), sheet.indexOf('Lore') + world.length + writing.length),
    ).toEqual([...world, ...writing])
    await page.getByTestId('workspace-timeline').click()
    await page.waitForURL(`/app/universes/${universeId}/timeline`)
  })
})

test.describe('save controls fit', () => {
  test('every width, both themes and 200%: the save buttons sit clear and nothing scrolls sideways', async ({
    page,
  }) => {
    // Six sizes by four pages is twenty-four full loads: past the default 30 s on a slow runner.
    test.setTimeout(120_000)
    await signUp(page)
    const universeId = await seedUniverse(page)
    const idea = await seedIdea(page, 'Lembas', universeId)
    const rule = await seedRule(page, universeId, 'No fire in the Shire')
    const manuscript = await seedScene(page, universeId)
    await seedEra(page, universeId)
    const base = `/app/universes/${universeId}`

    const pages: [string, string][] = [
      [`/app/ideas/${idea}`, 'idea-save'],
      [`${base}/world-rules/${rule}`, 'world-rule-save'],
      [manuscript, 'manuscript-save'],
      [`${base}/chronology`, 'save-chronology'],
    ]

    // 640 × 450 is a 1280 × 900 window at 200%.
    for (const [width, height, colorScheme] of [
      [1440, 900, 'light'],
      [1024, 768, 'dark'],
      [820, 1000, 'light'],
      [390, 844, 'dark'],
      [360, 780, 'light'],
      [640, 450, 'dark'],
    ] as const) {
      await page.emulateMedia({ colorScheme })
      await page.setViewportSize({ width, height })
      for (const [path, testId] of pages) {
        await page.goto(path)
        const button = page.getByTestId(testId)
        await button.scrollIntoViewIfNeeded()
        await expect(button, `${path} at ${width}`).toBeVisible()
        expect(await scrollsSideways(page), `${path} at ${width}px ${colorScheme}`).toBe(false)
        if (testId === 'manuscript-save') {
          await expectApart(page.locator('.manuscript__publication'), button)
        }
      }
    }
  })
})
