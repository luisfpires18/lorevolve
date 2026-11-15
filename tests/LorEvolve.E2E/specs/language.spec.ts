import { expect, test, type Page } from '@playwright/test'
import { openAccountMenu } from './support/account'

/**
 * ADR 0071: LorEvolve speaks English or European Portuguese. The choice is the reader's, kept in their browser
 * like the theme, and it applies to the portal and the workspace alike. Without a choice, LorEvolve opens in the
 * first language the browser asks for that it has a translation of.
 *
 * Every other spec runs in English, which `playwright.config.ts` pins with `locale: 'en-US'`; this one says so
 * itself wherever it needs another language. What it checks is the switching, not the wording: a translation is
 * read by a person, and a spec that asserted whole sentences would have to be rewritten every time one is reworded.
 */
const PASSWORD = 'Test-password-123!'

function unique(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

async function signUp(page: Page) {
  const username = unique('language')
  await page.goto('/register')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD)
  await page.getByLabel('Confirm password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/app')
  return username
}

test('the portal offers both languages, and the choice holds through a reload', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explore Worlds')

  await page.getByTestId('portal-appearance').click()
  await expect(page.getByTestId('language-en')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('language-pt-PT').click()

  // The page is redrawn where it stands: no reload, no navigation.
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explorar mundos')
  await expect(page.getByTestId('language-pt-PT')).toHaveAttribute('aria-pressed', 'true')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explorar mundos')
  await expect(page).toHaveTitle(/Explorar mundos/)
})

test('the workspace follows the same choice, and English comes back', async ({ page }) => {
  await signUp(page)
  const { id } = await page.request
    .post('/api/universes', { data: { name: unique('Hollowmere ') } })
    .then((response) => response.json() as Promise<{ id: string }>)

  await page.goto(`/app/universes/${id}/lore`)
  await expect(page.getByTestId('workspace-lore')).toHaveText('Lore')
  await expect(page.getByTestId('workspace-trash')).toHaveText('Trash')

  await openAccountMenu(page)
  await page.getByTestId('language-pt-PT').click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT')
  await expect(page.getByTestId('workspace-trash')).toHaveText('Reciclagem')
  await expect(page).toHaveTitle(/^Lore \| /)

  await page.getByTestId('language-en').click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.getByTestId('workspace-trash')).toHaveText('Trash')
})

test.describe('a browser that asks for Portuguese', () => {
  test.use({ locale: 'pt-PT' })

  test('is answered in Portuguese, and its dates are written that way', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT')
    // Explore reads every published world before it draws its heading, and this suite leaves a great many
    // behind, so give the first paint longer than the default here.
    await expect(page).toHaveTitle(/Explorar mundos/, { timeout: 20_000 })
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explorar mundos', {
      timeout: 20_000,
    })

    // Through the API, not the form: this browser is being served the Portuguese form, and the point of
    // the test is the date, not the sign-up labels (the first test covers those).
    const username = unique('language')
    const registered = await page.request.post('/api/auth/register', {
      data: {
        username,
        email: `${username}@example.test`,
        password: PASSWORD,
        confirmPassword: PASSWORD,
      },
    })
    expect(registered.ok(), 'register').toBe(true)
    const { id } = await page.request
      .post('/api/universes', { data: { name: unique('Hollowmere ') } })
      .then((response) => response.json() as Promise<{ id: string }>)

    // A date the app itself wrote, through `formatDate`, not one this spec formatted: the universe's
    // overview says when it was created, and that line is the shortest path to the formatter.
    await page.goto(`/app/universes/${id}`)
    const dates = page.locator('.overview__meta').first()
    const portuguese = (await dates.textContent())?.trim() ?? ''
    expect(portuguese).toMatch(/\d{4}/)
    expect(portuguese).not.toMatch(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/)

    // The same instant in English, so the difference is the formatter following the language and not
    // the clock: the words around it change, and so do the digits.
    await openAccountMenu(page)
    await page.getByTestId('language-en').click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    const english = (await dates.textContent())?.trim() ?? ''
    expect(english).toMatch(/^Created /)
    expect(english).not.toBe(portuguese)

    // And that choice is remembered over what the browser asks for.
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })
})

test.describe('a browser that asks for a language LorEvolve has not learnt', () => {
  test.use({ locale: 'de-DE' })

  test('falls back to English', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explore Worlds')
  })
})
