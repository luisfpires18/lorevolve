// POST /api/survey { answers, turnstileToken }: one anonymous survey send, stored in D1. Sends nothing anywhere else.
// Nothing about the sender is stored: no name, no email, no IP, no cookie, and only the day it arrived.
// Bindings (Pages project settings): DB (D1), TURNSTILE_SECRET (secret). Without them it refuses rather than store
// unchecked input.
import { readSurvey } from '../../lib/survey.js'

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

  const result = readSurvey(body.answers)
  if (!result.answers) return reply(400, { error: result.error, field: result.field })

  await env.DB.prepare('INSERT INTO survey_answers (answers, created_on) VALUES (?1, ?2)')
    .bind(JSON.stringify(result.answers), new Date().toISOString().slice(0, 10))
    .run()

  return reply(200, { ok: true })
}
