import { useId } from 'react'
import { Link } from 'react-router-dom'
import { ValidationTermSelect } from './ValidationTermSelect'
import { useValidationTerms } from '../ruleValidation/useValidationTerms'
import { CHECK_ERROR_KEYS, type CheckDraft } from '../ruleValidation/checkDraft'
import {
  MAX_OCCURRENCES_CEILING,
  UNCOUNTED_REASON_LABELS,
  ValidationTermKind,
  WorldRuleCheckOutcome,
  WorldRuleValidationKind,
  type WorldRuleCheck,
  type WorldRuleValidation,
} from '../ruleValidation/types'

interface WorldRuleCheckSectionProps {
  universeId: string
  value: CheckDraft
  onChange: (change: Partial<CheckDraft>) => void
  /** The check as last saved, for its terms' names. */
  stored: WorldRuleValidation | null
  /** What the saved check finds now, or null for a rule saved without one. */
  found: WorldRuleCheck | null
  isDirty: boolean
  errors: Record<string, string>
}

/**
 * A rule's optional check against the timeline (ADR 0034), inside the rule's own form. Words only is the default and stays
 * words: nothing on this screen is read out of the title or description. The one pattern, when chosen, asks only for its own
 * parts - an event kind, a method, a limit - and what the saved check finds is said in words, including when it cannot know.
 */
