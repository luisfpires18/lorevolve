import type { useUniverseAccess } from '../../universes/access'
import { Field } from '../Field'
import { Quoted } from '../NameList'
import { t, useI18n } from '../../i18n'
import {
  TERM_KIND_PLURALS,
  TERM_NAME_MAX_LENGTH,
  type ValidationTerm,
  type ValidationTermKindValue,
} from '../../ruleValidation/types'
import { usage } from '../../ruleValidation/termUsage'
import type { useTermManagerState } from '../../ruleValidation/useTermManagerState'
import type { termManagerActions } from '../../ruleValidation/termManagerActions'
import { Button } from '../Button'
import { FormActions } from '../FormActions'
import { TypeRow } from '../TypeRow'
import { QuietNote } from '../QuietNote'

/** One kind's terms, each with its use, Rename and Delete, and the rename row in its place. */
export function TermGroup({
  kind,
  terms,
  headingId,
  access,
  renaming,
  setRenaming,
  busyId,
  saveRename,
  remove,
  onRenameKeyDown,
}: Pick<ReturnType<typeof useTermManagerState>, 'renaming' | 'setRenaming' | 'busyId'> &
  Pick<ReturnType<typeof termManagerActions>, 'saveRename' | 'remove' | 'onRenameKeyDown'> & {
    kind: ValidationTermKindValue
    terms: ValidationTerm[]
    headingId: string
    access: ReturnType<typeof useUniverseAccess>
  }) {
  const { tx } = useI18n()
  const group = terms.filter((term) => term.kind === kind)
  const groupId = `${headingId}-${kind}`

  return (
    <div className="terms__group" key={kind}>
      <h3 className="terms__kind" id={groupId}>
        {TERM_KIND_PLURALS[kind]}
      </h3>
      {group.length === 0 ? (
        <QuietNote size="body" className="relations__quiet">
          {t('canon.terms.none')}
        </QuietNote>
      ) : (
        <ul className="types__list" aria-labelledby={groupId}>
          {group.map((term) =>
            renaming?.id === term.id ? (
              <TypeRow
                key={term.id}
                name={term.name}
                head={
                  <Field
                    label={tx('canon.terms.renameLabel', {
                      name: <Quoted text={term.name} />,
                    })}
                    id={`${groupId}-rename`}
                    className="terms__rename"
                    error={renaming.error || undefined}
                    announce
                  >
                    {(control) => (
                      <>
                        <div className="termselect__row">
                          <input
                            id={control.id}
                            className="field__input termselect__name"
                            type="text"
                            dir="auto"
                            autoFocus
                            maxLength={TERM_NAME_MAX_LENGTH}
                            value={renaming.text}
                            onChange={(event) =>
                              setRenaming({
                                ...renaming,
                                text: event.target.value,
                                error: null,
                              })
                            }
                            onKeyDown={onRenameKeyDown}
                            aria-invalid={control['aria-invalid']}
                            aria-describedby={control['aria-describedby']}
                            data-testid={`rename-term-input-${term.name}`}
                          />
                          <FormActions
                            submitLabel={t('canon.terms.saveName')}
                            disabled={busyId === term.id}
                            onSubmit={() => void saveRename()}
                            submitTestId={`save-term-${term.name}`}
                            onCancel={() => setRenaming(null)}
                            size="sm"
                          />
                        </div>
                      </>
                    )}
                  </Field>
                }
              />
            ) : (
              <TypeRow
                key={term.id}
                name={term.name}
                data-term-name={term.name}
                count={usage(term)}
                actions={
                  access.editContent ? (
                    <>
                      <Button
                        tone="secondary"
                        size="sm"
                        aria-label={t('canon.terms.renameAria', { name: term.name })}
                        onClick={() => setRenaming({ id: term.id, text: term.name, error: null })}
                        data-testid={`rename-term-${term.name}`}
                      >
                        {t('canon.terms.rename')}
                      </Button>
                      {term.ruleCount === 0 && term.momentCount === 0 ? (
                        <Button
                          tone="danger-quiet"
                          size="sm"
                          aria-label={t('canon.terms.deleteAria', { name: term.name })}
                          disabled={busyId === term.id}
                          onClick={() => void remove(term)}
                          data-testid={`delete-term-${term.name}`}
                        >
                          {t('canon.terms.deleteButton')}
                        </Button>
                      ) : null}
                    </>
                  ) : null
                }
              />
            ),
          )}
        </ul>
      )}
    </div>
  )
}
