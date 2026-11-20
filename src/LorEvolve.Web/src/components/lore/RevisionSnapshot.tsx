import { LoreArticle } from '../ArticleView'
import { NameList } from '../NameList'
import {
  findEra,
  formatChronologyYear,
  formatSignedYear,
  withEraLabel,
} from '../../chronology/format'
import { EraLabelPosition, type Chronology } from '../../chronology/types'
import { isEmptyDocument } from '../../lore/document'
import { formatDate } from '../../lib/dates'
import { EMPTY_FACT } from '../../lore/facts'
import type { EntityRevisionDetail, RevisionFieldValue } from '../../lore/revisions'
import { CANON_LABELS } from '../../lore/types'
import { FieldKind } from '../../lore/fieldKinds'
import { t, useI18n } from '../../i18n'
import { QuietNote } from '../QuietNote'
import { TagList } from '../TagList'

/** One version read whole, in the same shapes the dossier uses for the live entry. */
export function Snapshot({
  revision,
  chronology,
}: {
  revision: EntityRevisionDetail
  chronology: Chronology
}) {
  const { t, tx } = useI18n()
  return (
    <>
      <h3 className="snapshot__name">
        <bdi>{revision.name}</bdi>
      </h3>
      <QuietNote className="snapshot__kind">
        <bdi>{revision.entityTypeName}</bdi> &middot; {CANON_LABELS[revision.canonStatus]}
      </QuietNote>

      {revision.aliases.length > 0 ? (
        <QuietNote className="entry__aliases" size="ui">
          {tx('entity.history.alsoKnownAs', { names: <NameList names={revision.aliases} /> })}
        </QuietNote>
      ) : null}

      {revision.summary ? <p className="entry__summary prose">{revision.summary}</p> : null}

      {/* Only a version recorded before the article kept its own history holds a copy of it, and a restore never
          applies that copy - so it is shown as what it is, and a version without one says nothing about the article. */}
      {!isEmptyDocument(revision.content) ? (
        <div className="snapshot__article" data-testid="version-article">
          <QuietNote className="snapshot__articlenote">{t('entity.history.articleThen')}</QuietNote>
          <LoreArticle content={revision.content} />
        </div>
      ) : null}

      {revision.fields.length > 0 ? (
        <dl className="facts">
          {revision.fields.map((value) => (
            <div className="facts__row" key={value.fieldDefinitionId}>
              <dt className="facts__key">{value.name}</dt>
              <dd className="facts__value prose">{renderRevisionFact(value, chronology)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {revision.tags.length > 0 ? <TagList tags={revision.tags} className="dossier__tags" /> : null}
    </>
  )
}

/**
 * A stored value as it read then. Names come from the snapshot rather than a live lookup,
 * so a version still reads correctly once the field or the entry it pointed at is gone.
 */
function renderRevisionFact(value: RevisionFieldValue, chronology: Chronology) {
  switch (value.kind) {
    case FieldKind.ShortText:
    case FieldKind.LongText:
      return value.text ?? EMPTY_FACT
    case FieldKind.Number:
      if (value.number === null) return EMPTY_FACT
      if (value.eraId === null) return value.number
      // An era that still exists is written the way it is written now. One since removed is
      // written with the label the version remembered, which is all that is left of it.
      if (findEra(chronology, value.eraId)) {
        return formatChronologyYear(chronology, value.number, value.eraId)
      }
      return value.eraLabel
        ? withEraLabel(formatSignedYear(value.number), value.eraLabel, EraLabelPosition.BeforeYear)
        : value.number
    case FieldKind.Boolean:
      return value.boolean ? t('entity.fact.yes') : t('entity.fact.no')
    case FieldKind.Date:
      return value.date ? formatDate(value.date) : EMPTY_FACT
    case FieldKind.Select:
    case FieldKind.MultiSelect:
      return value.optionValues.length > 0 ? value.optionValues.join(', ') : EMPTY_FACT
    case FieldKind.EntityReference:
      return value.referencedEntityName ?? EMPTY_FACT
    default:
      return EMPTY_FACT
  }
}
