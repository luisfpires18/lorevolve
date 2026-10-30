// POST /api/play { video }: counts one play of a video on this page, stored in D1. Only which video and when: no IP,
// no cookie, nothing about the viewer. The page sends it at most once per video per page load.
// ponytail: no rate limit, so a script could inflate the count; add Turnstile or a per-IP limit if that ever matters.
const VIDEOS = new Set(['walkthrough', 'mcp'])

const reply = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

export async function onRequestPost({ request, env }) {
  if (!env.DB) return reply(503, { error: 'not_configured' })

  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return reply(403, { error: 'origin' })
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return reply(415, { error: 'json_only' })

  const raw = await request.text()
  if (raw.length > 256) return reply(413, { error: 'too_large' })
  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return reply(400, { error: 'invalid', field: 'body' })
  }
  if (!VIDEOS.has(body?.video)) return reply(400, { error: 'invalid', field: 'video' })

  await env.DB.prepare('INSERT INTO video_plays (video, created_at) VALUES (?1, ?2)')
    .bind(body.video, new Date().toISOString())
    .run()

  return reply(200, { ok: true })
}
