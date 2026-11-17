import { Maximize2 } from 'lucide-react'
import type { EntityDetail } from '../../lore/types'
import { useI18n } from '../../i18n'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { StagePicture } from '../../progression/stagePictures'

type ShownPicture = { src: string; fullSrc: string; width: number; height: number }

// The entry's picture, beside every view of it, not only the article.
export function EntryPicture({
  picture,
  mainPicture,
  stagePictures,
  setChosenPicture,
  entityId,
  detail,
  expandButton,
  setIsViewing,
}: {
  picture: ShownPicture | null
  mainPicture: ShownPicture | null
  stagePictures: StagePicture[]
  setChosenPicture: Dispatch<SetStateAction<{ entityId?: string; id: string } | null>>
  entityId: string | undefined
  detail: EntityDetail | null
  expandButton: RefObject<HTMLButtonElement | null>
  setIsViewing: Dispatch<SetStateAction<boolean>>
}) {
  const { t } = useI18n()
  return picture ? (
    <figure className="entry__media" data-testid="entry-image">
      {stagePictures.length > 0 ? (
        // One choice per stage with a picture, the main picture first when there is one: the article shows
        // the entry as it looks then.
        <div
          className="entry__stages"
          role="group"
          aria-label={t('entity.page.picture.group')}
          data-testid="entry-picture-stages"
        >
          {mainPicture ? (
            <button
              className="entry__stage"
              type="button"
              aria-pressed={picture === mainPicture}
              onClick={() => setChosenPicture(null)}
            >
              {t('entity.page.picture.main')}
            </button>
          ) : null}
          {stagePictures.map((one) => (
            <button
              key={one.id}
              className="entry__stage"
              type="button"
              aria-pressed={picture === one}
              onClick={() => setChosenPicture({ entityId, id: one.id })}
              data-testid="entry-picture-stage"
            >
              <bdi>{one.name}</bdi>
            </button>
          ))}
        </div>
      ) : null}
      <img
        key={picture.src}
        src={picture.src}
        alt={detail?.name ?? ''}
        // The page's largest paint: asked for first, ahead of the sections' code and the sidebar.
        fetchPriority="high"
        // The original's own dimensions, which give the browser the picture's shape before a byte
        // of it has loaded: the space it will occupy is reserved from its own aspect ratio, so the
        // article never jumps down the page as one arrives.
        width={picture.width}
        height={picture.height}
        decoding="async"
      />
      <button
        ref={expandButton}
        className="iconbutton entry__expand"
        type="button"
        onClick={() => setIsViewing(true)}
        aria-label={t('entity.page.picture.viewLabel')}
        title={t('entity.page.picture.viewTitle')}
        data-testid="entry-image-expand"
      >
        <Maximize2 aria-hidden="true" focusable="false" strokeWidth={1.75} />
      </button>
    </figure>
  ) : null
}
