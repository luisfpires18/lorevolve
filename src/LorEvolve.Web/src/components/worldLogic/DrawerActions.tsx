import { t } from '../../i18n'
import { m } from '../../worldLogic/machinePanelTypes'
import { Button } from '../Button'

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
      <Button type="submit" data-testid={`${testId}-apply`}>
        {isNew ? t(`${m}.add`) : t(`${m}.save`)}
      </Button>
      <Button tone="secondary" onClick={close} data-testid={`${testId}-cancel`}>
        {t(`${m}.cancel`)}
      </Button>
      {onDelete ? (
        <Button tone="danger" onClick={onDelete} data-testid={`${testId}-delete`}>
          {t(`${m}.delete`)}
        </Button>
      ) : null}
    </>
  )
}
