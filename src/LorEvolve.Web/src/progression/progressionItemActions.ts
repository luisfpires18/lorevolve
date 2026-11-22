import { ApiError } from '../lib/api'
import { confirmAction } from '../lib/confirm'
import type { EntityDetail } from '../lore/types'
import {
  abilityInputOf,
  appearanceInputOf,
  removeAppearanceImage,
  eraInputOf,
  formInputOf,
  getProgression,
  saveProgression,
} from './api'
import type { Ability, Appearance, Form, Progression } from './types'
import type { useI18n } from '../i18n'
import type { useProgressionState } from './useProgressionState'
import type { progressionActions } from './progressionActions'

/** The form, ability and appearance handlers on the main profile: removing one, and moving one place. */
export function progressionItemActions({
  universeId,
  entry,
  t,
  tn,
  changed,
  write,
  progression,
  setProgression,
  busy,
  setMessage,
  setBusy,
  ticket,
  load,
}: ReturnType<typeof useProgressionState> & {
  universeId: string
  entry: EntityDetail
  t: ReturnType<typeof useI18n>['t']
  tn: ReturnType<typeof useI18n>['tn']
  changed: (next: Progression) => void
  write: ReturnType<typeof progressionActions>['write']
}) {
  async function removeItem(kind: 'form' | 'ability', item: Form | Ability) {
    if (
      !(await confirmAction({
        title:
          kind === 'form'
            ? t('progression.view.removeForm.title', { name: item.name })
            : t('progression.view.removeAbility.title', { name: item.name }),
        message:
          kind === 'form'
            ? t('progression.view.removeForm.message')
            : t('progression.view.removeAbility.message'),
        confirmLabel:
          kind === 'form'
            ? t('progression.view.removeForm.confirm')
            : t('progression.view.removeAbility.confirm'),
        variant: 'destructive',
      }))
    ) {
      return
    }
    const droppingForms = new Set(kind === 'form' ? [item.id] : [])
    void write(progression!.eras, undefined, {
      forms: progression!.forms
        .filter((one) => one.id !== item.id)
        .map((form) => formInputOf(form)),
      abilities: progression!.abilities
        .filter((one) => one.id !== item.id)
        .map((ability) => abilityInputOf(ability, new Set(), droppingForms)),
      appearances: progression!.appearances.map((one) =>
        appearanceInputOf(one, new Set(), droppingForms),
      ),
    })
  }

  /** A look goes with its pictures, which are deleted first, one by one - after the author agrees, since nothing keeps them. */
  async function removeAppearance(appearance: Appearance) {
    const pictures = appearance.images.length
    if (
      !(await confirmAction({
        title: t('progression.view.removeAppearance.title', { name: appearance.label }),
        message:
          pictures === 0
            ? t('progression.view.removeAppearance.messageEmpty')
            : tn('progression.view.removeAppearance.message', pictures, { n: pictures }),
        confirmLabel: t('progression.view.removeAppearance.confirm'),
        variant: 'destructive',
      }))
    ) {
      return
    }
    if (busy) return
    setMessage(null)
    setBusy(true)
    try {
      // Nothing is deleted unless the save that follows names the version these pictures were shown at.
      const latest = await getProgression(universeId, entry.id)
      if (latest.version !== progression!.version) {
        ticket.current++
        setProgression(latest)
        setMessage(t('progression.view.changedElsewhere'))
        return
      }
      for (const image of appearance.images) {
        await removeAppearanceImage(universeId, entry.id, appearance.id, image.id)
      }
      changed(
        await saveProgression(universeId, entry.id, {
          eras: latest.eras.map(eraInputOf),
          expectedVersion: latest.version,
          appearances: latest.appearances
            .filter((one) => one.id !== appearance.id)
            .map((one) => appearanceInputOf(one)),
        }),
      )
    } catch (error: unknown) {
      setMessage(
        error instanceof ApiError ? error.message : t('progression.view.removeAppearance.failed'),
      )
      void load()
    } finally {
      setBusy(false)
    }
  }

  /** Moves a form, ability or appearance one place in the author's order, saved with the rest as they are. */
  function moveItem(kind: 'form' | 'ability' | 'appearance', id: string, by: number) {
    function swapped<T extends { id: string }>(list: T[]) {
      const next = [...list]
      const from = next.findIndex((one) => one.id === id)
      const to = from + by
      if (from === -1 || to < 0 || to >= next.length) return null
      ;[next[from], next[to]] = [next[to], next[from]]
      return next
    }
    const p = progression!
    if (kind === 'form') {
      const forms = swapped(p.forms)
      if (forms) void write(p.eras, undefined, { forms: forms.map((form) => formInputOf(form)) })
    } else if (kind === 'ability') {
      const abilities = swapped(p.abilities)
      if (abilities)
        void write(p.eras, undefined, { abilities: abilities.map((one) => abilityInputOf(one)) })
    } else {
      const appearances = swapped(p.appearances)
      if (appearances)
        void write(p.eras, undefined, {
          appearances: appearances.map((one) => appearanceInputOf(one)),
        })
    }
  }

  return { removeItem, removeAppearance, moveItem }
}
