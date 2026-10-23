# Lorex.E2E

Playwright end-to-end tests.

`playwright.config.ts` boots the API (`http://localhost:5180`) and the Vite dev server
(`http://localhost:5173`) via `webServer`, reusing anything already running locally.

```
npm install
npx playwright install chromium
npm test
```

## Which database a run writes to

Unset, the API writes to the database `appsettings.Development.json` names - the developer's own
worlds, which a full run then adds hundreds of universes to. `LOREX_E2E_DB` points the API at a
file of its own instead, built from nothing by the startup migration:

```
LOREX_E2E_DB=App_Data/lorex.e2e.db npm test
```

A relative path is resolved against the API's own folder, `src/Lorex.Api`, exactly as the
configured one is; an absolute path is left where it points. Either way `*.db` is gitignored.
Delete the file to start from nothing again.

Use it for anything being measured, and whenever authored work should stay out of the way.
It is also the one setting that has been shown to change how the suite behaves: on a database
the suite made itself, all 155 passed three runs out of three with nothing logged about a locked
database; on a copy of a long-lived development one, two runs out of two lost tests to
`SQLite Error 5: 'database is locked'`, which is contention on the single SQLite writer rather
than anything the specs did.

## How many browsers at once

`LOREX_E2E_WORKERS`, a whole number above zero, decides wherever the suite runs. Without it a
local run gets Playwright's own default - half the logical processors - and CI falls back to one.

```
LOREX_E2E_WORKERS=4 npm test
```

The local default was measured rather than assumed, on 16 logical processors, so eight browsers:

| Database        | Workers | Passed                | Wall clock    | `SQLite Error 5` lines |
| --------------- | ------- | --------------------- | ------------- | ---------------------- |
| fresh           | 8       | 155/155, three runs   | 2m12s - 2m16s | 0, 0, 0                |
| long-lived copy | 8       | 154/155, then 152/155 | 2m25s, 2m25s  | 3, 9                   |
| long-lived copy | 4       | 153/155               | 4m08s         | 3                      |

Halving the workers left the contention exactly where it was and took 1.7x as long, so nothing
below Playwright's default is committed as the default. The database, not the worker count, is
what decides: parallel browsers need one the run built for itself.

### CI: two browsers, one fresh database (Tooling refinement 026)

CI runs the whole suite in one job with **two workers** sharing one API, one Vite server and one
database, which `ci.yml` names explicitly - `LOREX_E2E_DB` under the job's `runner.temp` - rather
than trusting the runner to be fresh. Retries stay at two (`playwright.config.ts`). The one-worker
setting it replaces came with the Playwright scaffold and was never measured for CI; every full
local run since 008 had already been two workers on a fresh database.

Proved before the change, on 349 tests, with the API logging every request's status:

| Run                                  | Workers | Retries | Passed  | Wall clock | Requests | `database is locked` | 5xx |
| ------------------------------------ | ------- | ------- | ------- | ---------- | -------- | -------------------- | --- |
| Write-heavy specs (19 files: Trash, permanent delete, stories, bulk Lore, nested types, restore, publishing, auth) | 2 | 0 | 105/105 | 5m24s | 6,095 | 0 | 0 |
| Full suite                           | 2       | 0       | 348/349 | 15m59s     | 18,379   | 0                    | 0   |

The full run's one loss was `profile.spec.ts`'s photo test meeting a wholly blank `/register`
before any request reached the API - the dev server failing to deliver the page's modules under
load, the same flake recorded in `STATE.md` since 013 - and it was green three times out of three
alone. Nothing in either run was SQLite contention or a server error.

### CI: six shards, two browsers each, a fresh database per shard

At 491 tests the single job took about 22 minutes of Playwright and was the whole critical path
from a merge into `dev` to DEV. Two shards brought that to 10-18 minutes and four to 5.4-9.4 (run 40013082234). Playwright
deals tests out by count, in file order, so the slow specs bunch up; at 533 tests `ci.yml` runs
the `e2e` job as a matrix of six (`--shard=N/6`), each on its own runner. Simulated from that
run's per-test durations, the slowest shard drops from about 11.8 to 8.9 minutes:

- **Coverage.** Playwright partitions the suite itself (`fullyParallel`, so by test, not by
  file); no spec list is kept. Checked with `npx playwright test --list --shard=N/6`:
  89 x 5 + 88 = 533, no test in two shards, none missing.
- **Isolation.** Each shard starts its own API and Vite server and builds its own database,
  `LOREX_E2E_DB=$RUNNER_TEMP/lorex-e2e-shard-N.db`. Nothing is shared between runners, so the
  concurrency against any one SQLite file is unchanged: two workers, as proved above.
- **Failures.** `fail-fast: false`, so one failing shard does not cancel the others and lose their
  evidence. Any failing shard fails the job, and the deployment `needs` it.
- **Reports.** One HTML report per shard, `playwright-report-shard-N-of-6`, kept 7 days. They are
  not merged: that needs the blob reporter and a merge job, more machinery than six links.
- Retries, traces and screenshots are unchanged (`playwright.config.ts`).

The cost is the job's setup six times over (about two minutes each: image pull, .NET, Node, two
`npm ci`, the API build), in parallel, and those minutes billed per shard.

**The job runs in Playwright's image**, `mcr.microsoft.com/playwright:v<version>-noble` at the
version in `package-lock.json`, which already holds Chromium and its system packages. The
`playwright install --with-deps` it replaces took about 20 seconds - and 8-11 minutes whenever the
Ubuntu mirror crawled, which is what the apt half of it was waiting on. Bump the image tag in
`ci.yml` with `@playwright/test`; a mismatch fails at the first launch, and Playwright's message
names the image it wants. The image lacks DejaVu (below), so the job mounts the runner's own
`/usr/share/fonts/truetype/dejavu` read-only and checks `fc-match` before any test runs.

## Laying out a page the way CI does

A layout assertion can pass on Windows or macOS and fail on CI every time, because the fonts differ:
Lorex ships no web font, so a Linux runner draws its interface text in DejaVu, which is wider, and
a label that fits a 390px row here wraps there. A retry never changes that. To see CI's geometry, keep the
servers local and borrow a Linux browser - Playwright's own image at the version in
`package-lock.json`, plus the one font family the runner has and the image does not:

```
docker run -d --name lorex-pw --init --ipc=host -p 3131:3131 mcr.microsoft.com/playwright:v1.63.0-noble /bin/sh -c "cd /tmp && npx -y playwright@1.63.0 run-server --port 3131 --host 0.0.0.0"
docker exec lorex-pw sh -c "apt-get update -qq && apt-get install -y -qq fonts-dejavu-core"
PW_TEST_CONNECT_WS_ENDPOINT=ws://127.0.0.1:3131/ PW_TEST_CONNECT_EXPOSE_NETWORK='<loopback>' CI=1 npm test
```

Without `fonts-dejavu-core` the image draws in Liberation and lands between Windows and CI. With it,
the manuscript's phone layout measured to the pixel what CI reported. A spec that reads a file it
downloaded through `download.path()` fails this way by construction - Playwright gives no local
path for a remote browser's download - so run those without the two variables. Start the container
from PowerShell rather than Git Bash, which rewrites `/bin/sh` into a Windows path. The image is
3.5 GB unpacked; a pull that once ran out of disk left layers that crashed Chromium on launch, and
removing the image and pulling it again is what cured it.
