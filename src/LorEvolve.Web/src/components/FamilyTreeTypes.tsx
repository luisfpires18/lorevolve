import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { setEntityTypeGroupFamilyTree } from '../lore/api'
import type { EntityType, EntityTypeGroup } from '../lore/types'

interface Props {
  universeId: string
  types: EntityType[]
  groups: EntityTypeGroup[]
  canEdit: boolean
  /** Starts open, when nothing is enabled yet and this is where to begin. */
  defaultOpen: boolean
  /** A group was switched, as the API now has it: the page takes it, and reads again what that changes. */
  onChanged: (group: EntityTypeGroup) => void
}

/**
 * Which types the Family Tree is offered for (Issue #37): the types enabled one by one, which keep their meaning, and the
 * universe's groups, each of which its author may enable as a whole. A group says which types it covers, so the effect
 * of the switch is read before it is pressed. Being in a group, or what the group is called, enables nothing.
 *
 * Every member reads it; only those who may edit types switch a group, and the API holds that line as well. A switch
 * changes where the tree is offered, never what an entry holds: nothing recorded is rewritten or hidden.
 */
export function FamilyTreeTypes({
  universeId,
  types,
  groups,
  canEdit,
  defaultOpen,
  onChanged,
}: Props) {
  const headingId = useId()
  // Open or folded as the page first found it; the author's own opening and closing is left alone after that.
  const [startOpen] = useState(defaultOpen)
  // The switch being saved shows the state asked for while it is saved, and goes back if the save is refused.
  const [pending, setPending] = useState<{ id: string; enabled: boolean } | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const names = new Map(types.map((type) => [type.id, type.name]))
  const ownTypes = types.filter((type) => type.familyTreeEligible).map((type) => type.name)
  const typesPath = `/app/universes/${universeId}/types`

  async function toggle(group: EntityTypeGroup, enabled: boolean) {
    setPending({ id: group.id, enabled })
    setMessage(null)
    try {
      onChanged(await setEntityTypeGroupFamilyTree(universeId, group.id, enabled))
    } catch (error: unknown) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : `${group.name} could not be ${enabled ? 'turned on' : 'turned off'}.`,
      )
    } finally {
      setPending(null)
    }
  }

  return (
    <details className="family__setup" open={startOpen} data-testid="family-setup">
      <summary id={headingId}>Types in Family Tree</summary>

      <div className="family__setupbody">
        <p className="settings__note">
          Family Tree search and the Family tree action on an entry work for entries of these types.
          Family already recorded on an entry is always shown, whatever its type.
        </p>

        <section aria-labelledby={`${headingId}-types`}>
          <h3 className="family__setupheading" id={`${headingId}-types`}>
            Types enabled one by one
          </h3>
          <p data-testid="family-setup-types">
            {ownTypes.length > 0 ? ownTypes.join(', ') : 'None yet.'}{' '}
            <span className="settings__note">
              You choose this when you create a type, under{' '}
              <Link to={typesPath}>Types → Lore Types</Link>.
            </span>
          </p>
        </section>

        <section aria-labelledby={`${headingId}-groups`}>
          <h3 className="family__setupheading" id={`${headingId}-groups`}>
            Groups
          </h3>
          {groups.length === 0 ? (
            <p className="settings__note">
              This universe has no type groups yet. You can make one in a type&rsquo;s editor, under{' '}
              <Link to={typesPath}>Types → Lore Types</Link>.
            </p>
          ) : (
            <>
              <p className="settings__note">
                Turn a group on to offer Family Tree for every type in it, including types you add
                later. Turning it off leaves your recorded family as it is.
              </p>
              <ul className="family__grouplist">
                {groups.map((group) => {
                  const covers = group.typeIds
                    .map((id) => names.get(id))
                    .filter((name): name is string => !!name)
                    .sort((first, second) => first.localeCompare(second))
                  return (
                    <li key={group.id}>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={
                            pending?.id === group.id ? pending.enabled : group.familyTreeEnabled
                          }
                          disabled={!canEdit || pending !== null}
                          onChange={(event) => void toggle(group, event.target.checked)}
                          data-testid={`family-group-${group.name}`}
                        />
                        <span>
                          <bdi className="family__groupname">{group.name}</bdi>
                          <span className="family__groupcovers">
                            {covers.length > 0 ? (
                              <>
                                Covers <bdi>{covers.join(', ')}</bdi>
                              </>
                            ) : (
                              'No types in it yet'
                            )}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
              {canEdit ? null : (
                <p className="settings__note">Only an owner or an editor can change these.</p>
              )}
            </>
          )}
          {message ? (
            <p className="form__message" role="alert" data-testid="family-setup-error">
              {message}
            </p>
          ) : null}
        </section>
      </div>
    </details>
  )
}
