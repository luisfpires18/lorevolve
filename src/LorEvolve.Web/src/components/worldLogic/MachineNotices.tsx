import { t } from '../../i18n'
import type { useMachinePanelState } from '../../worldLogic/useMachinePanelState'
import type { machinePanelActions } from '../../worldLogic/machinePanelActions'
import { m } from '../../worldLogic/machinePanelTypes'
import { ConflictBar } from '../ConflictBar'
import { FormActions } from '../FormActions'

type State = ReturnType<typeof useMachinePanelState>
type Actions = ReturnType<typeof machinePanelActions>

/** The machine panel's notices: the conflict with its two ways out, the save's error, and the transition being drawn. */
export function MachineNotices({
  conflict,
  saving,
  keepMine,
  loadSaved,
  failure,
  connecting,
  stateName,
  setConnecting,
}: Pick<State, 'conflict' | 'saving' | 'failure' | 'connecting' | 'setConnecting'> &
  Pick<Actions, 'keepMine' | 'loadSaved'> & {
    stateName: Map<string, string>
  }) {
  return (
    <>
      {conflict ? (
        <ConflictBar
          text={t(`${m}.conflict`)}
          onKeepMine={() => void keepMine()}
          keepLabel={t(`${m}.keepMine`)}
          onLoadSaved={() => void loadSaved()}
          loadLabel={t(`${m}.loadSaved`)}
          busy={saving}
          testId="machine"
        />
      ) : null}

      {failure ? (
        <p className="form__message" role="alert" data-testid="machine-error">
          {failure}
        </p>
      ) : null}

      {connecting ? (
        <div className="notice" role="status" data-testid="machine-connecting">
          <p>{t(`${m}.connecting`, { name: stateName.get(connecting) ?? '' })}</p>
          <FormActions
            size="sm"
            onCancel={() => setConnecting(null)}
            cancelTestId="machine-connecting-cancel"
          />
        </div>
      ) : null}
    </>
  )
}
