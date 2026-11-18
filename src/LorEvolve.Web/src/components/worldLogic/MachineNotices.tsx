import { t } from '../../i18n'
import type { useMachinePanelState } from '../../worldLogic/useMachinePanelState'
import type { machinePanelActions } from '../../worldLogic/machinePanelActions'
import { m } from '../../worldLogic/machinePanelTypes'
import { Button } from '../Button'
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
        <div className="manuscript__conflict" role="alert" data-testid="machine-conflict">
          <p className="manuscript__conflicttext">{t(`${m}.conflict`)}</p>
          <div className="manuscript__conflictactions">
            <Button
              tone="secondary"
              disabled={saving}
              onClick={() => void keepMine()}
              data-testid="machine-keep-mine"
            >
              {t(`${m}.keepMine`)}
            </Button>
            <Button
              tone="secondary"
              disabled={saving}
              onClick={() => void loadSaved()}
              data-testid="machine-load-saved"
            >
              {t(`${m}.loadSaved`)}
            </Button>
          </div>
        </div>
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