export function WorldRuleCheckSection({
  universeId,
  value,
  onChange,
  stored,
  found,
  isDirty,
  errors,
}: WorldRuleCheckSectionProps) {
  const radioName = useId()
  const hintId = useId()
  const maxId = useId()
  const maxHintId = useId()
  const maxErrorId = useId()
  const { terms, failed, add, reload } = useValidationTerms(universeId)

  const isLimit = value.kind === WorldRuleValidationKind.MaxOccurrencesPerParticipantAndMethod
  const maxError = errors[CHECK_ERROR_KEYS.max]

  return (
    <fieldset
      className="rule__check"
      aria-describedby={hintId}
      data-testid="world-rule-check-section"
    >
      <legend className="rule__legend">Check against the timeline</legend>
      <p className="field__hint" id={hintId}>
        Optional. LorEvolve never reads the words above. A check counts only what you set here and
        what moments record in their validation details.
      </p>

      <div className="rule__choices">
        <label className="check">
          <input
            type="radio"
            name={radioName}
            checked={!isLimit}
            onChange={() => onChange({ kind: WorldRuleValidationKind.None })}
            data-testid="world-rule-check-none"
          />
          <span>No check: this rule is words only</span>
        </label>
        <label className="check">
          <input
            type="radio"
            name={radioName}
            checked={isLimit}
            onChange={() =>
              onChange({ kind: WorldRuleValidationKind.MaxOccurrencesPerParticipantAndMethod })
            }
            data-testid="world-rule-check-limit"
          />
          <span>Limit how many times one participant has an event by a method</span>
        </label>
      </div>

      {errors[CHECK_ERROR_KEYS.kind] ? (
        <p className="field__error">{errors[CHECK_ERROR_KEYS.kind]}</p>
      ) : null}

      {isLimit ? (
        <div className="rule__checkfields" data-testid="world-rule-check-fields">
          {failed ? (
            <p className="form__message rule__checkwide" role="alert">
              The event kinds and methods could not be read.{' '}
              <button
                className="button button--secondary button--sm"
                type="button"
                onClick={reload}
              >
                Try again
              </button>
            </p>
          ) : null}

          <ValidationTermSelect
            universeId={universeId}
            kind={ValidationTermKind.EventKind}
            label="Event kind"
            hint="What sort of moment this rule limits."
            terms={terms}
            value={value.eventKindId}
            selectedName={stored?.eventKind.id === value.eventKindId ? stored.eventKind.name : null}
            emptyLabel="Choose an event kind"
            onChange={(eventKindId) => onChange({ eventKindId })}
            onCreated={add}
            error={errors[CHECK_ERROR_KEYS.eventKind]}
            testId="world-rule-check-event-kind"
          />

          <ValidationTermSelect
            universeId={universeId}
            kind={ValidationTermKind.Method}
            label="Method"
            hint="How it happens. Another method is another event."
            terms={terms}
            value={value.methodId}
            selectedName={stored?.method.id === value.methodId ? stored.method.name : null}
            emptyLabel="Choose a method"
            onChange={(methodId) => onChange({ methodId })}
            onCreated={add}
            error={errors[CHECK_ERROR_KEYS.method]}
            testId="world-rule-check-method"
          />

          <div className="field rule__max">
            <label className="field__label" htmlFor={maxId}>
              At most
            </label>
            <p className="field__hint" id={maxHintId}>
              Canon moments for each participant.
            </p>
            <input
              id={maxId}
              className="field__input"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_OCCURRENCES_CEILING}
              step={1}
              value={value.maxOccurrences}
              onChange={(event) => onChange({ maxOccurrences: event.target.value })}
              aria-invalid={maxError ? true : undefined}
              aria-describedby={[maxHintId, maxError ? maxErrorId : null].filter(Boolean).join(' ')}
              data-testid="world-rule-check-max"
            />
            {maxError ? (
              <p className="field__error" id={maxErrorId}>
                {maxError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {found && stored ? (
        <CheckState universeId={universeId} stored={stored} found={found} isDirty={isDirty} />
      ) : null}
    </fieldset>
  )
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/**
 * What the saved check finds, in words. It never says a rule holds while any moment that may match could not be counted, and a
 * check that cannot run says so rather than reading as fine. A conflict itself lives in Canon, and is linked there.
 */
function CheckState({
  universeId,
  stored,
  found,
  isDirty,
}: {
  universeId: string
  stored: WorldRuleValidation
  found: WorldRuleCheck
  isDirty: boolean
}) {
  const canonPath = `/app/universes/${universeId}/canon`
  const over = found.participantsOverLimit
  const counted = plural(found.countedMoments, 'Canon moment')

  const conflict =
    over > 0 ? (
      <>
        {plural(over, 'participant')} over the limit of {stored.maxOccurrences}.{' '}
        <Link to={canonPath} data-testid="world-rule-check-canon">
          See the conflict in Canon
        </Link>
        .
      </>
    ) : null

  let state: 'holds' | 'broken' | 'incomplete' | 'cannot'
  let label: string
  let summary: React.ReactNode

  if (found.outcome === WorldRuleCheckOutcome.CannotCheck) {
    state = 'cannot'
    label = 'Cannot check.'
    summary = found.problem
  } else if (found.outcome === WorldRuleCheckOutcome.Incomplete) {
    state = 'incomplete'
    label = 'Cannot fully check.'
    summary = (
      <>
        {counted} counted. {conflict} {plural(found.uncountedMoments, 'moment')} that may match
        could not be counted, so LorEvolve does not say this rule holds.
      </>
    )
  } else if (over > 0) {
    state = 'broken'
    label = 'Conflict found.'
    summary = (
      <>
        {counted} counted. {conflict}
      </>
    )
  } else {
    state = 'holds'
    label = 'Checked.'
    summary = `${counted} counted. No participant has more than ${stored.maxOccurrences}.`
  }

  return (
    <div className="rulecheck" data-state={state} data-testid="world-rule-check">
      <p className="rulecheck__state">
        <span className="rulecheck__label" data-testid="world-rule-check-label">
          {label}
        </span>{' '}
        {summary}
      </p>

      {found.uncounted.length > 0 ? (
        <ul className="rulecheck__list" data-testid="world-rule-check-uncounted">
          {found.uncounted.map((moment) => (
            <li key={moment.timelineEntryId}>
              <Link to={`/app/universes/${universeId}/timeline?moment=${moment.timelineEntryId}`}>
                <bdi>{moment.title}</bdi>
              </Link>{' '}
              ({UNCOUNTED_REASON_LABELS[moment.reason]})
            </li>
          ))}
          {found.uncountedMoments > found.uncounted.length ? (
            <li>and {found.uncountedMoments - found.uncounted.length} more</li>
          ) : null}
        </ul>
      ) : null}

      {found.notCanonMoments > 0 ? (
        <p className="rulecheck__note">
          {plural(found.notCanonMoments, 'matching moment')}{' '}
          {found.notCanonMoments === 1 ? 'is' : 'are'} not Canon, and not counted.
        </p>
      ) : null}

      {isDirty ? <p className="rulecheck__note">This is the rule as last saved.</p> : null}
    </div>
  )
}
