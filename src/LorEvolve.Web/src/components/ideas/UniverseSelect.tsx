import type { ReactNode } from 'react'
import { Field, type SelectField } from '../Field'
import { useI18n } from '../../i18n'
import type { TextKey } from '../../i18n/core'
import type { Dictionary } from '../../i18n/en'
import type { UniverseSummary } from '../../universes/types'

/**
 * A select of universes: the leading options (`children`: All, No universe), then the option for a chosen universe
 * the list does not have (`stray`), then each universe, archived ones named by `archivedKey`. Every other prop is the
 * `Field` select's. Catalogue: `docs/design/ui-components.md`.
 */
export function UniverseSelect({
  universes,
  archivedKey,
  stray,
  children,
  ...field
}: Omit<SelectField, 'as' | 'children'> & {
  universes: UniverseSummary[] | null
  /** Says `{name}` with its archived mark. */
  archivedKey: TextKey<Dictionary>
  /** Shown only while `universes` lacks its id. */
  stray?: { id: string; label: ReactNode } | null
  children?: ReactNode
}) {
  const { t } = useI18n()
  return (
    <Field as="select" {...field}>
      {children}
      {stray && !universes?.some((one) => one.id === stray.id) ? (
        <option value={stray.id}>{stray.label}</option>
      ) : null}
      {(universes ?? []).map((one) => (
        <option key={one.id} value={one.id}>
          {one.isArchived ? t(archivedKey, { name: one.name }) : one.name}
        </option>
      ))}
    </Field>
  )
}
