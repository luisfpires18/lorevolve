import type { Dictionary } from './en'

/**
 * European Portuguese (ADR 0071). Same keys as `en.ts`; `satisfies` fails the typecheck on a missing or unknown key.
 * Portugal's forms only: utilizador, ecrã, ficheiro, guardar, eliminar.
 */
const ptPT = {
  language: {
    label: 'Idioma',
  },
} satisfies Dictionary

export default ptPT
