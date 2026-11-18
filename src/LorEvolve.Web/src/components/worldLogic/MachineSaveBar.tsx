import { SaveAction } from '../SaveAction'
import { t } from '../../i18n'
import type { useMachinePanelState } from '../../worldLogic/useMachinePanelState'
import type { machinePanelActions } from '../../worldLogic/machinePanelActions'
import { m } from '../../worldLogic/machinePanelTypes'

type State = ReturnType<typeof useMachinePanelState>
type Actions = ReturnType<typeof machinePanelActions>

/** The machine panel's save bar: Save changes and its status. */
export function MachineSaveBar({
  saving,
  saves,
  statusId,
  save,
  isDirty,
  isEmpty,
  baseVersion,
}: Pick<State, 'saving' | 'saves' | 'statusId'> &
  Pick<Actions, 'save'> & {
    isDirty: boolean
    isEmpty: boolean
    baseVersion: number
  }) {
  return (
    <div className="manuscript__bar idea__bar">
      <div className="idea__actions">
        <SaveAction
          label={t(`${m}.saveChanges`)}
          isDirty={isDirty}
          isSaving={saving}
          saves={saves}
          restingStatus={isEmpty ? t(`${m}.notSavedYet`) : t(`${m}.saved`)}
          statusId={statusId}
          statusTestId="machine-status"
          testId="machine-save"
          type="button"
          onSave={() => void save(baseVersion)}
        />
      </div>
    </div>
  )
}
