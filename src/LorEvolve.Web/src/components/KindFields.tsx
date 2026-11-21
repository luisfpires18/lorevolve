import type { ReactNode } from 'react'
import { CheckField } from './CheckField'
import { Field } from './Field'
import { QuietNote } from './QuietNote'

/** What a relation kind is called: its name, its other side's name, and whether it reads the same both ways. */
export interface KindNames {
  name: string
  inverseName: string
  isSymmetric: boolean
}

/**
 * The naming fields of a relation kind: how it reads, how it reads from the other side, and the both-ways check. A
 * symmetric kind swaps the other side's field for `bothWays`, a note saying it reads the same either way. `idPrefix`
 * names the fields and the check's test id (`<idPrefix>-symmetric`); `fieldTestIds` also marks `-name`, `-inverse` and
 * `-both-ways`. `words` are the screen's own labels. Used by the Family Tree's kind dialog and the Types screen's kind form. Catalogue:
 * docs/design/ui-components.md.
 */
export function KindFields({
  draft,
  edit,
  fieldErrors,
  idPrefix,
  words,
  bothWays,
  bothWaysSpacing,
  fieldTestIds = false,
}: {
  draft: KindNames
  edit: (change: Partial<KindNames>) => void
  fieldErrors: Record<string, string>
  idPrefix: string
  words: {
    name: string
    namePlaceholder: string
    inverse: string
    inversePlaceholder: string
    symmetric: string
  }
  bothWays: ReactNode
  bothWaysSpacing: 'block' | 'hint'
  fieldTestIds?: boolean
}) {
  const testId = (part: string) => (fieldTestIds ? `${idPrefix}-${part}` : undefined)
  return (
    <>
      <Field
        label={words.name}
        name={`${idPrefix}-name`}
        placeholder={words.namePlaceholder}
        dir="auto"
        value={draft.name}
        onChange={(event) => edit({ name: event.target.value })}
        error={fieldErrors.name}
        data-testid={testId('name')}
      />

      {draft.isSymmetric ? (
        <QuietNote spacing={bothWaysSpacing} testId={testId('both-ways')}>
          {bothWays}
        </QuietNote>
      ) : (
        <Field
          label={words.inverse}
          name={`${idPrefix}-inverse`}
          placeholder={words.inversePlaceholder}
          dir="auto"
          value={draft.inverseName}
          onChange={(event) => edit({ inverseName: event.target.value })}
          error={fieldErrors.inversename}
          data-testid={testId('inverse')}
        />
      )}

      <CheckField
        className="field--flow"
        label={words.symmetric}
        checked={draft.isSymmetric}
        onChange={(isSymmetric) => edit({ isSymmetric })}
        testId={`${idPrefix}-symmetric`}
      />
    </>
  )
}
