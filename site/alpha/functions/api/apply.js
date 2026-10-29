// POST /api/apply: one alpha application, stored in D1. Sends nothing anywhere else.
// Bindings (Pages project settings): DB (D1), TURNSTILE_SECRET (secret). Without them it refuses rather than store
// unchecked input.
import { PRIVACY_VERSION, readApplication } from '../../lib/application.js'

const MAX_BODY = 16 * 1024

const reply = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

async function turnstilePassed(token, secret) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret, response: token }),
  })
  if (!response.ok) return false
  const outcome = await response.json()
  return outcome.success === true
}

export async function onRequestPost({ request, env }) {
  if (!env.DB || !env.TURNSTILE_SECRET) return reply(503, { error: 'not_configured' })

  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return reply(403, { error: 'origin' })
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return reply(415, { error: 'json_only' })

  const raw = await request.text()
  if (raw.length > MAX_BODY) return reply(413, { error: 'too_large' })
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return reply(400, { error: 'invalid', field: 'body' })
  }

  if (!(await turnstilePassed(body?.turnstileToken, env.TURNSTILE_SECRET))) return reply(400, { error: 'verification' })

  const result = readApplication(body)
  if (!result.row) return reply(400, { error: result.error, field: result.field })
  const row = result.row
  const now = new Date().toISOString()

  // Insert only, never update: the address is not verified, so a send naming someone else's email must not replace
  // their answers. A second send from the same address is a second row; read the latest per email.
  // The survey token is what /api/survey accepts for this application: handed back once, here, and in the
  // end-of-alpha link the owner sends. 122 random bits, so nobody reaches another person's answers by guessing.
  const surveyToken = crypto.randomUUID().replaceAll('-', '')
  await env.DB.prepare(
    `INSERT INTO applications (email, name, use_case, consent_at, privacy_version, created_at, survey_token)
     VALUES (?1, ?2, ?3, ?4, ?5, ?4, ?6)`,
  )
    .bind(row.email, row.name, row.useCase, now, PRIVACY_VERSION, surveyToken)
    .run()

  return reply(200, { ok: true, surveyToken })
}
