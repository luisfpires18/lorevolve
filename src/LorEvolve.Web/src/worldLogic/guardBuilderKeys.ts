import { t } from '../i18n'
import type { Problem } from './guard'

export const g = 'canon.worldLogic.systems.machine.guardBuilder'

/** A message under `guardBuilder`, for keys built from the schema's own words. */
export function tg(key: string, vars?: Record<string, string | number>) {
  return t(`${g}.${key}` as never, vars)
}

export type Side = 'left' | 'right' | 'from' | 'to'

export interface Context {
  problemsAt: (key: string) => Problem[]
  titleOf: (ruleId: string) => string | undefined
}

export const select = 'field__input field__input--select'
