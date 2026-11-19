import type { Dictionary } from '../../en'

const placesDiscovery: Dictionary['places']['discovery'] = {
  searchLabel: 'Pesquisar famílias por membro',
  searchPlaceholder: 'Qualquer nome da família',
  find: 'Encontrar uma personagem',
  noneTitle: 'Ainda não há famílias registadas.',
  noneHintEditor:
    'Uma família aparece aqui quando duas pessoas estão ligadas por um tipo com significado familiar. Escolhe alguém para registar a primeira ligação dessa pessoa.',
  noneHint:
    'Uma família aparece aqui quando duas pessoas estão ligadas por um tipo com significado familiar.',
  whose: 'De quem é a família?',
  pickerPlaceholder: 'Pesquisar neste universo',
  pickerHint: 'Abre a árvore de qualquer pessoa, mesmo sem família registada.',
  heading: 'Famílias neste universo',
  noMatch: 'Nenhuma família tem um membro com esse nome.',
  matches: {
    one: '{n} família inclui “{q}”.',
    other: '{n} famílias incluem “{q}”.',
  },
  count: {
    one: '{n} família',
    other: '{n} famílias',
  },
  finding: 'A procurar famílias…',
  error: 'Não foi possível ler as famílias.',
  retry: 'Tentar novamente',
  members: {
    one: '{n} membro',
    other: '{n} membros',
  },
}

export default placesDiscovery
