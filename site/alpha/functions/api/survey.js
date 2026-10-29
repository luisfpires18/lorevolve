// /api/survey: the optional survey answers tied to one application, stored in D1. Sends nothing anywhere else.
// The application's survey token is the only key: /api/apply hands it back once, and the owner puts it in the
// end-of-alpha link (/?survey=<token>). No Turnstile here: the token was issued after one, and is unguessable.
//   GET  ?token=        { name } when the token names an application, so the dialog can greet before asking.
//   POST { token, part, answers }   one row per send, never updated; the latest per application and part counts.
import { readSurvey } from '../../lib/survey.js'

const MAX_BODY = 16 * 1024
const TOKEN = /^[0-9a-f]{32}$/

const reply = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const findApplication = (db, token) =>
  typeof token === 'string' && TOKEN.test(token)
    ? db.prepare('SELECT id, name FROM applications WHERE survey_token = ?1').bind(token).first()
    : null

export async function onRequestGet({ request, env }) {
  if (!env.DB) return reply(503, { error: 'not_configured' })
  const application = await findApplication(env.DB, new URL(request.url).searchParams.get('token'))
  if (!application) return reply(404, { error: 'unknown_token' })
  return reply(200, { name: application.name })
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return reply(503, { error: 'not_configured' })

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

  const application = await findApplication(env.DB, body?.token)
  if (!application) return reply(404, { error: 'unknown_token' })

  const result = readSurvey(body.part, body.answers)
  if (!result.answers) return reply(400, { error: result.error, field: result.field })

  await env.DB.prepare('INSERT INTO surveys (application_id, part, answers, created_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(application.id, body.part, JSON.stringify(result.answers), new Date().toISOString())
    .run()

  return reply(200, { ok: true })
}
