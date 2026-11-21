import { ChangeList } from '../EditConflict'
import { useI18n } from '../../i18n'
import type { Change } from '../../lib/editConflict'
import { SuggestionStatus, type Suggestion } from '../../suggestions/api'
import type { useUniverseAccess } from '../../universes/access'
import { CHANGED_SINCE } from '../../suggestions/suggestionList'
import { Button } from '../Button'
import { QuietNote } from '../QuietNote'
import { VersionActor } from '../VersionActor'
import { Callout } from '../Callout'

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
  const { t } = useI18n()
  const isOpen = suggestion.status === SuggestionStatus.Open
  const state =
    suggestion.status === SuggestionStatus.Accepted
      ? 'accepted'
      : suggestion.status === SuggestionStatus.Rejected
        ? 'rejected'
        : 'open'

  return (
    <li
      className="stack stack--3 reviewthread suggestion"
      data-testid="suggestion"
      data-status={state}
      data-resolved={isOpen ? 'false' : 'true'}
    >
      <p className="reviewcomment__meta">
        <VersionActor
          name={suggestion.proposedByName}
          unknown={t('review.suggestions.unknownAuthor')}
          at={suggestion.createdAt}
          testId="suggestion-author"
        />
      </p>

      {isOpen && suggestion.targetChanged ? (
        <Callout
          look="callout"
          tone="warning"
          as="p"
          className="suggestion__note"
          testId="suggestion-changed"
        >
          {t(CHANGED_SINCE[what])}{' '}
          {access.resolveSuggestions
            ? t('review.suggestions.cantAcceptReject')
            : t('review.suggestions.cantAcceptAgain')}
        </Callout>
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
        <QuietNote className="reviewthread__resolved" testId="suggestion-resolution">
          <VersionActor
            name={suggestion.resolvedByName}
            unknown={t('review.suggestions.unknownResolver')}
            lead={
              state === 'accepted'
                ? 'review.suggestions.acceptedBy'
                : 'review.suggestions.rejectedBy'
            }
            at={suggestion.resolvedAt}
          />
        </QuietNote>
      )}

      {isOpen && access.resolveSuggestions ? (
        <div className="reviewthread__tools">
          {suggestion.targetChanged ? null : (
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => void decide(suggestion, 'accept')}
              data-testid="suggestion-accept"
            >
              {busy === suggestion.id
                ? t('review.suggestions.accepting')
                : t('review.suggestions.accept')}
            </Button>
          )}
          <Button
            tone="secondary"
            size="sm"
            disabled={busy !== null}
            onClick={() => void decide(suggestion, 'reject')}
            data-testid="suggestion-reject"
          >
            {t('review.suggestions.reject')}
          </Button>
        </div>
      ) : null}
    </li>
  )
}
