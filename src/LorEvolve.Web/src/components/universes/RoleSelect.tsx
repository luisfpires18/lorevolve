import { useI18n } from '../../i18n'
import { COLLABORATOR_ROLES, roleLabel } from '../../universes/access'
import type { UniverseRoleValue } from '../../universes/types'

// ---------- Shared pieces ----------

export function RoleSelect({
  id,
  value,
  onChange,
  disabled,
  describedBy,
  testId,
}: {
  id: string
  value: UniverseRoleValue
  onChange: (role: UniverseRoleValue) => void
  disabled?: boolean
  describedBy?: string
  testId: string
}) {
  useI18n()

  return (
    <select
      id={id}
      name={id}
      className="field__input field__input--select collab__role"
      value={value}
      onChange={(event) => onChange(Number(event.target.value) as UniverseRoleValue)}
      disabled={disabled}
      aria-describedby={describedBy}
      data-testid={testId}
    >
      {COLLABORATOR_ROLES.map((role) => (
        <option key={role} value={role}>
          {roleLabel(role)}
        </option>
      ))}
    </select>
  )
}
