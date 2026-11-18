import { ChangeList } from '../EditConflict'
import { useI18n } from '../../i18n'
import { formatDateTime } from '../../lib/dates'
import type { Change } from '../../lib/editConflict'
import { SuggestionStatus, type Suggestion } from '../../suggestions/api'
import type { useUniverseAccess } from '../../universes/access'
import { CHANGED_SINCE } from '../../suggestions/suggestionList'

/** One suggestion: who and when, its changed fields, how it was decided, and Accept and Reject while it is open. */
export function SuggestionItem<T>({
  suggestion,
  what,
  describe,
  access,
  busy,
  decide,
}: {
  suggestion: Suggestion<T>
  what: keyof typeof CHANGED_SINCE
  describe: (before: T, proposed: T) => Change[]
  access: ReturnType<typeof useUniverseAccess>
  busy: string | null
  decide: (suggestion: Suggestion<T>, decision: 'accept' | 'reject') => Promise<void>
}) {
  const { t, tx } = useI18n()
  const isOpen = suggestion.status === SuggestionStatus.Open
  const state =
    suggestion.status === SuggestionStatus.Accepted
      ? 'accepted'
      : suggestion.status === SuggestionStatus.Rejected
        ? 'rejected'
        : 'open'

  return (
    <li
      className="reviewthread suggestion"
      data-testid="suggestion"
      data-status={state}
      data-resolved={isOpen ? 'false' : 'true'}
    >
      <p className="reviewcomment__meta">
        <span className="reviewcomment__author" data-testid="suggestion-author">
          {suggestion.proposedByName === null ? (
            t('review.suggestions.unknownAuthor')
          ) : (
            <bdi>{suggestion.proposedByName}</bdi>
          )}
        </span>
        <time dateTime={suggestion.createdAt}>{formatDateTime(suggestion.createdAt)}</time>
      </p>

      {isOpen && suggestion.targetChanged ? (
        <p className="callout callout--warning suggestion__note" data-testid="suggestion-changed">
          {t(CHANGED_SINCE[what])}{' '}
          {access.resolveSuggestions
            ? t('review.suggestions.cantAcceptReject')
            : t('review.suggestions.cantAcceptAgain')}
        </p>
      ) : null}

      <ChangeList
        changes={describe(suggestion.before, suggestion.proposed)}
        sides={{
          latest: t('review.suggestions.before'),
          mine: t('review.suggestions.suggested'),
        }}
        empty={t('review.suggestions.noLongerShown')}
        testId="suggestion"
      />

      {isOpen ? null : (
        <p className="reviewthread__resolved" data-testid="suggestion-resolution">
          {tx(
            state === 'accepted'
              ? 'review.suggestions.acceptedBy'
              : 'review.suggestions.rejectedBy',
            {
              name:
                suggestion.resolvedByName === null ? (
                  t('review.suggestions.unknownResolver')
                ) : (
                  <bdi>{suggestion.resolvedByName}</bdi>
                ),
            },
          )}
          {suggestion.resolvedAt ? <> · {formatDateTime(suggestion.resolvedAt)}</> : null}
        </p>
      )}

      {isOpen && access.resolveSuggestions ? (
        <div className="reviewthread__tools">
          {suggestion.targetChanged ? null : (
            <button
              className="button button--sm"
              type="button"
              disabled={busy !== null}
              onClick={() => void decide(suggestion, 'accept')}
              data-testid="suggestion-accept"
            >
              {busy === suggestion.id
                ? t('review.suggestions.accepting')
                : t('review.suggestions.accept')}
            </button>
          )}
          <button
            className="button button--secondary button--sm"
            type="button"
            disabled={busy !== null}
            onClick={() => void decide(suggestion, 'reject')}
            data-testid="suggestion-reject"
          >
            {t('review.suggestions.reject')}
          </button>
        </div>
      ) : null}
    </li>
  )
}
