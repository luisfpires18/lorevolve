import type { KeyboardEvent } from 'react'
import { EntityRow } from '../EntityRow'
import { useI18n } from '../../i18n'
import type { EntityImageRef } from '../../lore/types'
import type { useUniverseAccess } from '../../universes/access'
import { Button } from '../Button'

/** One row as the drawer draws it, from a scene's reference or a search result alike. */
export interface LoreRow {
  id: string
  name: string
  typeName: string
  typeIcon: string | null
  typeAccent: string | null
  image: EntityImageRef | null
  isTrashed: boolean
}

/** One row of the drawer, linked or found: its tile, its name opening the preview, and Link or Unlink. */
export function LoreContextRow({
  row,
  from,
  universeId,
  linkedIds,
  busy,
  access,
  setLink,
  openPreview,
  moveThrough,
}: {
  row: LoreRow
  from: 'linked' | 'result'
  universeId: string
  linkedIds: Set<string>
  busy: string | null
  access: ReturnType<typeof useUniverseAccess>
  setLink: (row: { id: string; name: string }, link: boolean) => Promise<void>
  openPreview: (id: string, from: string) => void
  moveThrough: (event: KeyboardEvent<HTMLElement>) => void
}) {
  const { t } = useI18n()
  const isLinked = linkedIds.has(row.id)
  const key = `${from}-${row.id}`
  return (
    <li
      className="relation lorecontext__row"
      data-testid={`lore-context-${from}`}
      data-name={row.name}
    >
      <EntityRow
        universeId={universeId}
        entityId={row.id}
        image={row.image}
        typeIcon={row.typeIcon}
        typeAccent={row.typeAccent}
        name={
          row.isTrashed ? (
            <span className="relation__name lorecontext__name--trashed">
              <bdi>{row.name}</bdi>{' '}
              <span className="lorechip__note">{t('lore.context.inTrash')}</span>
            </span>
          ) : (
            <button
              className="relation__name lorecontext__name"
              type="button"
              onClick={() => openPreview(row.id, key)}
              onKeyDown={from === 'result' ? moveThrough : undefined}
              data-preview-from={key}
              data-result-name={from === 'result' ? '' : undefined}
              aria-label={t('lore.context.previewRow', { name: row.name })}
              data-testid="lore-context-preview"
            >
              <bdi>{row.name}</bdi>
            </button>
          )
        }
        meta={
          <>
            <bdi>{row.typeName}</bdi>
            {from === 'result' && isLinked && !access.editContent ? (
              <span>{t('lore.context.inSceneRow')}</span>
            ) : null}
          </>
        }
      />
      {access.editContent ? (
        <Button
          tone="text"
          className="lorecontext__action"
          aria-disabled={busy !== null}
          aria-label={
            isLinked
              ? t('lore.context.unlinkLabel', { name: row.name })
              : t('lore.context.linkLabel', { name: row.name })
          }
          onClick={() => void setLink(row, !isLinked)}
          data-testid={isLinked ? 'lore-context-unlink' : 'lore-context-link'}
        >
          {busy === row.id
            ? isLinked
              ? t('lore.context.unlinking')
              : t('lore.context.linking')
            : isLinked
              ? t('lore.context.unlink')
              : t('lore.context.link')}
        </Button>
      ) : null}
    </li>
  )
}
