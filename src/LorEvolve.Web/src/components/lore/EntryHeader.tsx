import { Link } from 'react-router-dom'
import { Crumb } from '../Crumb'
import { EntryHead } from '../EntryHead'
import type { PendingFieldImage } from '../FieldImageInput'
import { NameList } from '../NameList'
import { TypeIcon } from '../TypeIcon'
import { CANON_LABELS, type CanonStatusValue, type EntityDetail } from '../../lore/types'
import { CanonStatusPicker } from '../CanonStatusPicker'
import { typeChoices } from '../../lore/typeTree'
import { StatusBadge } from '../StatusBadge'
import { useI18n } from '../../i18n'
import type { Draft } from '../../lore/entryDraft'
import type { Dispatch, SetStateAction } from 'react'
import type { UniverseCapabilities } from '../../universes/access'
import type { EntityType } from '../../lore/typeDefinitions'
import { QuietNote } from '../QuietNote'

/** The entry's identity: the crumb, its type, its Canon status, its name, aliases and summary, read or edited. */
export function EntryHeader({
  universe,
  access,
  isNew,
  types,
  detail,
  draft,
  setDraft,
  isEditing,
  suggesting,
  fieldErrors,
  isSaving,
  setPendingFieldImages,
  selectedType,
  changeCanon,
}: {
  universe: { id: string }
  access: UniverseCapabilities
  isNew: boolean
  types: EntityType[]
  detail: EntityDetail | null
  draft: Draft
  setDraft: Dispatch<SetStateAction<Draft | null>>
  isEditing: boolean
  suggesting: boolean
  fieldErrors: Record<string, string>
  isSaving: boolean
  setPendingFieldImages: Dispatch<SetStateAction<Record<string, PendingFieldImage>>>
  selectedType: EntityType | null
  changeCanon: (next: CanonStatusValue) => Promise<void>
}) {
  const { t, tx } = useI18n()
  return (
    <EntryHead
      crumb={
        // Lore lists nothing until a type is chosen, so the way back is to this entry's own type.
        <Crumb
          items={[
            {
              to: `/app/universes/${universe.id}/lore?type=${detail?.entityTypeId ?? draft.entityTypeId}`,
              label: t('entity.page.head.lore'),
            },
          ]}
        />
      }
      type={
        isEditing ? (
          <select
            className="field__input field__input--select entry__typepick"
            aria-label={t('entity.page.head.typeLabel')}
            value={draft.entityTypeId}
            onChange={(event) => {
              setDraft({ ...draft, entityTypeId: event.target.value, fields: {} })
              // Pictures held for the old type's fields belong to no field of the new one.
              setPendingFieldImages({})
            }}
          >
            {typeChoices(types).map(({ type, label }) => (
              <option key={type.id} value={type.id}>
                {label}
              </option>
            ))}
          </select>
        ) : (
          // Back to the Lore list at this entry's type, by the type's id.
          <Link
            className="entry__type"
            to={`/app/universes/${universe.id}/lore?type=${detail?.entityTypeId ?? draft.entityTypeId}`}
            style={
              selectedType?.accentColor
                ? { ['--type-accent' as string]: selectedType.accentColor }
                : undefined
            }
            data-testid="entry-type"
          >
            <TypeIcon iconKey={selectedType?.icon ?? null} className="entry__typeicon" />
            <bdi>{detail?.entityTypeName ?? selectedType?.name}</bdi>
          </Link>
        )
      }
      // How settled the entry is, changed in one press. A choice, not an action: the chosen step is raised paper with its
      // glyph and word, never a filled block louder than the name.
      status={
        access.editContent || isNew || suggesting ? (
          <CanonStatusPicker
            label={t('entity.page.head.canonGroup')}
            disabled={isSaving}
            optionTestId="canon-"
            value={draft.canonStatus}
            onChange={changeCanon}
          />
        ) : (
          // Read only: the status, stated, with nothing to press.
          <StatusBadge
            step={draft.canonStatus}
            label={CANON_LABELS[draft.canonStatus]}
            testId="entry-canon-status"
          />
        )
      }
      name={<bdi>{detail?.name}</bdi>}
      nameTestId="entry-name"
      hiddenHeading={
        isNew
          ? t('entity.page.head.newEntry')
          : suggesting
            ? tx('entity.page.head.suggesting', { name: <bdi>{detail?.name}</bdi> })
            : tx('entity.page.head.editing', { name: <bdi>{detail?.name}</bdi> })
      }
      nameField={
        isEditing ? (
          <input
            className="entry__nameinput"
            aria-label={t('entity.page.head.nameLabel')}
            placeholder={t('entity.page.head.namePlaceholder')}
            dir="auto"
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
        ) : undefined
      }
    >
      {fieldErrors.name ? <p className="field__error">{fieldErrors.name}</p> : null}

      {!isEditing && (detail?.aliases.length ?? 0) > 0 ? (
        <QuietNote className="entry__aliases" size="ui" testId="entry-aliases">
          {tx('entity.page.head.alsoKnownAs', { names: <NameList names={detail!.aliases} /> })}
        </QuietNote>
      ) : null}

      {isEditing ? (
        <textarea
          className="entry__summaryinput"
          aria-label={t('entity.page.head.summaryLabel')}
          rows={2}
          placeholder={t('entity.page.head.summaryPlaceholder')}
          value={draft.summary}
          onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
        />
      ) : detail?.summary ? (
        <p className="entry__summary prose" data-testid="entry-summary">
          {detail.summary}
        </p>
      ) : null}
    </EntryHead>
  )
}
