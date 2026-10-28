// GET /api/config: the public Turnstile site key, set as TURNSTILE_SITE_KEY in the Pages project, so the page itself
// carries no environment-specific value.
export function onRequestGet({ env }) {
  return new Response(JSON.stringify({ turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? null }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}
