import { useEffect } from 'react'
import { t, useI18n } from '../i18n'
import { useLeaveGuard } from '../lib/leaveGuard'
import { sameMachine } from '../worldLogic/machine'
import { m } from '../worldLogic/machinePanelTypes'
import { useMachinePanelState } from '../worldLogic/useMachinePanelState'
import { machinePanelActions } from '../worldLogic/machinePanelActions'
import { MachinePanelBody } from './worldLogic/MachinePanelBody'
import { Button } from './Button'

/**
 * A System's machine on the System editor's Machine tab (ADR 0073): the canvas, the same states and transitions as
 * rows under it, and the binding, each opened in a drawer. Every edit, a drag included, changes only the draft; one
 * "Save changes" sends the whole document under the System's version, so a move never races its own save. The
 * version is shared with the name save, which is why the editor keeps the base and hears about each save.
 *
 * A save refused because the System changed keeps the drawing exactly as it is and offers both ways out. A refusal
 * that names an item is shown under its row and in its drawer's field.
 */
export function SystemMachinePanel({
  universeId,
  systemId,
  systemName,
  projectId,
  baseVersion,
  onLoaded,
  onSaved,
  onDirty,
}: {
  universeId: string
  systemId: string
  systemName: string
  projectId: string | null
  /** The version this panel's saves are written over. */
  baseVersion: number
  onLoaded: (version: number) => void
  onSaved: (from: number, to: number) => void
  onDirty: (isDirty: boolean) => void
}) {
  useI18n() // re-renders when the language changes
  const state = useMachinePanelState({ universeId, systemId, projectId, onLoaded })
  const { setReads, stored, draft, load, setLoad } = state

  const isDirty = load === 'ready' && !sameMachine(draft, stored)
  useLeaveGuard(isDirty ? t(`${m}.leaveGuard`) : null)

  useEffect(() => {
    onDirty(isDirty)
  }, [isDirty, onDirty])

  const actions = machinePanelActions({ ...state, universeId, systemId, onSaved })

  if (load === 'loading') {
    return (
      <p className="notice" role="status">
        {t(`${m}.loading`)}
      </p>
    )
  }

  if (load === 'error') {
    return (
      <div className="notice notice--error" role="alert" data-testid="machine-unavailable">
        <p>{t(`${m}.readFailed`)}</p>
        <Button
          tone="secondary"
          onClick={() => {
            setLoad('loading')
            setReads((count) => count + 1)
          }}
        >
          {t('canon.rules.retry')}
        </Button>
      </div>
    )
  }

  return (
    <MachinePanelBody
      {...state}
      {...actions}
      universeId={universeId}
      systemId={systemId}
      systemName={systemName}
      projectId={projectId}
      baseVersion={baseVersion}
      isDirty={isDirty}
    />
  )
}
