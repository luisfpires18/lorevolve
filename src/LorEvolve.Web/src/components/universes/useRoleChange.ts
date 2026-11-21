import { errorText } from '../../lib/errorText'
import { useFormSave } from '../../lib/useFormSave'
import type { UniverseRoleValue } from '../../universes/types'

/**
 * A collaborator row's save: `run` does one action and shows the error's own message, or the action's fallback;
 * `changeRole` is the role picker's action. Shared by a person's row and a pending invitation's.
 */
export function useRoleChange<T>(
  change: (role: UniverseRoleValue) => Promise<T>,
  onChanged: (next: T) => void,
  failed: string,
) {
  const { isSaving: busy, message: error, save } = useFormSave({ needChange: null, failed: '' })

  const run = (work: () => Promise<unknown>, fallback: string) =>
    save(work, { refusal: (problem) => errorText(problem, fallback) })

  const changeRole = (role: UniverseRoleValue) =>
    run(async () => onChanged(await change(role)), failed)

  return { busy, error, run, changeRole }
}
