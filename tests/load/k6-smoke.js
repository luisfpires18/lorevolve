// Smoke load test (audit 2026-11-07, A18). Run by hand against DEV, never in CI:
//
//   k6 run -e BASE_URL=https://dev-lorevolve.azurewebsites.net tests/load/k6-smoke.js
//
// Optional: -e USERNAME=... -e PASSWORD=... adds a signed-in loop (login once per VU, then "My universes" and one
// universe's lore list). Without them only the anonymous routes run. Twenty virtual users for two minutes is a
// Saturday afternoon of alpha testers, not a stress test; the thresholds are the numbers a B1 instance should hold.
// A 429 on the anonymous loop means the per-address ceiling (RateLimits:PublicPerMinute) is doing its job from one
// machine; raise it for the run or spread the load, do not count it as a failure.
import http from 'k6/http'
import { check, group, sleep } from 'k6'

const base = __ENV.BASE_URL || 'http://localhost:5181'
const username = __ENV.USERNAME
const password = __ENV.PASSWORD

export const options = {
  vus: 20,
  duration: '2m',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
    'http_req_duration{route:explore}': ['p(95)<500'],
  },
}

export function setup() {
  if (!username) return { jar: null }
  const jar = http.cookieJar()
  const login = http.post(
    `${base}/api/auth/login`,
    JSON.stringify({ usernameOrEmail: username, password }),
    { headers: { 'Content-Type': 'application/json' }, jar },
  )
  check(login, { 'login 200': (r) => r.status === 200 })
  const universes = http.get(`${base}/api/universes?pageSize=1`, { jar }).json('items')
  return { cookies: jar.cookiesForURL(base), universeId: universes && universes[0] ? universes[0].id : null }
}

export default function (data) {
  group('anonymous', () => {
    const shell = http.get(`${base}/`, { tags: { route: 'shell' } })
    check(shell, { 'shell 200': (r) => r.status === 200 })
    const explore = http.get(`${base}/api/public/universes?pageSize=24`, { tags: { route: 'explore' } })
    check(explore, { 'explore 200': (r) => r.status === 200 })
    const stats = http.get(`${base}/api/public/stats`, { tags: { route: 'stats' } })
    check(stats, { 'stats 200': (r) => r.status === 200 })
  })

  if (data.cookies && data.universeId) {
    const jar = http.cookieJar()
    for (const name in data.cookies) jar.set(base, name, data.cookies[name][0])
    group('signed-in', () => {
      const mine = http.get(`${base}/api/universes`, { jar, tags: { route: 'my-universes' } })
      check(mine, { 'my universes 200': (r) => r.status === 200 })
      const lore = http.get(`${base}/api/universes/${data.universeId}/entities?pageSize=12`, { jar, tags: { route: 'lore' } })
      check(lore, { 'lore 200': (r) => r.status === 200 })
    })
  }

  sleep(1)
}
