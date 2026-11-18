import type { ReactNode } from 'react'
import { t, useI18n } from '../../i18n'
import { useUniverseAccess } from '../../universes/access'
import { SaveAction } from '../SaveAction'
import { MANUSCRIPT_MAX_LENGTH } from '../../stories/types'
import { numberFormat } from '../../i18n/format'
import type { useManuscriptState } from '../../stories/useManuscriptState'

const count = (value: number) => numberFormat({}, 'en').format(value)

/** The count against the limit, the recovery warning, the prose's publication control and Save. */
export function ManuscriptSaveBar({
  statusId,
  tooLongId,
  failed,
  stored,
  draft,
  isSaving,
  saves,
  isDirty,
  isTooLong,
  access,
  save,
  publication,
}: ReturnType<typeof useManuscriptState> & {
  access: ReturnType<typeof useUniverseAccess>
  isDirty: boolean
  isTooLong: boolean
  save: (expectedVersion: number) => Promise<void>
  publication?: ReactNode
}) {
  useI18n() // Re-renders on a language change; the words are read through the module's t.

  return (
    <>
      {access.editContent ? (
        <div className="manuscript__bar">
          {isTooLong ? (
            <p
              className="field__error manuscript__toolong"
              id={tooLongId}
              data-testid="manuscript-too-long"
            >
              {t('manuscript.editor.tooLong', {
                used: count(draft.length),
                max: count(MANUSCRIPT_MAX_LENGTH),
              })}
            </p>
          ) : null}
          {failed && isDirty ? (
            <p
              className="recovery__warning"
              role="status"
              data-testid="manuscript-recovery-warning"
            >
              {t('manuscript.editor.noRecoveryCopy')}
            </p>
          ) : null}
          {publication ? <div className="manuscript__publication">{publication}</div> : null}
          <SaveAction
            label={t('manuscript.editor.save')}
            isDirty={isDirty}
            isSaving={isSaving}
            isBlocked={isTooLong}
            saves={saves}
            restingStatus={
              stored.updatedAt === null
                ? t('manuscript.editor.nothingSaved')
                : t('manuscript.editor.savedStatus')
            }
            statusId={statusId}
            statusTestId="manuscript-status"
            testId="manuscript-save"
            type="button"
            onSave={() => void save(stored.version)}
            keyShortcuts="Control+S Meta+S"
          />
        </div>
      ) : null}
    </>
  )
}
