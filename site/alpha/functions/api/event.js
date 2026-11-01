// POST /api/event { kind, target, human }: one page view or click, stored in D1 with the day only. No IP, no cookie,
// no user agent kept. human is the page's own guess (real input, no automation flag), overruled to 0 here when the
// user agent names a crawler. Sent with sendBeacon, so the body may arrive as text/plain.
// ponytail: no rate limit; a script can add rows. Add a per-IP limit (not stored) if the counts ever matter.
const BOT_UA = /bot|crawl|spider|slurp|preview|fetch|curl|wget|python|headless|lighthouse|monitor|scan/i
const TARGET = /^[a-z0-9-]{1,64}$/

export async function onRequestPost({ request, env }) {
  if (!env.DB) return new Response(null, { status: 503 })

  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return new Response(null, { status: 403 })

  const raw = await request.text()
  if (raw.length > 256) return new Response(null, { status: 413 })
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return new Response(null, { status: 400 })
  }
  const kind = body?.kind
  if (kind !== 'view' && kind !== 'click') return new Response(null, { status: 400 })
  const target = kind === 'click' && TARGET.test(body.target ?? '') ? body.target : null
  if (kind === 'click' && !target) return new Response(null, { status: 400 })
  const human = body.human === true && !BOT_UA.test(request.headers.get('user-agent') ?? '') ? 1 : 0

  await env.DB.prepare('INSERT INTO page_events (kind, target, human, created_on) VALUES (?1, ?2, ?3, ?4)')
    .bind(kind, target, human, new Date().toISOString().slice(0, 10))
    .run()

  return new Response(null, { status: 204 })
}
