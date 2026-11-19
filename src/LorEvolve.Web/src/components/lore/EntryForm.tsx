import { EntityImageField, type PendingImage } from '../EntityImageField'
import type { PendingFieldImage } from '../FieldImageInput'
import { FieldSectionFold } from '../FieldSectionFold'
import { TokenInput } from '../TokenInput'
import type { EntityDetail } from '../../lore/types'
import type { FieldDefinition, FieldSection, EntityType } from '../../lore/typeDefinitions'
import { t, tn, useI18n } from '../../i18n'
import type { CopySource, Draft } from '../../lore/entryDraft'
import type { Dispatch, SetStateAction } from 'react'
import type { Chronology } from '../../chronology/types'
import type { SectionGroup } from '../../lore/fieldSections'
import type { QuickCreateOptions } from '../EntityPicker'
import { CopyPanel } from './EntryCopyPanel'
import { EntryFieldInput } from './EntryFieldInput'
import { QuietNote } from '../QuietNote'

export type EntryFormProps = {
  universe: { id: string }
  chronology: Chronology
  entityId: string | undefined
  isNew: boolean
  sourceId: string | null
  source: CopySource | null
  copyArticle: boolean
  setCopyArticle: Dispatch<SetStateAction<boolean>>
  detail: EntityDetail | null
  setDetail: Dispatch<SetStateAction<EntityDetail | null>>
  draft: Draft
  setDraft: Dispatch<SetStateAction<Draft | null>>
  suggesting: boolean
  fieldErrors: Record<string, string>
  setSectionOpen: Dispatch<SetStateAction<Record<string, boolean>>>
  isSectionOpen: (section: FieldSection) => boolean
  isSaving: boolean
  pendingImage: PendingImage | null
  setPendingImage: Dispatch<SetStateAction<PendingImage | null>>
  pendingFieldImages: Record<string, PendingFieldImage>
  setPendingFieldImages: Dispatch<SetStateAction<Record<string, PendingFieldImage>>>
  setHistoryKey: Dispatch<SetStateAction<number>>
  selectedType: EntityType | null
  formSections: { ungrouped: FieldDefinition[]; groups: SectionGroup<FieldDefinition>[] }
  quickCreate: QuickCreateOptions | null
}

/** The entry's form: the copy panel, the picture, names and tags, and the type's fields by section. */
export function EntryForm(props: EntryFormProps) {
  const {
    universe,
    entityId,
    sourceId,
    source,
    copyArticle,
    setCopyArticle,
    detail,
    setDetail,
    draft,
    setDraft,
    suggesting,
    fieldErrors,
    setSectionOpen,
    isSectionOpen,
    isSaving,
    pendingImage,
    setPendingImage,
    setHistoryKey,
    selectedType,
    formSections,
  } = props
  const { t, tx } = useI18n()
  const isNew = entityId === undefined
  const typeChanged =
    !isNew && detail !== null && draft !== null && draft.entityTypeId !== detail.entityTypeId

  const fieldInput = (definition: FieldDefinition) => (
    <EntryFieldInput
      key={definition.id}
      {...props}
      definition={definition}
      typeChanged={typeChanged}
    />
  )
  return (
    <div className="entryform" data-testid="entry-form">
      {isNew && sourceId !== null ? (
        <CopyPanel
          source={source}
          draft={draft}
          onDraft={(change) => setDraft((current) => change(current ?? draft))}
          copyArticle={copyArticle}
          onCopyArticle={setCopyArticle}
        />
      ) : null}

      {suggesting ? (
        <p className="callout" data-testid="entry-suggesting">
          {t('entity.page.suggestingNote')}
        </p>
      ) : (
        <section className="entryform__section">
          <EntityImageField
            universeId={universe.id}
            entityId={isNew ? null : entityId}
            image={detail?.image ?? null}
            pending={pendingImage}
            onPending={setPendingImage}
            onChanged={(image) => {
              setDetail((current) => (current ? { ...current, image } : current))
              // An image change is a version like any other, so the history is read again
              // rather than left sitting one write behind.
              setHistoryKey((key) => key + 1)
            }}
            disabled={isSaving}
          />
        </section>
      )}

      <section className="entryform__section">
        <h2 className="entryform__heading sectionrule sectionrule--accent">
          {t('entity.page.form.namesAndTags')}
        </h2>
        <TokenInput
          label={t('entity.page.form.aliases')}
          name="aliases"
          placeholder={t('entity.page.form.aliasesPlaceholder')}
          values={draft.aliases}
          onChange={(aliases) => setDraft({ ...draft, aliases })}
        />
        <TokenInput
          label={t('entity.page.form.tags')}
          name="tags"
          placeholder={t('entity.page.form.tagsPlaceholder')}
          values={draft.tags}
          onChange={(tags) => setDraft({ ...draft, tags })}
        />
      </section>

      {(selectedType?.fields.length ?? 0) > 0 ? (
        <section className="entryform__section">
          <h2 className="entryform__heading sectionrule sectionrule--accent">
            {tx('entity.page.form.records', { type: <bdi>{selectedType?.name}</bdi> })}
          </h2>
          {formSections.ungrouped.length > 0 ? (
            <div className="entryform__fields">{formSections.ungrouped.map(fieldInput)}</div>
          ) : null}
          {formSections.groups.map(({ section, items }) => {
            const refused = items.filter((definition) => fieldErrors[definition.id]).length
            return (
              <FieldSectionFold
                key={section.id}
                section={section}
                open={isSectionOpen(section)}
                onToggle={(open) =>
                  setSectionOpen((current) => ({ ...current, [section.id]: open }))
                }
                attention={refused > 0}
                meta={sectionMeta(items, refused)}
              >
                <div className="entryform__fields">{items.map(fieldInput)}</div>
              </FieldSectionFold>
            )
          })}
        </section>
      ) : null}

      {isNew ? (
        <QuietNote className="entryform__note" size="ui">
          {copyArticle && source?.article
            ? t('entity.page.form.noteCopied')
            : t('entity.page.form.noteArticle')}
        </QuietNote>
      ) : null}
    </div>
  )
}

/**
 * What a folded section of the form holds (Issue #26): its fields, how many are required, and how many a refused save named -
 * so a required or refused field is never out of sight behind a fold.
 */
function sectionMeta(items: FieldDefinition[], refused: number) {
  const required = items.filter((definition) => definition.isRequired).length
  const parts = [tn('entity.sections.fields', items.length, { n: items.length })]
  if (required > 0) parts.push(t('entity.sections.required', { n: required }))
  return (
    <>
      {parts.join(' · ')}
      {refused > 0 ? (
        <span className="fieldsection__alert">
          {' · '}
          {tn('entity.sections.attention', refused, { n: refused })}
        </span>
      ) : null}
    </>
  )
}
