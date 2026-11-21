import { StaleChoice, type StaleChoiceProps } from './StaleChoice'
import { FormMessage } from './FormMessage'
import { RecoveredDraft, type RecoveredDraftProps } from './RecoveredDraft'

/**
 * The notices above an explicit-save editor, in order: the recovery copy offered (in `<div id={recoveryId}>`, which
 * the form names in `aria-describedby`), the stale-save choice, and why a save failed. `testId` is the editor's:
 * `idea` gives `idea-recovery`, the `StaleChoice` ids and `idea-error`. Catalogue: `docs/design/ui-components.md`.
 */
export function EditorNotices({
  testId,
  recovery,
  recoveryId,
  conflict,
  failure,
  failureTestId = `${testId}-error`,
  failureClassName,
}: {
  testId: string
  /** The copy offered, with its preview. Null while nothing is offered. */
  recovery?: Omit<RecoveredDraftProps, 'testId'> | null
  recoveryId?: string
  /** The save refused over a newer one. Null while there is none. */
  conflict?: Omit<StaleChoiceProps, 'testId'> | null
  failure: string | null
  failureTestId?: string
  failureClassName?: string
}) {
  return (
    <>
      {recovery ? (
        <div id={recoveryId}>
          <RecoveredDraft {...recovery} testId={`${testId}-recovery`} />
        </div>
      ) : null}

      {conflict ? <StaleChoice {...conflict} testId={testId} /> : null}

      {failure ? (
        <FormMessage className={failureClassName} testId={failureTestId}>
          {failure}
        </FormMessage>
      ) : null}
    </>
  )
}
