import { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import type { ImageCrop } from '../lib/imageCrop'
import {
  artworkStore,
  pictureUrl,
  removePicture,
  setPicture,
  setPictureCard,
  type PictureStore,
} from '../covers/api'
import type { UniverseArtworkRef } from '../publishing/types'
import { ImageCropDialog, type SaveStage } from './ImageCropDialog'
import { PictureActions } from './PictureActions'
import { usePictureFraming } from '../lib/usePictureFraming'
import type { TextKey } from '../i18n/core'
import type { Dictionary } from '../i18n/en'
import { QuietNote } from './QuietNote'
import { FormMessage } from './FormMessage'

/**
 * A universe's artwork: one wide picture, framed 16:10 for its card in the public portal, shown here as that
 * card. The same cropper as every other picture, at the card's shape; the server cuts the card itself.
 *
 * Every write is immediate, as a stored entry's picture is: a confirmed upload, a new framing and a removal are
 * saved when they are made, so there is nothing unsaved to guard. A public universe cannot lose its artwork -
 * the server refuses - so Remove is not offered while it is public; Replace always is.
 *
 * A story's or a project's cover is the same picture at a route of its own (`store`), with its own frame and words.
 */
export function UniverseArtworkField({
  universeId,
  artwork,
  isPublic,
  onChanged,
  store: given,
  testId = 'artwork',
}: {
  universeId: string
  artwork: UniverseArtworkRef | null
  isPublic: boolean
  onChanged: (next: UniverseArtworkRef | null) => void
  /** Another picture of the same kind: a story's or a project's cover. Unset, the universe's artwork. */
  store?: PictureStore
  testId?: string
}) {
  const { t } = useI18n()
  const store = given ?? artworkStore(universeId)
  const w = store.words
  const { input, error, setError, busy, framing, setFraming, choose, remove } =
    usePictureFraming<UniverseArtworkRef>({ tooBigKey: `${w}.tooBig` as TextKey<Dictionary> })

  async function keep(crop: ImageCrop, report: (stage: SaveStage) => void) {
    if (!framing) return

    if (framing.kind === 'stored') {
      report({ kind: 'working' })
      onChanged(await setPictureCard(store, framing.image.assetId, crop))
    } else {
      report({ kind: 'sending', ratio: 0 })
      onChanged(
        await setPicture(store, framing.file, crop, ({ ratio }) => {
          report(ratio !== null && ratio >= 1 ? { kind: 'working' } : { kind: 'sending', ratio })
        }),
      )
    }

    setFraming(null)
  }

  const inputId = `${testId}-input-${store.path}`

  return (
    <div className="artwork" data-testid={`${testId}-field`}>
      <div className="artwork__frame">
        {artwork ? (
          <img
            className="artwork__card"
            src={pictureUrl(store, artwork, 'card')}
            alt={t(`${w}.cardAlt`)}
            width={store.aspect >= 1 ? 960 : 400}
            height={store.aspect >= 1 ? 600 : 600}
            data-testid={`${testId}-card`}
          />
        ) : (
          <QuietNote className="artwork__empty" testId={`${testId}-empty`}>
            {t(`${w}.empty`)}
          </QuietNote>
        )}
      </div>

      <div className="actions actions--tight artwork__actions">
        <PictureActions
          variant="avatar"
          input={input}
          inputId={inputId}
          hasPicture={Boolean(artwork)}
          busy={busy}
          onFile={(file) => void choose(file)}
          onReframe={() => {
            if (!artwork) return
            setError(null)
            setFraming({
              kind: 'stored',
              image: artwork,
              source: pictureUrl(store, artwork, 'original'),
            })
          }}
          onRemove={() =>
            void remove({
              stored: true,
              run: () => removePicture(store),
              done: () => onChanged(null),
              failed: (problem) =>
                problem instanceof ApiError ? problem.message : t(`${w}.removeFailed`),
            })
          }
          canRemove={!isPublic}
          removeTone="secondary"
          labels={{
            add: t(`${w}.upload`),
            replace: t(`${w}.replace`),
            reframe: t(`${w}.editFraming`),
            remove: t(`${w}.remove`),
            removing: t(`${w}.removing`),
          }}
          testIds={{
            input: `${testId}-input`,
            pick: `${testId}-pick`,
            reframe: `${testId}-reframe`,
            remove: `${testId}-remove`,
          }}
        />
      </div>

      <QuietNote spacing="hint">
        {artwork && isPublic ? t(`${w}.hintPublic`) : t(`${w}.hint`)}
      </QuietNote>

      {error ? <FormMessage testId={`${testId}-error`}>{error}</FormMessage> : null}

      {framing ? (
        <ImageCropDialog
          key={framing.source}
          source={framing.source}
          aspect={store.aspect}
          initialCrop={framing.kind === 'stored' ? framing.image.crop : null}
          title={framing.kind === 'stored' ? t(`${w}.editFramingTitle`) : t(`${w}.frameTitle`)}
          confirmLabel={framing.kind === 'stored' ? t(`${w}.saveFraming`) : t(`${w}.confirmUpload`)}
          workingLabel={framing.kind === 'stored' ? t(`${w}.updatingCard`) : t(`${w}.processing`)}
          hint={t(`${w}.cropHint`)}
          onConfirm={keep}
          onCancel={() => setFraming(null)}
        />
      ) : null}
    </div>
  )
}
