import { arrangeFamily } from '../../familyTree/layout'
import { readFamilyTree } from '../../familyTree/reading'
import type { FamilyTree } from '../../familyTree/types'
import type { FamilyTreeNode } from '../../familyTree/types'
import { useI18n } from '../../i18n'
import type { useFamilyTreeViewState } from '../../familyTree/useFamilyTreeViewState'
import { ROWS } from '../../familyTree/useFamilyTreeViewState'
import { FamilyNode } from './FamilyNode'

export function FamilyTreeRows({
  layout,
  family,
  focal,
  tree,
  universeId,
  shown,
  focalCard,
  register,
  setHovered,
  setFocused,
  setOpen,
  onFocus,
}: Pick<
  ReturnType<typeof useFamilyTreeViewState>,
  'shown' | 'focalCard' | 'setHovered' | 'setFocused' | 'setOpen'
> & {
  layout: ReturnType<typeof arrangeFamily>
  family: ReturnType<typeof readFamilyTree>
  focal: ReturnType<typeof readFamilyTree>['focal']
  tree: FamilyTree
  universeId: string
  register: (entityId: string, element: HTMLLIElement | null) => void
  onFocus: (entityId: string) => void
}) {
  const { t } = useI18n()
  const nodeProps = {
    universeId,
    tree,
    shown,
    focalCard,
    register,
    setHovered,
    setFocused,
    setOpen,
    onFocus,
  }

  return (
    <>
      {ROWS.map((row) => {
        const units = layout.rows[row.position]
        const rowLabel = t(`places.treeView.rows.${row.position}`)
        const isFocalRow = row.position === 'siblings'
        if (units.length === 0 || (isFocalRow && !focal && family.rows.siblings.length === 0)) {
          return null
        }

        return (
          <section
            className="familytree__row"
            key={row.position}
            aria-label={rowLabel}
            data-row={row.position}
          >
            <h2 className="familytree__rowlabel">{rowLabel}</h2>
            <ul className="familytree__members">
              {units.flatMap((unit) => {
                const members = unit
                  .map((id) => family.nodes.get(id))
                  .filter((member): member is FamilyTreeNode => !!member)
                  .filter((member) => member.entityId !== tree.focalEntityId || !!focal)
                if (members.length < 2) {
                  return members.map((member) => (
                    <FamilyNode
                      key={member.entityId}
                      member={member}
                      isFocal={member.entityId === tree.focalEntityId}
                      {...nodeProps}
                    />
                  ))
                }
                // A couple, or a chain of them, kept together so a narrow screen never wraps between them.
                return [
                  <li className="familyunit" key={`unit-${unit.join('-')}`}>
                    <ul className="familyunit__members">
                      {members.map((member) => (
                        <FamilyNode
                          key={member.entityId}
                          member={member}
                          isFocal={member.entityId === tree.focalEntityId}
                          {...nodeProps}
                        />
                      ))}
                    </ul>
                  </li>,
                ]
              })}
            </ul>
          </section>
        )
      })}
    </>
  )
}
