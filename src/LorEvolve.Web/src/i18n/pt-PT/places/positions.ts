import type { Dictionary } from '../../en'

const placesPositions: Dictionary['places']['positions'] = {
  grandparents: {
    one: 'Avô ou avó',
    many: 'Avós',
  },
  parents: {
    one: 'Progenitor',
    many: 'Progenitores',
  },
  siblings: {
    one: 'Irmão ou irmã',
    many: 'Irmãos',
  },
  children: {
    one: 'Filho ou filha',
    many: 'Filhos',
  },
  grandchildren: {
    one: 'Neto ou neta',
    many: 'Netos',
  },
  auntsUncles: {
    one: 'Tio ou tia',
    many: 'Tios',
  },
  cousins: {
    one: 'Primo ou prima',
    many: 'Primos',
  },
  niecesNephews: {
    one: 'Sobrinho ou sobrinha',
    many: 'Sobrinhos',
  },
}

export default placesPositions
