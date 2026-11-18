import { t } from '../i18n'

/** Move up / Move down items for a row of an ordered list, as the seasons list has them. */
export function MoveItems({
  index,
  count,
  busy,
  testId,
  onMove,
}: {
  index: number
  count: number
  busy: boolean
  testId: string
  onMove: (place: number) => void
}) {
  return (
    <>
      {index === 0 ? null : (
        <button
          className="actionmenu__item"
          type="button"
          disabled={busy}
          data-testid={`${testId}-up`}
          onClick={() => onMove(index - 1)}
        >
          {t('projects.common.moveUp')}
        </button>
      )}
      {index === count - 1 ? null : (
        <button
          className="actionmenu__item"
          type="button"
          disabled={busy}
          data-testid={`${testId}-down`}
          onClick={() => onMove(index + 1)}
        >
          {t('projects.common.moveDown')}
        </button>
      )}
    </>
  )
}
