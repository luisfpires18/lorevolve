import { expect, test, type Page } from '@playwright/test'

/**
 * The application shell every screen sits in: the skip link, the universe's section navigation,
 * one heading per screen, and the menu behaviour every `ActionMenu` shares.
 *
 * What a section shows is each section's own spec. This file proves the frame around it - that a
 * keyboard reaches the work in one step, that "where am I" is said to assistive technology as well
 * as drawn, and that the phone's section sheet reads down its columns rather than across them.
 */

const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('shell')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
}

async function newUniverse(page: Page) {
  await page.getByTestId('new-universe').click()
  await page.getByLabel('Name').fill(unique('Saltmarrow '))
  // The starter lore types this spec builds on: a new universe starts empty otherwise.
  await page.getByTestId('universe-starter-types').check()
  await page.getByRole('button', { name: 'Create universe' }).click()
  await page.waitForURL(/\/app\/universes\/[0-9a-f-]+$/)
  return new URL(page.url()).pathname
}

test.describe('the shell', () => {
  test('the first Tab reaches a skip link, and it lands on the screen itself', async ({ page }) => {
    await signUp(page)
    const base = await newUniverse(page)
    await page.goto(`${base}/stories`)
    await expect(page.getByRole('heading', { level: 1, name: 'Stories' })).toBeVisible()

    const skip = page.getByTestId('skip-link')

    // Out of sight until it has the focus.
    const hidden = (await skip.boundingBox())!
    expect(hidden.y + hidden.height).toBeLessThanOrEqual(0)

    await page.keyboard.press('Tab')
    await expect(skip).toBeFocused()
    await expect(skip).toHaveText('Skip to main content')
    const shown = (await skip.boundingBox())!
    expect(shown.y).toBeGreaterThanOrEqual(0)

    // Enter moves the focus to the one main landmark, and leaves the address alone.
    await page.keyboard.press('Enter')
    await expect(page.getByRole('main')).toBeFocused()
    expect(new URL(page.url()).hash).toBe('')

    // The next Tab is the screen's own first control, not the rail or the sidebar.
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('new-story')).toBeFocused()
  })

  test('the sections are a navigation landmark that says where you are', async ({ page }) => {
    await signUp(page)
    const base = await newUniverse(page)

    const sections = page.getByRole('navigation', { name: 'Universe', exact: true })
    // The way up, then thirteen sections (#271): Overview, the seven World Building destinations, then Projects, AI Changes,
    // Publish, Trash and Settings under Management. Creation is hidden while the universe has no project, and no project has a row here.
    await expect(sections.getByRole('link')).toHaveCount(14)
    await expect(sections.getByRole('link').first()).toHaveText('All universes')

    // The sidebar's four parts, in order (#271): Overview, World Building, Management (Creation only appears with a project, #272).
    await expect(sections.getByRole('heading', { level: 2 })).toHaveText([
      'World building',
      'Management',
    ])
    await expect(sections.getByTestId('sidebar-world-building').getByRole('link')).toHaveText([
      'Lore',
      'Types',
      'Family Tree',
      'Maps',
      'Timeline',
      'World Logic',
      'Ideas',
    ])
    await expect(sections.getByTestId('sidebar-creation')).toHaveCount(0)
    // Settings is the owner-kept existing link, last in Management (deferred owner check).
    await expect(sections.getByTestId('sidebar-upkeep').getByRole('link')).toHaveText([
      'Projects',
      'AI Changes',
      'Publish',
      'Trash',
      'Settings',
    ])
    // A project has no row, toggle or New project button here: projects are reached from the Projects page.
    await expect(sections.locator('[data-testid^="project-link-"]')).toHaveCount(0)
    await expect(sections.locator('[data-testid^="project-toggle-"]')).toHaveCount(0)

    // Tab walks the sidebar's links in the order they are drawn.
    await sections.getByRole('link', { name: 'All universes' }).focus()
    for (const name of ['Overview', 'Lore', 'Types']) {
      await page.keyboard.press('Tab')
      await expect(sections.getByRole('link', { name })).toBeFocused()
    }

    // One h1 per screen, and it is the screen's title - the universe name in the sidebar is not it.
    await page.goto(`${base}/timeline`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Timeline')
    await expect(sections.getByRole('link', { name: 'Timeline' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(sections.locator('[aria-current="page"]')).toHaveCount(1)

    // Current is drawn as a place, not as an action: a tinted background, never the ink fill.
    const tint = await sections
      .getByRole('link', { name: 'Timeline' })
      .evaluate((element) => getComputedStyle(element).backgroundColor)
    const rest = await sections
      .getByRole('link', { name: 'Lore' })
      .evaluate((element) => getComputedStyle(element).backgroundColor)
    expect(tint).not.toBe(rest)

    // A page inside a section keeps that section current.
    await sections.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(`${base}/settings`)
    await expect(sections.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings')

    // The front page is the universe's contents, and each doorway goes where the sidebar goes.
    await sections.getByRole('link', { name: 'Overview' }).click()
    await page.getByTestId('overview-world-logic').click()
    await expect(page).toHaveURL(`${base}/world-logic`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('World Logic')
  })

  test('a menu is worked from the keyboard: arrows, Home, End, Escape, and Tab out', async ({
    page,
  }) => {
    await signUp(page)
    // The workspace bar is drawn before the screen beneath it; Tab out of the menu needs that screen to land on.
    await expect(page.getByRole('heading', { level: 1, name: 'Universes' })).toBeVisible()

    const trigger = page.getByTestId('account-menu-trigger')
    const panel = page.getByTestId('account-menu-panel')
    const workspace = page.getByTestId('account-menu-workspace')
    const profile = page.getByTestId('account-menu-profile')
    const signOut = page.getByRole('button', { name: 'Sign out' })

    await trigger.focus()
    await page.keyboard.press('Enter')
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(workspace).toBeFocused()

    // Go to's two places, then the profile; the theme's two buttons and the language's two sit between it
    // and the way out (013, ADR 0071). Both switches are segmented controls, and their buttons take their
    // turn in the walk like every other item in the menu.
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('account-menu-explore')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(profile).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('theme-light')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('theme-dark')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('language-en')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('language-pt-PT')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(signOut).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(workspace).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(signOut).toBeFocused()
    await page.keyboard.press('Home')
    await expect(workspace).toBeFocused()
    await page.keyboard.press('End')
    await expect(signOut).toBeFocused()

    // Escape closes and gives the focus back.
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')

    // Tab past the last item leaves the menu, and the menu closes behind it.
    await page.keyboard.press('Enter')
    await expect(workspace).toBeFocused()
    // My workspace, Explore, Profile, Light, Dark, English, Português, Sign out - and the next Tab is out.
    for (let press = 0; press < 8; press++) await page.keyboard.press('Tab')
    await expect(panel).toHaveCount(0)

    // Choosing an item does what it says.
    await trigger.click()
    await profile.click()
    await expect(page).toHaveURL('/app/profile')
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

    test('the section drawer keeps each group whole, in order, and closes on arrival', async ({
      page,
    }) => {
      await signUp(page)
      const base = await newUniverse(page)

      const toggle = page.getByTestId('workspace-nav-toggle')
      await toggle.tap()
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')

      const at = async (testId: string) => (await page.getByTestId(testId).boundingBox())!

      // Since #274 the sections are one drawer, one column: world building reads top to bottom.
      const lore = await at('workspace-lore')
      const maps = await at('workspace-maps')
      const ideas = await at('workspace-ideas')
      expect(maps.y).toBeGreaterThan(lore.y)
      expect(ideas.y).toBeGreaterThan(maps.y)
      // Management - Projects, AI Changes, Publish, Trash, Settings - fills a three-across foot grid, under
      // everything else (#191, #271).
      const projects = await at('workspace-projects')
      const aiChanges = await at('workspace-ai-changes')
      const publish = await at('workspace-publish')
      const trash = await at('workspace-trash')
      const settings = await at('workspace-settings')
      expect(Math.abs(aiChanges.y - projects.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(publish.y - projects.y)).toBeLessThanOrEqual(1)
      expect(projects.x).toBeLessThan(aiChanges.x)
      expect(aiChanges.x).toBeLessThan(publish.x)
      expect(trash.y).toBeGreaterThan(projects.y)
      expect(settings.x).toBeGreaterThan(trash.x)
      expect(projects.y).toBeGreaterThan(ideas.y)
      // The same labels as the wide sidebar.
      await expect(page.locator('.sidebar').getByRole('heading', { level: 2 })).toHaveText([
        'World building',
        'Management',
      ])

      // Every row is a target a thumb can hit.
      for (const id of ['workspace-overview', 'workspace-trash', 'workspace-settings']) {
        expect((await at(id)).height, id).toBeGreaterThanOrEqual(44)
      }

      await page.getByTestId('workspace-ideas').tap()
      await expect(page).toHaveURL(`${base}/ideas`)
      await expect(page.locator('.sidebar')).toBeHidden()
      await expect(page.getByTestId('workspace-where')).toContainText('Ideas')

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(1)
    })
  })
})
