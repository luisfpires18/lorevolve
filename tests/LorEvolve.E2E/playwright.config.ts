import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const webBaseUrl = process.env.LOREVOLVE_WEB_URL ?? 'http://localhost:5173'
const apiBaseUrl = process.env.LOREVOLVE_API_URL ?? 'http://localhost:5180'
const isCi = !!process.env.CI

/**
 * How many browsers run at once.
 *
 * `LOREVOLVE_E2E_WORKERS`, when it is a whole number above zero, decides - locally and in CI alike, so
 * the workflow states its concurrency where it is run (`ci.yml` asks for two). Without it, CI falls
 * back to one, the conservative floor, and a local run gets Playwright's own default: half the
 * logical processors.
 *
 * That local default was measured rather than assumed. Against a database the suite made itself,
 * the full 155 at eight workers came back green three runs out of three with no SQLite contention
 * at all; against a copy of a long-lived development one it lost tests and logged `database is
 * locked` in both runs, and halving the workers changed neither, at 1.7x the wall clock. So a
 * fresh database (`LOREVOLVE_E2E_DB`, below) is the condition parallel browsers depend on, and CI
 * always gives itself one. Two workers sharing one API and one fresh database is how every full
 * run since 008 has been proved locally; the numbers, and why CI stops at two, are in `README.md`.
 */
const workers = (() => {
  const asked = Number(process.env.LOREVOLVE_E2E_WORKERS)
  if (Number.isInteger(asked) && asked > 0) return asked
  return isCi ? 1 : undefined
})()

/**
 * Where the API this run writes to keeps its database.
 *
 * Unset, the API uses whatever `appsettings.Development.json` points at - the developer's own
 * world, which the suite then writes hundreds of universes into. Set to a path of its own, the
 * run starts from an empty file the startup migration builds, which is the only way to compare
 * one run against another and the way to keep authored work out of the way of the tests.
 */
const databaseEnv: Record<string, string> = process.env.LOREVOLVE_E2E_DB
  ? { ConnectionStrings__LorEvolveDb: `Data Source=${process.env.LOREVOLVE_E2E_DB}` }
  : {}

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 2 : 0,
  workers,
  reporter: isCi ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: webBaseUrl,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `dotnet run --project src/LorEvolve.Api --no-launch-profile --urls ${apiBaseUrl}`,
      cwd: repoRoot,
      url: `${apiBaseUrl}/health`,
      env: { ASPNETCORE_ENVIRONMENT: 'Development', ...databaseEnv },
      reuseExistingServer: !isCi,
      timeout: 180_000,
    },
    {
      command: 'npm run dev',
      cwd: `${repoRoot}src/LorEvolve.Web`,
      url: webBaseUrl,
      env: { LOREVOLVE_API_URL: apiBaseUrl },
      reuseExistingServer: !isCi,
      timeout: 120_000,
    },
  ],
})
