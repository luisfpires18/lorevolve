import { NameList } from '../NameList'
import { articleLinks } from '../../lore/document'
import { useI18n } from '../../i18n'
import { copyableReferences, type CopySource, type Draft } from '../../lore/entryDraft'
import { QuietNote } from '../QuietNote'
import { Callout } from '../Callout'

/**
 * What a copy takes from the entry it is made from (Issue #27), said above the new entry's form before anything is created.
 *
 * Aliases and links to other entries are offered and start off: an alias names the source, and a link field points at
 * other entries. Their boxes read the form rather than state of their own, so taking one out of the form by hand clears its
 * box too. The article is offered, off, with every link it holds listed when it is chosen - it is copied with them, as
 * written. Everything else an entry has is named as not copied, never offered.
 */
export function CopyPanel({
  source,
  draft,
  onDraft,
  copyArticle,
  onCopyArticle,
}: {
  source: CopySource | null
  draft: Draft
  onDraft: (change: (current: Draft) => Draft) => void
  copyArticle: boolean
  onCopyArticle: (copy: boolean) => void
}) {
  const { t, tn, tx } = useI18n()

  if (!source) {
    return (
      <Callout look="callout" tone="warning" as="p" role="status" testId="entry-copy-unavailable">
        {t('entity.copy.unavailable')}
      </Callout>
    )
  }

  const { detail, article } = source
  const aliases = detail.aliases
  const references = copyableReferences(detail)
  const sameType = draft.entityTypeId === detail.entityTypeId
  const hasAliases = aliases.length > 0 && aliases.every((alias) => draft.aliases.includes(alias))
  const hasReferences =
    sameType &&
    references.length > 0 &&
    references.every(
      (value) =>
        draft.fields[value.fieldDefinitionId]?.referencedEntityId === value.referencedEntityId,
    )
  const links = copyArticle && article ? articleLinks(article.content) : []

  function setAliases(copy: boolean) {
    onDraft((current) => ({
      ...current,
      aliases: copy
        ? [...current.aliases, ...aliases.filter((alias) => !current.aliases.includes(alias))]
        : current.aliases.filter((alias) => !aliases.includes(alias)),
    }))
  }

  function setReferences(copy: boolean) {
    onDraft((current) => {
      const fields = { ...current.fields }
      for (const value of references) {
        if (copy) {
          fields[value.fieldDefinitionId] = {
            fieldDefinitionId: value.fieldDefinitionId,
            text: null,
            number: null,
            boolean: null,
            date: null,
            optionIds: null,
            referencedEntityId: value.referencedEntityId,
            eraId: null,
          }
        } else {
          delete fields[value.fieldDefinitionId]
        }
      }
      return { ...current, fields }
    })
  }

  return (
    <Callout
      look="callout"
      as="section"
      className="entrycopy"
      labelledBy="entry-copy-title"
      testId="entry-copy"
      title={
        <>
          {/* Named, not linked: the new form and an entry are one page, and a link from one to the other would carry the open
            form onto the source. */}
          {tx('entity.copy.title', { name: <bdi>{detail.name}</bdi> })}
        </>
      }
      titleId="entry-copy-title"
    >
      <p>{t('entity.copy.intro')}</p>

      {aliases.length > 0 || references.length > 0 || article ? (
        <fieldset className="entrycopy__options">
          <legend>{t('entity.copy.also')}</legend>
          <div className="choices">
            {aliases.length > 0 ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={hasAliases}
                  onChange={(event) => setAliases(event.target.checked)}
                  data-testid="entry-copy-aliases"
                />
                <span>{tx('entity.copy.aliases', { names: <NameList names={aliases} /> })}</span>
              </label>
            ) : null}
            {references.length > 0 ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={hasReferences}
                  disabled={!sameType}
                  onChange={(event) => setReferences(event.target.checked)}
                  data-testid="entry-copy-references"
                />
                <span>
                  {tx(sameType ? 'entity.copy.references' : 'entity.copy.referencesSameType', {
                    names: (
                      <NameList
                        names={references.map((value) =>
                          t('entity.copy.referenceItem', {
                            field: value.name,
                            entry: value.referencedEntityName ?? t('entity.copy.anotherEntry'),
                          }),
                        )}
                      />
                    ),
                  })}
                </span>
              </label>
            ) : null}
            {article ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={copyArticle}
                  onChange={(event) => onCopyArticle(event.target.checked)}
                  data-testid="entry-copy-article"
                />
                <span>{t('entity.copy.article')}</span>
              </label>
            ) : null}
          </div>
        </fieldset>
      ) : null}

      {copyArticle && article ? (
        links.length === 0 ? (
          <p data-testid="entry-copy-links">{t('entity.copy.noLinks')}</p>
        ) : (
          <div data-testid="entry-copy-links">
            <p>{tn('entity.copy.linksCopied', links.length, { n: links.length })}</p>
            <ul className="entrycopy__links">
              {links.map((link, index) => (
                <li key={index}>
                  <bdi>{link.text}</bdi> &rarr;{' '}
                  <span className="entrycopy__href">
                    {link.href.startsWith('/') || link.href.startsWith('#')
                      ? t('entity.copy.inside', { href: link.href })
                      : link.href}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : null}

      <QuietNote className="entryform__note" size="ui" testId="entry-copy-skipped">
        {t('entity.copy.skipped')}
      </QuietNote>
    </Callout>
  )
}
