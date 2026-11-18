import { SaveAction } from '../SaveAction'
import { t } from '../../i18n'
import { numberFormat } from '../../i18n/format'
import { NODE_BODY_MAX_LENGTH, type ProjectNodeDetail } from '../../projectEntities/structure'

const count = (value: number) => numberFormat({}, 'en').format(value)

export function ScriptPartBar({
  isTooLong,
  draft,
  isDirty,
  isSaving,
  saves,
  node,
  isPanel,
  statusId,
  save,
}: {
  isTooLong: boolean
  draft: string
  isDirty: boolean
  isSaving: boolean
  saves: number
  node: ProjectNodeDetail
  isPanel: boolean
  statusId: string
  save: () => Promise<void>
}) {
  return (
    <div className="manuscript__bar">
      {isTooLong ? (
        <p className="field__error manuscript__toolong" data-testid="project-script-too-long">
          {t('projects.script.tooLong', {
            used: count(draft.length),
            max: count(NODE_BODY_MAX_LENGTH),
          })}
        </p>
      ) : null}
      <SaveAction
        label={t('projects.script.save')}
        isDirty={isDirty}
        isSaving={isSaving}
        isBlocked={isTooLong}
        saves={saves}
        restingStatus={
          node.body || isPanel ? t('projects.script.saved') : t('projects.script.nothingSaved')
        }
        statusId={statusId}
        statusTestId="project-script-status"
        testId="project-script-save"
        type="button"
        onSave={() => void save()}
        keyShortcuts="Control+S Meta+S"
      />
    </div>
  )
}
