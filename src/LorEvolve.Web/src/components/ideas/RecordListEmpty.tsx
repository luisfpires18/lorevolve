import { EmptyState } from '../EmptyState'
import { NewButton } from '../NewButton'
import type { RecordWords } from '../../ideas/useRecordList'
import { t, useI18n } from '../../i18n'

/**
 * What an ideas or boards list says when it has nothing to show: deleted, filtered, a story's or a project's view
 * (`scope`, ideas only), or none yet with the New button. Catalogue: `docs/design/ui-components.md`.
 */
export function RecordListEmpty({
  testId,
  words: w,
  deleted,
  isFiltered,
  scope = null,
  newPath,
  newLabel,
  newTestId,
}: {
  testId: string
  words: RecordWords
  deleted: boolean
  isFiltered: boolean
  scope?: 'story' | 'project' | null
  newPath: string
  newLabel: string
  newTestId: string
}) {
  useI18n() // Re-renders on a language change; the words are read through the module's t.
  const which = deleted ? 'deleted' : isFiltered ? 'filtered' : scope
  if (which === 'story' || which === 'project') {
    return (
      <EmptyState
        testId={testId}
        title={t(`ideas.browser.empty.${which}Title`)}
        hint={t(`ideas.browser.empty.${which}Hint`)}
      />
    )
  }
  return which ? (
    <EmptyState
      testId={testId}
      title={t(`${w}.empty.${which}Title`)}
      hint={t(`${w}.empty.${which}Hint`)}
    />
  ) : (
    <EmptyState
      testId={testId}
      title={t(`${w}.empty.noneTitle`)}
      hint={t(`${w}.empty.noneHint`)}
      action={
        <NewButton to={newPath} data-testid={newTestId}>
          {newLabel}
        </NewButton>
      }
    />
  )
}
