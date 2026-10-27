import { ApiError } from '../lib/api'
import type { CanonBlockingFinding } from './types'

/** The constant the promotion gate stamps on its 409. Matched instead of the prose. */
export const CANON_PROMOTION_BLOCKED = 'canon_promotion_blocked'

/**
 * The findings a refused write would have introduced, or null when this failure was
 * something else entirely.
 *
 * Every gated save funnels through here rather than through its own `status === 409`
 * check, so one refusal reads the same wherever the author happened to be typing.
 */
export function blockingFindingsOf(error: unknown): CanonBlockingFinding[] | null {
  if (!(error instanceof ApiError) || error.code !== CANON_PROMOTION_BLOCKED) {
    return null
  }

  const findings = (error.problem as { blockingFindings?: unknown } | null)?.blockingFindings

  return Array.isArray(findings) ? (findings as CanonBlockingFinding[]) : []
}
