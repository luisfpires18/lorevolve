import type { PictureStore } from '../covers/api'
import { t, useI18n } from '../i18n'
import type { UniverseArtworkRef } from '../publishing/types'
import { Drawer } from './Drawer'
import { UniverseArtworkField } from './UniverseArtworkField'
import { FormActions } from './FormActions'

/**
 * A game's or a story's cover, set from its card's ⋯ menu. The same picture field the universe's artwork uses, at the
 * cover's own route and frame: every write is immediate, so the drawer only closes.
 */
export function CoverDrawer({
  universeId,
  name,
  cover,
  store,
  onChanged,
  onClose,
}: {
  universeId: string
  name: string
  cover: UniverseArtworkRef | null
  store: PictureStore
  onChanged: (next: UniverseArtworkRef | null) => void
  onClose: () => void
}) {
  useI18n()
  return (
    <Drawer
      testId="cover-drawer"
      titleId="cover-drawer-title"
      title={<bdi>{name}</bdi>}
      eyebrow={t(`${store.words}.upload`)}
      onClose={onClose}
      actions={(close) => <FormActions onCancel={close} dismiss="close" />}
    >
      <UniverseArtworkField
        universeId={universeId}
        artwork={cover}
        isPublic={false}
        store={store}
        testId="cover"
        onChanged={onChanged}
      />
    </Drawer>
  )
}
