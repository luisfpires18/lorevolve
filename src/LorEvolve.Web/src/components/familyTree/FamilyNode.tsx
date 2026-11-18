import { Eye } from 'lucide-react'
import { EntityTile } from '../EntityTile'
import type { FamilyTree } from '../../familyTree/types'
import type { FamilyTreeNode } from '../../familyTree/types'
import { useI18n } from '../../i18n'
import type { useFamilyTreeViewState } from '../../familyTree/useFamilyTreeViewState'

export function FamilyNode({
  member,
  isFocal,
  universeId,
  tree,
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
  member: FamilyTreeNode
  isFocal: boolean
  universeId: string
  tree: FamilyTree
  register: (entityId: string, element: HTMLLIElement | null) => void
  onFocus: (entityId: string) => void
}) {
  const { t } = useI18n()

  const portrait = (
    <EntityTile
      universeId={universeId}
      entityId={member.entityId}
      image={member.image}
      typeIcon={member.entityTypeIcon}
      typeAccent={member.entityTypeAccentColor}
      className="familynode__tile"
    />
  )

  return (
    <li
      key={member.entityId}
      className={isFocal ? 'familynode familynode--focal' : 'familynode'}
      ref={(element) => {
        if (isFocal) focalCard.current = element
        register(member.entityId, element)
      }}
      data-testid={`family-node-${member.name}`}
      data-focal={isFocal ? 'true' : undefined}
      data-canon={member.canonStatus}
      aria-current={isFocal ? 'true' : undefined}
      onPointerOver={() => setHovered(member.entityId)}
      onPointerLeave={() => setHovered((current) => (current === member.entityId ? null : current))}
      onFocus={() => setFocused(member.entityId)}
      onBlur={() => setFocused((current) => (current === member.entityId ? null : current))}
    >
      {isFocal ? (
        <div className="familynode__face">{portrait}</div>
      ) : (
        <button
          className="familynode__face familynode__button"
          type="button"
          onClick={() => onFocus(member.entityId)}
          data-testid={`family-focus-${member.name}`}
        >
          {portrait}
          <span className="visually-hidden">
            {t('places.treeView.showFamily', { name: member.name })}
          </span>
        </button>
      )}
      <button
        className="familynode__eye"
        type="button"
        onClick={(event) =>
          setOpen({
            focal: tree.focalEntityId,
            entityId: member.entityId,
            anchor: event.currentTarget,
          })
        }
        aria-haspopup="dialog"
        aria-expanded={shown?.entityId === member.entityId}
        aria-label={t('places.treeView.details', { name: member.name })}
        title={t('places.treeView.details', { name: member.name })}
        data-testid={`family-details-${member.name}`}
      >
        <Eye aria-hidden="true" focusable="false" strokeWidth={1.75} />
      </button>
      <p className="familynode__name" title={member.name}>
        <bdi>{member.name}</bdi>
        {isFocal ? (
          <span className="visually-hidden"> {t('places.treeView.focalNote')}</span>
        ) : null}
      </p>
    </li>
  )
}
