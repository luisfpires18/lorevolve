import { Check } from 'lucide-react'
import { CanonBlockNotice } from '../CanonBlockNotice'
import { useI18n } from '../../i18n'
import type { useMassRows } from '../../lore/useMassRows'
import { Button } from '../Button'
import { QuietNote } from '../QuietNote'

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
        <QuietNote className="actionbar__status" testId="mass-create-status" role="status">
          {status}
        </QuietNote>
        <div className="actions actions--tight actionbar__actions">
          <Button
            icon={Check}
            className="saveaction"
            onClick={() => void create()}
            aria-disabled={unavailable || undefined}
            aria-busy={isCreating || undefined}
            data-testid="mass-create-submit"
          >
            {isCreating
              ? tn('lore.massCreate.creating', rows.length, { n: rows.length })
              : readyCount > 0
                ? tn('lore.massCreate.create', readyCount, { n: readyCount })
                : t('lore.massCreate.createNone')}
          </Button>
          <Button tone="secondary" to={backTo}>
            {t('shell.actions.cancel')}
          </Button>
        </div>
      </footer>
    </>
  )
}
