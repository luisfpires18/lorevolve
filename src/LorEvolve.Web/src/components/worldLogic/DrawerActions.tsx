import { t } from '../../i18n'
import { m } from '../../worldLogic/machinePanelTypes'

/** A drawer's Add or Save, Delete for an item that exists, and Cancel. */
export function DrawerActions({
  close,
  isNew,
  onDelete,
  testId,
}: {
  close: () => void
  isNew: boolean
  onDelete?: () => void
  testId: string
}) {
  return (
    <>
      <button className="button" type="submit" data-testid={`${testId}-apply`}>
        {isNew ? t(`${m}.add`) : t(`${m}.save`)}
      </button>
      <button
        className="button button--secondary"
        type="button"
        onClick={close}
        data-testid={`${testId}-cancel`}
      >
        {t(`${m}.cancel`)}
      </button>
      {onDelete ? (
        <button
          className="button button--danger"
          type="button"
          onClick={onDelete}
          data-testid={`${testId}-delete`}
        >
          {t(`${m}.delete`)}
        </button>
      ) : null}
    </>
  )
}
