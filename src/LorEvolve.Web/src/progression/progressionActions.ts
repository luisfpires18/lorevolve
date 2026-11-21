import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import { isChangedElsewhere } from '../lib/editConflict'
import type { EntityDetail } from '../lore/types'
import {
  abilityInputOf,
  appearanceInputOf,
  eraInputOf,
  formInputOf,
  PROGRESSION_CHANGED,
  saveProgression,
} from './api'
import type { Era, Progression, ProgressionInput } from './types'
import type { SetURLSearchParams } from 'react-router-dom'
import type { useI18n } from '../i18n'
import type { useProgressionState } from './useProgressionState'
import { changed as withChanges } from '../lib/queryParams'

/** The era handlers: choosing one by the address, saving the eras, and moving or removing one. */
export function progressionActions({
  universeId,
  entry,
  t,
  params,
  setParams,
  changed,
  progression,
  busy,
  setMessage,
  setBusy,
  load,
}: ReturnType<typeof useProgressionState> & {
  universeId: string
  entry: EntityDetail
  t: ReturnType<typeof useI18n>['t']
  params: URLSearchParams
  setParams: SetURLSearchParams
  changed: (next: Progression) => void
}) {
  function choose(eraId: string | null) {
    setParams(withChanges(params, { era: eraId }, { keepPage: true }))
  }

  /** Saves the eras given; forms and abilities are sent only when `items` says so (a removal that takes references with it). */
  async function write(
    eras: Era[],
    done?: () => void,
    items?: Pick<ProgressionInput, 'forms' | 'abilities' | 'appearances'>,
  ) {
    if (!progression || busy) return
    setMessage(null)
    setBusy(true)
    try {
      changed(
        await saveProgression(universeId, entry.id, {
          eras: eras.map(eraInputOf),
          expectedVersion: progression.version,
          ...items,
        }),
      )
      done?.()
    } catch (error: unknown) {
      if (isChangedElsewhere(error, PROGRESSION_CHANGED)) {
        setMessage(t('progression.view.changedElsewhere'))
        void load()
      } else {
        setMessage(error instanceof ApiError ? error.message : t('progression.view.saveFailed'))
      }
    } finally {
      setBusy(false)
    }
  }

  function move(era: Era, by: number) {
    const eras = [...progression!.eras]
    const from = eras.findIndex((one) => one.id === era.id)
    const to = from + by
    if (to < 0 || to >= eras.length) return
    ;[eras[from], eras[to]] = [eras[to], eras[from]]
    void write(eras)
  }

  async function remove(era: Era) {
    if (
      !(await confirmAction({
        title: t('progression.view.removeStage.title', { name: era.name }),
        message: t('progression.view.removeStage.message', { name: entry.name }),
        confirmLabel: t('progression.view.removeStage.confirm'),
        variant: 'destructive',
      }))
    ) {
      return
    }
    const dropping = new Set([era.id])
    void write(
      progression!.eras.filter((one) => one.id !== era.id),
      () => choose(null),
      {
        forms: progression!.forms.map((form) => formInputOf(form, dropping)),
        abilities: progression!.abilities.map((ability) => abilityInputOf(ability, dropping)),
        appearances: progression!.appearances.map((one) => appearanceInputOf(one, dropping)),
      },
    )
  }

  return { choose, write, move, remove }
}
