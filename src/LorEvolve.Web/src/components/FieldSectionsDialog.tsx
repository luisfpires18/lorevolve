import { useEffect } from 'react'
import { useI18n } from '../i18n'
import { payloadKey } from '../lib/drawerGuard'
import { useReturnFocus } from '../lib/returnFocus'
import { Drawer } from './Drawer'
import type { EntityType } from '../lore/typeDefinitions'
import type { DraftSection } from '../lore/sectionLayout'
import { useFieldSectionsState } from '../lore/useFieldSectionsState'
import { fieldSectionsActions } from '../lore/fieldSectionsActions'
import { SectionListEditor } from './lore/SectionListEditor'
import { SectionFieldPlacer } from './lore/SectionFieldPlacer'
import { Button } from './Button'

/**
 * A type's field sections (Issue #26) in the drawer every LorEvolve form uses: name, order, fold and remove sections, put each
 * field in one or in none, and order the fields within each. Saved at once, over the layout version it opened on; a layout someone saved since is refused, and
 * the author chooses between theirs and the saved one. Nothing here touches a field: its settings, values and version stay.
 */
export function FieldSectionsDialog({
  universeId,
  type,
  onClose,
  onChanged,
  onSaved,
}: {
  universeId: string
  /** The type as the list reads it now: after a refused save, the saved layout to compare with. */
  type: EntityType
  onClose: () => void
  onChanged: () => Promise<void>
  onSaved: () => Promise<void>
}) {
  const { t, tx } = useI18n()
  const state = useFieldSectionsState({ type })
  const { base, sections, placed, order, errors, message, stale, isSaving, focusKey } = state

  const isDirty = payloadKey({ sections, placed, order }) !== payloadKey(base.layout)
  useReturnFocus()

  useEffect(() => {
    if (focusKey.current === null) return
    document.getElementById(`section-name-${focusKey.current}`)?.focus()
    focusKey.current = null
  })

  const sectionLabel = (section: DraftSection, index: number) =>
    section.name.trim() || t('entityTypes.sections.defaultName', { n: index + 1 })

  // The active fields, as the drawer shows them: grouped like the form - no section first, then each section - in order.
  const active = new Map(type.fields.map((field) => [field.id, field]))
  const groups = [
    { key: '', label: t('entityTypes.sections.noSectionGroup') },
    ...sections.map((section, index) => ({
      key: section.key,
      label: sectionLabel(section, index),
    })),
  ]
    .map((group) => ({
      ...group,
      fields: order
        .filter((id) => active.has(id) && (placed[id] ?? '') === group.key)
        .map((id) => active.get(id)!),
    }))
    .filter((group) => group.fields.length > 0)

  const { patch, move, place, shift, add, remove, takeSaved, keepMine, save } =
    fieldSectionsActions({ ...state, universeId, type, onChanged, onSaved, t, active })

  return (
    <Drawer
      testId="sections-dialog"
      titleId="sections-heading"
      eyebrow={tx('entityTypes.sections.eyebrow', { name: <bdi>{type.name}</bdi> })}
      title={t('entityTypes.sections.title')}
      isDirty={isDirty}
      leaveMessage={t('entityTypes.sections.leaveConfirm', { name: type.name })}
      onClose={onClose}
      noValidate
      onSubmit={() => void save()}
      actions={(close) => (
        <>
          <Button type="submit" disabled={isSaving} data-testid="save-sections">
            {isSaving ? t('entityTypes.sections.saving') : t('entityTypes.sections.save')}
          </Button>
          <Button tone="secondary" onClick={close} data-testid="cancel-sections">
            {t('entityTypes.sections.cancel')}
          </Button>
        </>
      )}
    >
      {message ? (
        <p className="form__message" role="alert" data-testid="sections-dialog-error">
          {message}
        </p>
      ) : null}

      {stale ? (
        <div className="callout callout--warning" data-testid="sections-dialog-stale">
          <p className="callout__title">{t('entityTypes.sections.savedNow')}</p>
          <p className="fieldconflict__saved">
            {type.fieldSections.length === 0
              ? t('entityTypes.sections.noneSaved')
              : type.fieldSections.map((section) => section.name).join(', ')}
          </p>
          <p className="types__blockedlinks">
            <Button tone="secondary" size="sm" onClick={takeSaved} data-testid="sections-use-saved">
              {t('entityTypes.sections.useSaved')}
            </Button>
            <Button tone="text" size="sm" onClick={keepMine} data-testid="sections-keep-mine">
              {t('entityTypes.sections.keepMine')}
            </Button>
          </p>
        </div>
      ) : null}

      <p className="field__hint">{t('entityTypes.sections.hint')}</p>

      <SectionListEditor
        sections={sections}
        errors={errors}
        sectionLabel={sectionLabel}
        patch={patch}
        move={move}
        add={add}
        remove={remove}
      />

      {type.fields.length > 0 ? (
        <SectionFieldPlacer
          groups={groups}
          sections={sections}
          placed={placed}
          sectionLabel={sectionLabel}
          place={place}
          shift={shift}
        />
      ) : null}
    </Drawer>
  )
}
