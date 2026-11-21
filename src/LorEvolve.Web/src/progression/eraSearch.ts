import { changed } from '../lib/queryParams'

export function withEra(params: URLSearchParams, eraId: string) {
  return `?${changed(params, { era: eraId }, { keepPage: true }).toString()}`
}

export function withoutEra(params: URLSearchParams) {
  const search = changed(params, { era: null }, { keepPage: true }).toString()
  return search ? `?${search}` : ''
}
