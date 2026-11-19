import type { useI18n } from '../i18n'
import { ApiError } from '../lib/api'
import { payloadKey } from '../lib/drawerGuard'
import { savePublication } from './api'
import type { GenreValue, PublicationDetails, PublicationState } from './types'
import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { attributionOf, detailsOf, type Attribution } from './publicDetailsDraft'
import { errorText } from '../lib/errorText'

/** The public details form's handlers: ticking a genre, changing the attribution, and saving. */
export function publicDetailsActions({
  universeId,
  t,
  creatorId,
  details,
  setSummary,
  setGenres,
  setAttribution,
  setSaved,
  setIsSaving,
  setSavedMessage,
  setFieldErrors,
  setMessage,
  onSaved,
}: {
  universeId: string
  t: ReturnType<typeof useI18n>['t']
  creatorId: string
  details: PublicationDetails
  setSummary: Dispatch<SetStateAction<string>>
  setGenres: Dispatch<SetStateAction<GenreValue[]>>
  setAttribution: Dispatch<SetStateAction<Attribution>>
  setSaved: Dispatch<SetStateAction<string>>
  setIsSaving: Dispatch<SetStateAction<boolean>>
  setSavedMessage: Dispatch<SetStateAction<boolean>>
  setFieldErrors: Dispatch<SetStateAction<Record<string, string>>>
  setMessage: Dispatch<SetStateAction<string | null>>
  onSaved: (next: PublicationState) => void
}) {
  function toggleGenre(value: GenreValue, chosen: boolean) {
    setSavedMessage(false)
    setGenres((current) =>
      chosen ? [...current, value] : current.filter((genre) => genre !== value),
    )
  }

  function attribute(change: Partial<Attribution>) {
    setSavedMessage(false)
    setAttribution((current) => ({ ...current, ...change }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    setFieldErrors({})
    setSavedMessage(false)

    // Said here, beside its field, before a request: the server refuses the same.
    if (details.basedOnExternalWork && !details.originalCreator) {
      setFieldErrors({
        originalcreator: t('universe.publicDetails.creatorRequired'),
      })
      document.getElementById(creatorId)?.focus()
      return
    }

    setIsSaving(true)

    try {
      const next = await savePublication(universeId, details)
      const nextAttribution = attributionOf(next)
      setSaved(
        payloadKey(
          detailsOf(
            next.publicSummary ?? '',
            String(next.category ?? ''),
            next.genres,
            nextAttribution,
          ),
        ),
      )
      setSummary(next.publicSummary ?? '')
      setAttribution(nextAttribution)
      setSavedMessage(true)
      onSaved(next)
    } catch (error: unknown) {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length > 0) {
        setFieldErrors(error.fieldErrors)
      } else {
        setMessage(errorText(error, t('universe.publicDetails.saveFailed')))
      }
    } finally {
      setIsSaving(false)
    }
  }
  return { toggleGenre, attribute, submit }
}
