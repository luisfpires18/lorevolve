import { expect, test } from '@playwright/test'

test.describe('bootstrap smoke', () => {
  test('frontend loads and renders the app shell', async ({ page }) => {
    await page.goto('/login')

    await expect(page).toHaveTitle('LorEvolve')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('frontend reaches the API through the dev proxy', async ({ page }) => {
    const sessionProbe = page.waitForResponse((response) => response.url().includes('/api/auth/me'))

    await page.goto('/app')

    // The session probe has to reach the API for the route guard to resolve at all.
    expect((await sessionProbe).status()).toBe(401)
    await expect(page).toHaveURL('/login')
  })

  test('api health endpoint answers directly', async ({ request }) => {
    const response = await request.get('/api/health')

    expect(response.ok()).toBeTruthy()
    expect(await response.json()).toMatchObject({ status: 'healthy', service: 'LorEvolve.Api' })
  })
})
