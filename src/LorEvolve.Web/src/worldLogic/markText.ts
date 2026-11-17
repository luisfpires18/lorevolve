import { t } from '../i18n'
import type { GuardMarkKind } from './machine'

/** One transition's mark for a tried entry, as `guardMark` gives it. */
export interface GuardMarkValue {
  kind: GuardMarkKind
  code: string | null
}

/**
 * A mark's words: holds, fails or unknown, and the error code when the guard is broken. Apart from `machine.ts`, which
 * Node's tests import unbundled and so must not reach the dictionaries.
 */
export function markText(mark: GuardMarkValue) {
  const word = t(`canon.worldLogic.systems.machine.try.marks.${mark.kind}`)
  return mark.code
    ? `${word} · ${t('canon.worldLogic.integrity.errorCode', { code: mark.code })}`
    : word
}
