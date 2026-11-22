import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicAuthor } from '../portal/api'
import { useI18n } from '../i18n'
import { PublicReadGate } from '../components/portal/PublicReadGate'
import { Author } from '../components/portal/PublicAuthor'

/**
 * An author's public page at `/authors/{slug}` (ADR 0037): a creator inside the portal, not an account. Their public
 * name, their photo only if they chose to show it - otherwise the first letter of their name in a ring, never an
 * invented face - and their public worlds, as the same cards Explore draws. No email, username, account id, private
 * world or setting, and no counts of anything but what is public.
 *
 * An author exists publicly only while they have a public world: otherwise this is the same page as an address nobody
 * holds. The workspace's own Profile is a different thing, and stays in the workspace.
 */
export default function PublicAuthorPage() {
  const { t } = useI18n()
  const { authorSlug = '' } = useParams<{ authorSlug: string }>()
  const read = useCallback(
    (signal: AbortSignal) => getPublicAuthor(authorSlug, signal),
    [authorSlug],
  )

  return (
    <PublicReadGate
      readKey={authorSlug}
      read={read}
      missing={{ title: t('portal.author.missing'), testId: 'author-missing' }}
      skeleton="author"
      opening={t('portal.author.opening')}
    >
      {(author) => <Author author={author} />}
    </PublicReadGate>
  )
}
