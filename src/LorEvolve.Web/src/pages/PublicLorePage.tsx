import { useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicLore, getPublicUniverse } from '../portal/api'
import { useI18n } from '../i18n'
import { PublicReadGate } from '../components/portal/PublicReadGate'
import { Entry } from '../components/portal/PublicLore'

/**
 * One published lore entry at `/worlds/{world}/lore/{entry}` (Task 011): a reference page, not the entry editor with its
 * buttons taken away. Its type, its name, its own lead, its picture's public square and its article in a reading
 * column - rendered by the same read-only renderer the workspace uses, so no markup is ever parsed from text, and with
 * its workspace links already removed by the API. Nothing else of the entry exists here: no fields, aliases, tags,
 * relationships, Canon status or history.
 *
 * The world and the entry are read together; either missing - private, trashed, or never there - is the one page that
 * says nothing about which. The owner, signed in, gets a quiet "Edit in workspace".
 */
export default function PublicLorePage() {
  const { t } = useI18n()
  const { slug = '', loreSlug = '' } = useParams<{ slug: string; loreSlug: string }>()
  const read = useCallback(
    (signal: AbortSignal) =>
      Promise.all([getPublicUniverse(slug, signal), getPublicLore(slug, loreSlug, signal)]),
    [slug, loreSlug],
  )

  return (
    <PublicReadGate
      readKey={`${slug}/${loreSlug}`}
      read={read}
      missing={{ title: t('portal.lore.missing'), testId: 'lore-missing' }}
      skeleton="page"
      opening={t('portal.lore.opening')}
    >
      {([world, entry]) => <Entry world={world} entry={entry} />}
    </PublicReadGate>
  )
}
