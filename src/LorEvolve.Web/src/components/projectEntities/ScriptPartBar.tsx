import { CharCount } from '../CharCount'
import { SaveAction } from '../SaveAction'
import { t } from '../../i18n'
import { NODE_BODY_MAX_LENGTH, type ProjectNodeDetail } from '../../projectEntities/structure'

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
      <CharCount
        id="project-script-too-long"
        used={draft.length}
        max={NODE_BODY_MAX_LENGTH}
        show="over"
        words={{ tooLong: 'projects.script.tooLong' }}
        className="manuscript__toolong"
        testId="project-script-too-long"
      />
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
