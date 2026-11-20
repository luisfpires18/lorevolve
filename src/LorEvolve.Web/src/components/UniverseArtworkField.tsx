import { useEffect, useMemo, useState } from 'react'
import { Crop, ImageMinus, ImagePlus, ImageUp } from 'lucide-react'
import { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { IMAGE_ACCEPT, type ImageCrop } from '../lib/imageCrop'
import {
  artworkStore,
  pictureUrl,
  removePicture,
  setPicture,
  setPictureCard,
  type PictureStore,
} from '../covers/api'
import type { UniverseArtworkRef } from '../publishing/types'
import { ActionIcon } from './ActionIcon'
import { ImageCropDialog, type SaveStage } from './ImageCropDialog'
import { Button } from './Button'
import { buttonClass } from '../lib/buttonClass'
import { useImagePick } from '../lib/useImagePick'
import type { TextKey } from '../i18n/core'
import type { Dictionary } from '../i18n/en'
import { QuietNote } from './QuietNote'

type Framing =
  { kind: 'file'; file: File } | { kind: 'stored'; artwork: UniverseArtworkRef; source: string }

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
  const [busy, setBusy] = useState(false)
  const { input, error, setError, pick } = useImagePick(`${w}.tooBig` as TextKey<Dictionary>)
  const [framing, setFraming] = useState<Framing | null>(null)

  const pickedFile = framing?.kind === 'file' ? framing.file : null
  const pickedSource = useMemo(
    () => (pickedFile ? URL.createObjectURL(pickedFile) : null),
    [pickedFile],
  )

  useEffect(() => {
    if (!pickedSource) return
    return () => {
      URL.revokeObjectURL(pickedSource)
    }
  }, [pickedSource])

  function choose(chosen: File | undefined) {
    const file = pick(chosen)
    if (!file) return

    setFraming({ kind: 'file', file })
  }

  async function keep(crop: ImageCrop, report: (stage: SaveStage) => void) {
    if (!framing) return

    if (framing.kind === 'stored') {
      report({ kind: 'working' })
      onChanged(await setPictureCard(store, framing.artwork.assetId, crop))
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

  async function remove() {
    setError(null)
    setBusy(true)
    try {
      await removePicture(store)
      onChanged(null)
    } catch (problem: unknown) {
      setError(problem instanceof ApiError ? problem.message : t(`${w}.removeFailed`))
    } finally {
      setBusy(false)
    }
  }

  const source = framing === null ? null : framing.kind === 'file' ? pickedSource : framing.source
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

      <div className="artwork__actions">
        <input
          ref={input}
          id={inputId}
          className="avatar__input"
          type="file"
          accept={IMAGE_ACCEPT}
          disabled={busy}
          onChange={(event) => choose(event.target.files?.[0])}
          data-testid={`${testId}-input`}
        />
        <label
          className={buttonClass({ tone: 'secondary', className: 'avatar__pick' })}
          htmlFor={inputId}
          data-testid={`${testId}-pick`}
        >
          <ActionIcon icon={artwork ? ImageUp : ImagePlus} />
          {artwork ? t(`${w}.replace`) : t(`${w}.upload`)}
        </label>

        {artwork ? (
          <Button
            tone="secondary"
            icon={Crop}
            disabled={busy}
            onClick={() => {
              setError(null)
              setFraming({
                kind: 'stored',
                artwork,
                source: pictureUrl(store, artwork, 'original'),
              })
            }}
            data-testid={`${testId}-reframe`}
          >
            {t(`${w}.editFraming`)}
          </Button>
        ) : null}

        {artwork && !isPublic ? (
          <Button
            tone="secondary"
            icon={ImageMinus}
            disabled={busy}
            onClick={() => void remove()}
            data-testid={`${testId}-remove`}
          >
            {busy ? t(`${w}.removing`) : t(`${w}.remove`)}
          </Button>
        ) : null}
      </div>

      <p className="field__hint">{artwork && isPublic ? t(`${w}.hintPublic`) : t(`${w}.hint`)}</p>

      {error ? (
        <p className="form__message" role="alert" data-testid={`${testId}-error`}>
          {error}
        </p>
      ) : null}

      {framing && source ? (
        <ImageCropDialog
          key={source}
          source={source}
          aspect={store.aspect}
          initialCrop={framing.kind === 'stored' ? framing.artwork.crop : null}
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
