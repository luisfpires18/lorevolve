import type { Dictionary } from '../../en'

const timePeriods: Dictionary['time']['periods'] = {
  title: 'Calendário',
  lede: 'Escolhe como as datas são escritas e ordenadas neste universo.',
  heading: 'Períodos de datas',
  add: 'Adicionar período de datas',
  and: ' e ',
  counts: {
    moments: { one: '{n} acontecimento', other: '{n} acontecimentos' },
    years: { one: '{n} ano numa entrada', other: '{n} anos em entradas' },
    scenes: { one: '{n} cena', other: '{n} cenas' },
    entryEras: { one: '{n} era de uma entrada', other: '{n} eras de entradas' },
    periods: { one: '{n} período de relação', other: '{n} períodos de relação' },
    timelineMoments: {
      one: '{n} acontecimento da linha do tempo',
      other: '{n} acontecimentos da linha do tempo',
    },
    birthDeathYears: {
      one: '{n} ano de nascimento ou de morte',
      other: '{n} anos de nascimento ou de morte',
    },
  },
  usage: 'Datas em {list}',
  up: 'Crescente desde 1',
  down: 'Decrescente até 1',
  leaveGuard: 'O calendário tem alterações por guardar. Sair sem as guardar?',
  moved: '{name} está agora na posição {position} de {total}.',
  newCap: 'Novo período de datas',
  newLower: 'novo período de datas',
  discardConfirm: 'Descartar as alterações ao calendário?',
  needChange: 'Alguns períodos de datas precisam de uma alteração antes de se poder guardar.',
  saveFailed: 'Não foi possível guardar o calendário.',
  empty: {
    saveToGoBack: 'Guarda para voltar aos anos numerados simples.',
    plain: 'Este universo usa anos numerados simples.',
    hint: 'Adiciona períodos de datas se a linha do tempo tiver intervalos de tempo com nome e numeração de anos própria, como Eras, reinados, dinastias, ou o antes e o depois de um acontecimento. São opcionais.',
  },
  note: 'Cada data neste universo indica um destes períodos. Seguem a ordem da lista, do primeiro ao último, e nenhum tem duração definida. Remove-os todos para voltares aos anos numerados simples.',
  unplaced: {
    lead: {
      one: '{n} data existente ainda não tem período de datas',
      other: '{n} datas existentes ainda não têm período de datas',
    },
    rest: {
      one: '({list}). Continua guardada. O LorEvolve não adivinha a que período pertence, por isso, até lhe ser atribuído um, fica à parte na linha do tempo e a Integridade do Cânone não a compara.',
      other:
        '({list}). Continuam guardadas. O LorEvolve não adivinha a que período pertencem, por isso, até lhes ser atribuído um, ficam à parte na linha do tempo e a Integridade do Cânone não as compara.',
    },
  },
  plainYear: {
    lead: {
      one: '{n} data existente está escrita como um ano simples',
      other: '{n} datas existentes estão escritas como um ano simples',
    },
    rest: {
      one: '({list}). Depois de guardares, continua guardada, mas o LorEvolve não adivinha a que período pertence: fica à parte na linha do tempo até lhe ser atribuído um.',
      other:
        '({list}). Depois de guardares, continuam guardadas, mas o LorEvolve não adivinha a que período pertencem: ficam à parte na linha do tempo até lhes ser atribuído um.',
    },
  },
  openTimeline: 'Abrir a linha do tempo',
  earliestFirst: 'Do primeiro ao último',
  labelDefault: 'Etiqueta',
  name: 'Nome',
  shortLabel: 'Etiqueta curta (opcional)',
  abbreviationHint: 'Sem ela, as datas são escritas com o nome completo.',
  yearsCount: 'Os anos contam-se',
  countDown: {
    spoken: 'Contagem decrescente: 3, 2, 1. ',
    text: 'O ano 1 é o último antes do período seguinte.',
  },
  countUp: {
    spoken: 'Contagem crescente: 1, 2, 3. ',
    text: 'Sem fim definido.',
  },
  writeAs: 'Escrever as datas como',
  nothingDated: 'Ainda nada datado nele',
  notSaved: 'Novo, ainda não guardado',
  inUseTitle: 'Em uso. Move primeiro as datas dele para outro período.',
  removeNamed: 'Eliminar {name}',
  remove: 'Eliminar',
  inUseHidden: 'Em uso. Move as datas dele para outro período de datas antes de o remover.',
  save: 'Guardar',
  saved: 'Guardado',
}

export default timePeriods
