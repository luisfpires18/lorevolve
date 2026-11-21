import { useId, type ComponentProps, type ReactNode } from 'react'
import type { UniverseRoleValue } from '../../universes/types'
import { ManageRow } from '../ManageRow'
import { QuietNote } from '../QuietNote'
import { RoleSelect } from './RoleSelect'

type RowProps = ComponentProps<typeof ManageRow>

/**
 * One row of the Collaborators panel: a person or a pending invitation. Who it is with its one meta line, a role
 * picker named for the row, then the row's own actions. The caller owns the save (`useRoleChange`) and its confirm.
 */
export function CollabRow({
  meta,
  roleLabel,
  role,
  onRole,
  roleTestId,
  busy,
  actions,
  ...row
}: Omit<RowProps, 'whoClassName' | 'controlsClassName' | 'errorClassName' | 'meta' | 'controls'> & {
  meta: ReactNode
  /** The picker's spoken name, which says whose role it is. */
  roleLabel: string
  role: UniverseRoleValue
  onRole: (role: UniverseRoleValue) => void
  roleTestId: string
  busy: boolean
  actions: ReactNode
}) {
  const id = useId()
  return (
    <ManageRow
      {...row}
      whoClassName="collab__who"
      meta={<QuietNote className="managerow__meta">{meta}</QuietNote>}
      controlsClassName="collab__controls"
      controls={
        <>
          <label className="visually-hidden" htmlFor={`${id}-role`}>
            {roleLabel}
          </label>
          <RoleSelect
            id={`${id}-role`}
            value={role}
            onChange={onRole}
            disabled={busy}
            testId={roleTestId}
          />
          {actions}
        </>
      }
      errorClassName="collab__error"
    />
  )
}
