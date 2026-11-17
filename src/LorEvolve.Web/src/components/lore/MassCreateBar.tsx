import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { ActionIcon } from '../ActionIcon'
import { CanonBlockNotice } from '../CanonBlockNotice'
import { useI18n } from '../../i18n'
import type { useMassRows } from '../../lore/useMassRows'

type Rows = ReturnType<typeof useMassRows>

/** The Canon block, a failed request, and the action bar with Create. */
export function MassCreateBar({
  universe,
  backTo,
  rows,
  failure,
  blocked,
  isCreating,
  readyCount,
  create,
  unavailable,
  status,
}: Pick<Rows, 'rows' | 'failure' | 'blocked' | 'isCreating' | 'readyCount'> & {
  universe: { id: string }
  backTo: string
  create: () => Promise<void>
  unavailable: boolean
  status: string
}) {
  const { t, tn } = useI18n()
  return (
    <>
      {blocked ? (
        <CanonBlockNotice universeId={universe.id} findings={blocked} linkSubjects={false} />
      ) : null}

      {failure ? (
        <div className="notice notice--error" role="alert" data-testid="mass-create-failure">
          <p>{failure}</p>
        </div>
      ) : null}

      <footer className="actionbar masscreate__bar">
        <p className="actionbar__status" role="status" data-testid="mass-create-status">
          {status}
        </p>
        <div className="actionbar__actions">
          <button
            className="button saveaction"
            type="button"
            onClick={() => void create()}
            aria-disabled={unavailable || undefined}
            aria-busy={isCreating || undefined}
            data-testid="mass-create-submit"
          >
            <ActionIcon icon={Check} />
            {isCreating
              ? tn('lore.massCreate.creating', rows.length, { n: rows.length })
              : readyCount > 0
                ? tn('lore.massCreate.create', readyCount, { n: readyCount })
                : t('lore.massCreate.createNone')}
          </button>
          <Link className="button button--secondary" to={backTo}>
            {t('lore.massCreate.cancel')}
          </Link>
        </div>
      </footer>
    </>
  )
}
