import { t, tx, useI18n } from '../../i18n'
import { Quoted } from '../NameList'
import { TrashKind, TrashPublication, type TrashItem } from '../../trash/types'
import { Button } from '../Button'
import { InlineConfirm } from '../InlineConfirm'

/**
 * The question before a restore that touches the public portal. Trash keeps an entry's or story's public selection, so
 * restoring it brings that back: straight into public view when its universe is public, or silently selected when it
 * is not. The copy says which, and never claims visibility the item will not have.
 */
export function RestorePublicConfirm({
  item,
  panelRef,
  onRestore,
  onRestorePrivate,
  onCancel,
}: {
  item: TrashItem
  panelRef: React.RefObject<HTMLDivElement | null>
  onRestore: () => void
  onRestorePrivate: () => void
  onCancel: () => void
}) {
  useI18n()
  const visible = item.publication === TrashPublication.Visible
  const titleId = `trash-confirm-${item.id}`

  return (
    <InlineConfirm
      look="trash"
      title={
        visible
          ? tx('data.trash.publish.titleVisible', { name: <Quoted text={item.name} /> })
          : tx('data.trash.publish.titleHidden', { name: <Quoted text={item.name} /> })
      }
      titleId={titleId}
      panelRef={panelRef}
      onKeep={onCancel}
      testId="trash-publication-confirm"
      data={{ 'data-publication': visible ? 'visible' : 'hidden' }}
    >
      <p className="trash__confirmtext" data-testid="trash-publication-text">
        {visible
          ? item.kind === TrashKind.Entry
            ? t('data.trash.publish.textVisibleEntry')
            : t('data.trash.publish.textVisibleStory')
          : item.kind === TrashKind.Story
            ? t('data.trash.publish.textHiddenStory')
            : t('data.trash.publish.textHidden')}
      </p>
      <div className="form__actions">
        <Button onClick={onRestore} data-testid="trash-confirm-restore">
          {visible ? t('data.trash.publish.restoreVisible') : t('data.trash.publish.restoreHidden')}
        </Button>
        <Button tone="secondary" onClick={onRestorePrivate} data-testid="trash-confirm-private">
          {t('data.trash.publish.restorePrivate')}
        </Button>
        <Button tone="secondary" onClick={onCancel} data-testid="trash-confirm-cancel">
          {t('shell.actions.cancel')}
        </Button>
      </div>
    </InlineConfirm>
  )
}
