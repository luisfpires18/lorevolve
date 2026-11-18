export function withEra(params: URLSearchParams, eraId: string) {
  const next = new URLSearchParams(params)
  next.set('era', eraId)
  return `?${next.toString()}`
}

export function withoutEra(params: URLSearchParams) {
  const next = new URLSearchParams(params)
  next.delete('era')
  const search = next.toString()
  return search ? `?${search}` : ''
}
