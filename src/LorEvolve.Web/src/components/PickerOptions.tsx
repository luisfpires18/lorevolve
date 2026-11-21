import type { Dispatch, ReactNode, RefObject, SetStateAction } from 'react'
import type { EntitySummary } from '../lore/types'
import { useI18n } from '../i18n'

/**
 * The open result list of an EntityPicker: one option per match, the quiet line when there are none, and, when Quick
 * Create is on, the "Create ..." option last. `testPrefix` names the test ids: `<prefix>-option-<name>`, `<prefix>-create`.
 */
export function PickerOptions({
  id,
  label,
  listRef,
  results,
  active,
  setActive,
  onChoose,
  testPrefix,
  emptyText,
  startCreate,
  createName,
}: {
  id: string
  label: string
  listRef: RefObject<HTMLUListElement | null>
  results: EntitySummary[]
  active: number
  setActive: Dispatch<SetStateAction<number>>
  onChoose: (item: EntitySummary) => void
  testPrefix: string
  /** The line shown while there are no matches: "Looking..." or "No matches". */
  emptyText: ReactNode
  startCreate?: () => void
  createName: string
}) {
  const { t, tx } = useI18n()
  return (
    <ul className="picker__list" id={id} role="listbox" aria-label={label} ref={listRef}>
      {results.map((item, index) => (
        <li key={item.id}>
          <button
            id={`${id}-${item.id}`}
            className="picker__option"
            type="button"
            role="option"
            aria-selected={index === active}
            onMouseEnter={() => setActive(() => index)}
            onClick={() => onChoose(item)}
            data-testid={`${testPrefix}-option-${item.name}`}
          >
            <span className="picker__name">
              <bdi>{item.name}</bdi>
            </span>
            <span className="picker__kind">
              <bdi>{item.entityTypeName}</bdi>
            </span>
          </button>
        </li>
      ))}

      {results.length === 0 ? <li className="picker__none">{emptyText}</li> : null}

      {startCreate ? (
        <li>
          <button
            id={`${id}-create`}
            className="picker__option picker__create"
            type="button"
            role="option"
            aria-selected={active === results.length}
            onMouseEnter={() => setActive(() => results.length)}
            onClick={startCreate}
            data-testid={`${testPrefix}-create`}
          >
            <span className="picker__name">
              {tx('entity.picker.create', { name: <bdi>{createName}</bdi> })}
            </span>
            <span className="picker__kind">{t('entity.picker.newEntry')}</span>
          </button>
        </li>
      ) : null}
    </ul>
  )
}
