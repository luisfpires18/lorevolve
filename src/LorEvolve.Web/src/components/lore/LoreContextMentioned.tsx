import { EntityTile } from '../EntityTile'
import { useI18n } from '../../i18n'
import type { SceneLoreReference } from '../../stories/types'
import type { Mention } from '../../lore/mentions'
import type { useUniverseAccess } from '../../universes/access'

/** The prose's @ mentions, each once, with its entry's name now, a preview, and Add to this scene's Lore. */
export function LoreContextMentioned({
  universeId,
  headingId,
  mentioned,
  references,
  linkedIds,
  busy,
  access,
  setLink,
  openPreview,
}: {
  universeId: string
  headingId: string
  mentioned: Mention[]
  references: Map<string, SceneLoreReference> | 'failed' | null
  linkedIds: Set<string>
  busy: string | null
  access: ReturnType<typeof useUniverseAccess>
  setLink: (row: { id: string; name: string }, link: boolean) => Promise<void>
  openPreview: (id: string, from: string) => void
}) {
  const { t, tx } = useI18n()
  return (
    <>
      {mentioned.length > 0 ? (
        <section
          className="lorecontext__group"
          aria-labelledby={`${headingId}-mentioned`}
          data-testid="lore-context-mentions"
        >
          <h3 className="sectionrule sectionrule--accent" id={`${headingId}-mentioned`}>
            {t('lore.context.mentioned')}
          </h3>
          {references === 'failed' ? (
            <p className="form__message" data-testid="lore-context-mentions-error">
              {t('lore.context.mentionedFailed')}
            </p>
          ) : (
            <ul className="relations__rows">
              {mentioned.map((mention) => {
                const reference =
                  references instanceof Map ? references.get(mention.entityId) : undefined
                const known = references instanceof Map
                const live = reference !== undefined && !reference.isTrashed
                const isLinked = linkedIds.has(mention.entityId)
                const name = reference?.name ?? mention.name
                const key = `mention-${mention.entityId}`
                return (
                  <li
                    className="relation lorecontext__row"
                    key={mention.entityId}
                    data-testid="lore-context-mention"
                    data-name={name}
                  >
                    <EntityTile
                      className="relation__tile"
                      universeId={universeId}
                      entityId={mention.entityId}
                      image={live ? reference.image : null}
                      typeIcon={reference?.entityTypeIcon ?? null}
                      typeAccent={reference?.entityTypeAccentColor ?? null}
                    />
                    <div className="relation__body">
                      {live ? (
                        <button
                          className="relation__name lorecontext__name"
                          type="button"
                          onClick={() => openPreview(mention.entityId, key)}
                          data-preview-from={key}
                          aria-label={t('lore.context.previewPick', { name })}
                          data-testid="lore-context-mention-preview"
                        >
                          <bdi>{name}</bdi>
                        </button>
                      ) : (
                        <span className="relation__name lorecontext__name--trashed">
                          <bdi>{name}</bdi>
                        </span>
                      )}
                      <p className="relation__meta" data-testid="lore-context-mention-state">
                        {!known ? (
                          t('lore.context.reading')
                        ) : reference === undefined ? (
                          t('lore.context.notInLore')
                        ) : reference.isTrashed ? (
                          t('lore.context.inTheTrash')
                        ) : (
                          <>
                            <bdi>{reference.entityTypeName}</bdi>
                            {reference.name !== mention.name ? (
                              <span>
                                {tx('lore.context.writtenAs', {
                                  name: <bdi>{mention.name}</bdi>,
                                })}
                              </span>
                            ) : null}
                            {isLinked ? <span>{t('lore.context.inSceneLore')}</span> : null}
                          </>
                        )}
                      </p>
                    </div>
                    {access.editContent && live && !isLinked ? (
                      <button
                        className="button button--text lorecontext__action"
                        type="button"
                        aria-disabled={busy !== null}
                        aria-label={t('lore.context.addLabel', { name })}
                        onClick={() => void setLink({ id: mention.entityId, name }, true)}
                        data-testid="lore-context-mention-link"
                      >
                        {t('lore.context.add')}
                      </button>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ) : null}
    </>
  )
}
