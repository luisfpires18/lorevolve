import { LoreOnMaps } from '../LoreOnMaps'
import { EntityArticleSection } from '../EntityArticle'
import { FieldSectionFold } from '../FieldSectionFold'
import { fieldImageUrl } from '../../lore/images'
import type { EntityDetail, FieldValue } from '../../lore/types'
import type { FieldSection, EntityType } from '../../lore/typeDefinitions'
import { renderFact } from '../../lore/facts'
import { useI18n } from '../../i18n'
import type { Dispatch, SetStateAction } from 'react'
import type { Chronology } from '../../chronology/types'
import type { SectionGroup } from '../../lore/fieldSections'
import { SectionTitle } from '../Section'
import { DateText } from '../DateText'
import { TagList } from '../TagList'
import { Fact } from '../Fact'
import { FactList } from '../FactList'

/** The Article view beside the picture: the article itself, and the rail of facts, pictures, tags, maps and dates. */
export function EntryArticleView({
  universe,
  chronology,
  entityId,
  detail,
  isEditing,
  setSectionOpen,
  isSectionOpen,
  setIsWritingArticle,
  articleSaved,
  selectedType,
  factSections,
}: {
  universe: { id: string }
  chronology: Chronology
  entityId: string | undefined
  detail: EntityDetail | null
  isEditing: boolean
  setSectionOpen: Dispatch<SetStateAction<Record<string, boolean>>>
  isSectionOpen: (section: FieldSection) => boolean
  setIsWritingArticle: Dispatch<SetStateAction<boolean>>
  articleSaved: (updatedAt: string) => void
  selectedType: EntityType | null
  factSections: { ungrouped: FieldValue[]; groups: SectionGroup<FieldValue>[] }
}) {
  const { t, tx } = useI18n()
  const isNew = entityId === undefined
  const fact = (value: FieldValue) => (
    <Fact key={value.fieldDefinitionId} name={value.name} valueClassName="prose">
      {renderFact(value, chronology)}
    </Fact>
  )
  return (
    <>
      <div className="entry__main">
        {isNew ? null : (
          <EntityArticleSection
            key={entityId}
            universeId={universe.id}
            entityId={entityId}
            entityName={detail?.name ?? ''}
            canEdit={!isEditing}
            onEditingChange={setIsWritingArticle}
            onSaved={articleSaved}
          />
        )}
      </div>

      <aside className="entry__rail" aria-label={t('entity.page.rail.label')}>
        {(detail?.fields.length ?? 0) > 0 && factSections.groups.length === 0 ? (
          <FactList testId="entry-fields">{detail!.fields.map(fact)}</FactList>
        ) : null}

        {factSections.groups.length > 0 ? (
          <div className="stack stack--3" data-testid="entry-fields">
            {factSections.ungrouped.length > 0 ? (
              <FactList>{factSections.ungrouped.map(fact)}</FactList>
            ) : null}
            {factSections.groups.map(({ section, items }) => (
              <FieldSectionFold
                key={section.id}
                section={section}
                open={isSectionOpen(section)}
                onToggle={(open) =>
                  setSectionOpen((current) => ({ ...current, [section.id]: open }))
                }
              >
                <FactList>{items.map(fact)}</FactList>
              </FieldSectionFold>
            ))}
          </div>
        ) : null}

        {(detail?.fieldImages.length ?? 0) > 0 ? (
          <div className="stack stack--2" data-testid="entry-field-images">
            {detail!.fieldImages.map((picture) => {
              const name =
                selectedType?.fields.find((one) => one.id === picture.fieldId)?.name ?? ''
              return (
                <figure
                  className="entry__fieldimage"
                  key={picture.fieldId}
                  data-testid={`entry-field-image-${picture.fieldId}`}
                >
                  <figcaption className="sectiontitle sectiontitle--label">{name}</figcaption>
                  <img src={fieldImageUrl(universe.id, detail!.id, picture, 'crop')} alt={name} />
                </figure>
              )
            })}
          </div>
        ) : null}

        {(detail?.tags.length ?? 0) > 0 ? (
          <div className="stack stack--2">
            <SectionTitle level={2} tone="label">
              {t('entity.page.rail.tags')}
            </SectionTitle>
            <TagList tags={detail!.tags} className="dossier__tags" testId="entry-tags" />
          </div>
        ) : null}

        {detail ? (
          <LoreOnMaps key={detail.id} universeId={universe.id} entityId={detail.id} />
        ) : null}

        {detail ? (
          <p className="rail__meta">
            {tx('entity.page.rail.created', { date: <DateText value={detail.createdAt} /> })}
            <br />
            {tx('entity.page.rail.lastChanged', { date: <DateText value={detail.updatedAt} /> })}
          </p>
        ) : null}
      </aside>
    </>
  )
}
