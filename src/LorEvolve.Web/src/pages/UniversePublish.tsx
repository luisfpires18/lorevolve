import type { ReactNode } from 'react'
import { useOutletContext } from 'react-router-dom'
import { PageHeader } from '../components/PageHeader'
import { Section } from '../components/Section'
import { PublicDetailsForm } from '../components/PublicDetailsForm'
import { UniverseArtworkField } from '../components/UniverseArtworkField'
import { useI18n } from '../i18n'
import { REQUIREMENTS } from '../publishing/types'
import type { WorkspaceContext } from './UniverseWorkspace'
import { PublishAuthor } from '../components/publishing/PublishAuthor'
import { PublishContent } from '../components/publishing/PublishContent'
import { PublishHeaderActions } from '../components/publishing/PublishHeaderActions'
import { PublishStatus } from '../components/publishing/PublishStatus'
import { publishActions } from '../publishing/publishActions'
import { usePublishReads } from '../publishing/usePublishReads'
import { usePublishState } from '../publishing/usePublishState'
import { ReadGate } from '../components/ReadGate'

/**
 * Publish (UI refinement 014): a universe's public presentation, in the workspace, on a page of its own rather than a
 * section of Settings. It answers, top to bottom: is this universe public, what stands between it and publishing, what
 * readers see - its public summary, category, genres, artwork and author - and what of its lore and stories is out.
 *
 * The rules are the publication foundation's, unchanged (ADR 0036): visibility in words, never only a colour; publishing
 * refused - with the missing things listed - until everything is there, never over unsaved public details, and only
 * through a confirmation that lists exactly what becomes public, read fresh from the server; making it private
 * deliberate and confirmed too. The author's public name and photo stay the account's, on the Profile; this page shows
 * them and links there.
 */
export default function UniversePublish() {
  const { universe, setArtwork } = useOutletContext<WorkspaceContext>()
  const { t } = useI18n()
  const universeId = universe.id
  const base = `/app/universes/${universeId}`

  const page = usePublishState()
  const { state, setState, loadError, setDetailsDirty } = page
  const { load, isPublic, slug, published } = usePublishReads({ ...page, universeId, t })

  // The one control that changes who can see this universe lives at the head of the page (Product refinement 015):
  // Publish world, the page's primary action, while it is private; Make private, visible but in danger ink, while it is
  // public. Both open the confirmation in Status below rather than acting at once.
  const pageHeader = (actions: ReactNode) => (
    <PageHeader
      title={t('universe.publish.title')}
      lede={<p>{t('universe.publish.lede')}</p>}
      actions={actions}
    />
  )
  const header = pageHeader(null)

  if (loadError || !state) {
    return (
      <article className="publish" data-testid="public-portal">
        {header}
        <ReadGate
          load={loadError ? { kind: 'error', message: loadError } : { kind: 'loading' }}
          loading={{ text: t('universe.publish.loading') }}
          error={{ onRetry: () => void load(), retryLabel: t('universe.publish.retry') }}
        >
          {() => null}
        </ReadGate>
      </article>
    )
  }

  const missing = REQUIREMENTS.filter((requirement) => requirement.key in state.missing)

  const { askToPublish, publish, unpublish } = publishActions({ ...page, universeId, t, load })

  return (
    <article className="publish" data-testid="public-portal">
      {pageHeader(
        <PublishHeaderActions
          {...page}
          isPublic={isPublic}
          slug={slug}
          askToPublish={askToPublish}
        />,
      )}

      {/* One outer shell for every workspace page; only the form keeps a readable column. */}
      <div className="publish__body">
        <PublishStatus
          {...page}
          state={state}
          isPublic={isPublic}
          slug={slug}
          missing={missing}
          publish={publish}
          unpublish={unpublish}
        />

        <Section
          id="publish-details"
          titleId="publish-details-heading"
          title={t('universe.publish.detailsSection')}
        >
          <PublicDetailsForm
            universeId={universeId}
            state={state}
            onSaved={setState}
            onDirtyChange={setDetailsDirty}
          />
        </Section>

        <Section
          id="publish-artwork"
          titleId="publish-artwork-heading"
          title={t('universe.publish.artworkSection')}
        >
          <UniverseArtworkField
            universeId={universeId}
            artwork={state.artwork}
            isPublic={isPublic}
            onChanged={(next) => {
              setArtwork(next)
              void load()
            }}
          />
        </Section>

        <Section
          id="publish-author"
          titleId="publish-author-heading"
          title={t('universe.publish.authorSection')}
        >
          <PublishAuthor state={state} />
        </Section>

        <Section
          id="publish-content"
          titleId="publish-content-heading"
          title={t('universe.publish.contentSection')}
        >
          <PublishContent
            {...page}
            universeId={universeId}
            base={base}
            isPublic={isPublic}
            published={published}
          />
        </Section>
      </div>
    </article>
  )
}
