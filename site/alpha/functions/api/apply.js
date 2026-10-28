// POST /api/apply: one alpha application and its survey answers, stored in D1. Sends nothing anywhere else.
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

  // One row per address: sending again updates the answers and keeps created_at, wave and invited_at.
  await env.DB.prepare(
    `INSERT INTO applications
       (email, name, use_case, consent_at, privacy_version, pay_preference, pay_other,
        price_too_cheap, price_too_expensive, suggestion, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?4, ?4)
     ON CONFLICT (email) DO UPDATE SET
       name = excluded.name,
       use_case = excluded.use_case,
       consent_at = excluded.consent_at,
       privacy_version = excluded.privacy_version,
       pay_preference = excluded.pay_preference,
       pay_other = excluded.pay_other,
       price_too_cheap = excluded.price_too_cheap,
       price_too_expensive = excluded.price_too_expensive,
       suggestion = excluded.suggestion,
       updated_at = excluded.updated_at`,
  )
    .bind(
      row.email,
      row.name,
      row.useCase,
      now,
      PRIVACY_VERSION,
      row.payPreference,
      row.payOther,
      row.priceTooCheap,
      row.priceTooExpensive,
      row.suggestion,
    )
    .run()

  return reply(200, { ok: true })
}
