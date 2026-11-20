import { useId } from 'react'
import { useUniverseAccess } from '../universes/access'
import { t, useI18n } from '../i18n'
import { TERM_KIND_ORDER } from '../ruleValidation/types'
import { useTermManagerState } from '../ruleValidation/useTermManagerState'
import { termManagerActions } from '../ruleValidation/termManagerActions'
import { TermGroup } from './ruleValidation/TermGroup'
import { NewTermForm } from './ruleValidation/NewTermForm'
import { LoadingNote } from './LoadingNote'
import { SectionTitle } from './Section'
import { FormMessage } from './FormMessage'
import { QuietNote } from './QuietNote'

/**
 * The universe's event kinds and methods on the Types screen (ADR 0034): renamed here, deleted here once nothing names them, and
 * added here or straight from a rule or a moment. Not a workspace of its own - a vocabulary for checks, next to the others.
 */
export function ValidationTermManager({ universeId }: { universeId: string }) {
  const { tx } = useI18n()
  const access = useUniverseAccess()
  const headingId = useId()

  const state = useTermManagerState({ universeId })
  const {
    terms,
    message,
    renaming,
    setRenaming,
    busyId,
    newKind,
    setNewKind,
    newName,
    setNewName,
    newError,
    setNewError,
  } = state
  const { saveRename, remove, add, onRenameKeyDown } = termManagerActions({
    ...state,
    universeId,
    tx,
  })

  return (
    <section className="reltypes terms" aria-labelledby={headingId} data-testid="validation-terms">
      <div className="relations__head">
        <SectionTitle id={headingId}>{t('canon.terms.heading')}</SectionTitle>
      </div>

      <QuietNote spacing="block">{t('canon.terms.note')}</QuietNote>

      {message ? <FormMessage testId="terms-error">{message}</FormMessage> : null}

      {terms === null && !message ? <LoadingNote>{t('canon.terms.reading')}</LoadingNote> : null}

      {terms
        ? TERM_KIND_ORDER.map((kind) => (
            <TermGroup
              key={kind}
              kind={kind}
              terms={terms}
              headingId={headingId}
              access={access}
              renaming={renaming}
              setRenaming={setRenaming}
              busyId={busyId}
              saveRename={saveRename}
              remove={remove}
              onRenameKeyDown={onRenameKeyDown}
            />
          ))
        : null}

      {access.editContent ? (
        <NewTermForm
          headingId={headingId}
          newKind={newKind}
          setNewKind={setNewKind}
          newName={newName}
          setNewName={setNewName}
          newError={newError}
          setNewError={setNewError}
          add={add}
        />
      ) : null}
    </section>
  )
}
