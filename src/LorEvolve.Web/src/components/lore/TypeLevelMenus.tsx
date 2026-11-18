import { Link, type To } from 'react-router-dom'
import { ChevronDown, Layers } from 'lucide-react'
import { useI18n } from '../../i18n'
import type { EntityTypeGroup } from '../../lore/typeDefinitions'
import type { TypeNode } from '../../lore/typeTree'
import type { Level } from '../../lore/typeLevels'
import { ActionMenu } from '../ActionMenu'
import { TypeIcon } from '../TypeIcon'
import { buttonClass } from '../../lib/buttonClass'

/** Lore's type navigation on a phone: one compact menu per level, with the groups under the first. */
export function TypeLevelMenus({
  levels,
  selected,
  hrefFor,
  groups,
  selectedGroupId,
  groupHref,
  showGroups,
  chosenGroup,
  tint,
  current,
  items,
  chosenOn,
}: {
  levels: Level[]
  selected: TypeNode | null
  hrefFor: (typeId: string) => To
  groups: EntityTypeGroup[]
  selectedGroupId: string | null
  groupHref?: (groupId: string) => To
  showGroups: boolean
  chosenGroup: EntityTypeGroup | null
  tint: (node: TypeNode) => { [x: string]: string } | undefined
  current: (node: TypeNode) => 'page' | 'true' | undefined
  items: (level: Level) => { node: TypeNode; label: string; all: boolean }[]
  chosenOn: (level: Level) => string | null
}) {
  const { t } = useI18n()
  return (
    <>
      {levels.map((level, depth) => {
        // On a phone the groups live in the Category menu, after the types; a chosen group is what that menu names.
        const groupHere = depth === 0 && chosenGroup !== null
        const chosen = groupHere ? chosenGroup.name : chosenOn(level)
        const what = groupHere
          ? t('entityTypes.switcher.whatGroup')
          : level.parent
            ? t('entityTypes.switcher.whatIn', { name: level.parent.type.name })
            : t('entityTypes.switcher.whatCategory')
        return (
          <ActionMenu
            key={level.parent?.type.id ?? 'top'}
            className={depth === 0 ? 'typemenu' : 'typemenu typemenu--sub'}
            panelClassName="actionmenu__panel--start typemenu__panel"
            label={
              chosen
                ? t('entityTypes.switcher.menuChosen', { what, chosen })
                : depth === 0
                  ? t('entityTypes.switcher.chooseCategory')
                  : t('entityTypes.switcher.chooseIn', { name: level.parent!.type.name })
            }
            triggerClassName={buttonClass({ tone: 'secondary', className: 'typemenu__trigger' })}
            triggerTestId={depth === 0 ? 'lore-type-menu' : 'lore-subtype-menu'}
            panelTestId={depth === 0 ? 'lore-type-menu-panel' : 'lore-subtype-menu-panel'}
            trigger={
              <>
                {chosen ? <span className="typemenu__label">{what}</span> : null}
                <span className="typemenu__current">
                  <bdi>
                    {chosen ??
                      (depth === 0
                        ? t('entityTypes.switcher.triggerCategory')
                        : t('entityTypes.switcher.triggerAll', { name: level.parent!.type.name }))}
                  </bdi>
                </span>
                <ChevronDown
                  className="typemenu__chevron"
                  aria-hidden="true"
                  focusable="false"
                  strokeWidth={1.75}
                />
              </>
            }
          >
            {items(level).map(({ node, label, all }) => (
              <Link
                key={all ? `all-${node.type.id}` : node.type.id}
                className="actionmenu__item typemenu__item"
                to={hrefFor(node.type.id)}
                aria-current={
                  all ? (selected?.type.id === node.type.id ? 'page' : undefined) : current(node)
                }
                style={tint(node)}
                data-type-name={node.type.name}
              >
                {all ? null : <TypeIcon iconKey={node.type.icon} className="typemenu__icon" />}
                <bdi>{label}</bdi>
              </Link>
            ))}
            {depth === 0 && showGroups ? (
              <>
                <p className="typemenu__heading" aria-hidden="true">
                  {t('entityTypes.switcher.groups')}
                </p>
                {groups.map((group) => (
                  <Link
                    key={`group-${group.id}`}
                    className="actionmenu__item typemenu__item"
                    to={groupHref!(group.id)}
                    aria-current={group.id === selectedGroupId ? 'page' : undefined}
                    data-group-name={group.name}
                  >
                    <Layers
                      className="typemenu__icon"
                      aria-hidden="true"
                      focusable="false"
                      strokeWidth={1.75}
                    />
                    <bdi>{group.name}</bdi>
                    <span className="visually-hidden">
                      {' '}
                      {t('entityTypes.switcher.groupSuffix')}
                    </span>
                  </Link>
                ))}
              </>
            ) : null}
          </ActionMenu>
        )
      })}
    </>
  )
}
