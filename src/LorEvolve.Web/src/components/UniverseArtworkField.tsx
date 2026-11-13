import { useEffect, useMemo, useRef, useState } from 'react'
import { Crop, ImageMinus, ImagePlus, ImageUp } from 'lucide-react'
import { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { IMAGE_ACCEPT, IMAGE_MAX_BYTES, type ImageCrop } from '../lib/imageCrop'
import { artworkUrl, removeArtwork, setArtwork, setArtworkCard } from '../publishing/api'
import { CARD_ASPECT, type UniverseArtworkRef } from '../publishing/types'
import { ActionIcon } from './ActionIcon'
import { ImageCropDialog, type SaveStage } from './ImageCropDialog'

type Framing =
  { kind: 'file'; file: File } | { kind: 'stored'; artwork: UniverseArtworkRef; source: string }

/**
 * A universe's artwork: one wide picture, framed 16:10 for its card in the public portal, shown here as that
 * card. The same cropper as every other picture, at the card's shape; the server cuts the card itself.
 *
 * Every write is immediate, as a stored entry's picture is: a confirmed upload, a new framing and a removal are
 * saved when they are made, so there is nothing unsaved to guard. A public universe cannot lose its artwork -
 * the server refuses - so Remove is not offered while it is public; Replace always is.
 */
export function UniverseArtworkField({
  universeId,
  artwork,
  isPublic,
  onChanged,
}: {
  universeId: string
  artwork: UniverseArtworkRef | null
  isPublic: boolean
  onChanged: (next: UniverseArtworkRef | null) => void
}) {
  const { t } = useI18n()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

  function choose(file: File | undefined) {
    if (input.current) input.current.value = ''
    if (!file) return
    setError(null)

    if (file.size > IMAGE_MAX_BYTES) {
      setError(t('universe.artwork.tooBig', { mb: IMAGE_MAX_BYTES / (1024 * 1024) }))
      return
    }

    setFraming({ kind: 'file', file })
  }

  async function keep(crop: ImageCrop, report: (stage: SaveStage) => void) {
    if (!framing) return

    if (framing.kind === 'stored') {
      report({ kind: 'working' })
      onChanged(await setArtworkCard(universeId, framing.artwork.assetId, crop))
    } else {
      report({ kind: 'sending', ratio: 0 })
      onChanged(
        await setArtwork(universeId, framing.file, crop, ({ ratio }) => {
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
      await removeArtwork(universeId)
      onChanged(null)
    } catch (problem: unknown) {
      setError(problem instanceof ApiError ? problem.message : t('universe.artwork.removeFailed'))
    } finally {
      setBusy(false)
    }
  }

  const source = framing === null ? null : framing.kind === 'file' ? pickedSource : framing.source
  const inputId = `artwork-input-${universeId}`

  return (
    <div className="artwork" data-testid="artwork-field">
      <div className="artwork__frame">
        {artwork ? (
          <img
            className="artwork__card"
            src={artworkUrl(universeId, artwork, 'card')}
            alt={t('universe.artwork.cardAlt')}
            width={960}
            height={600}
            data-testid="artwork-card"
          />
        ) : (
          <p className="artwork__empty" data-testid="artwork-empty">
            {t('universe.artwork.empty')}
          </p>
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
          data-testid="artwork-input"
        />
        <label
          className="button button--secondary avatar__pick"
          htmlFor={inputId}
          data-testid="artwork-pick"
        >
          <ActionIcon icon={artwork ? ImageUp : ImagePlus} />
          {artwork ? t('universe.artwork.replace') : t('universe.artwork.upload')}
        </label>

        {artwork ? (
          <button
            className="button button--secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              setError(null)
              setFraming({
                kind: 'stored',
                artwork,
                source: artworkUrl(universeId, artwork, 'original'),
              })
            }}
            data-testid="artwork-reframe"
          >
            <ActionIcon icon={Crop} />
            {t('universe.artwork.editFraming')}
          </button>
        ) : null}

        {artwork && !isPublic ? (
          <button
            className="button button--secondary"
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            data-testid="artwork-remove"
          >
            <ActionIcon icon={ImageMinus} />
            {busy ? t('universe.artwork.removing') : t('universe.artwork.remove')}
          </button>
        ) : null}
      </div>

      <p className="field__hint">
        {artwork && isPublic ? t('universe.artwork.hintPublic') : t('universe.artwork.hint')}
      </p>

      {error ? (
        <p className="field__error" role="alert" data-testid="artwork-error">
          {error}
        </p>
      ) : null}

      {framing && source ? (
        <ImageCropDialog
          key={source}
          source={source}
          aspect={CARD_ASPECT}
          initialCrop={framing.kind === 'stored' ? framing.artwork.crop : null}
          title={
            framing.kind === 'stored'
              ? t('universe.artwork.editFramingTitle')
              : t('universe.artwork.frameTitle')
          }
          confirmLabel={
            framing.kind === 'stored'
              ? t('universe.artwork.saveFraming')
              : t('universe.artwork.confirmUpload')
          }
          workingLabel={
            framing.kind === 'stored'
              ? t('universe.artwork.updatingCard')
              : t('universe.artwork.processing')
          }
          hint={t('universe.artwork.cropHint')}
          onConfirm={keep}
          onCancel={() => setFraming(null)}
        />
      ) : null}
    </div>
  )
}
