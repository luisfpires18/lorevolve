import type { Dictionary } from '../../en'

const projectsEntries: Dictionary['projects']['entries'] = {
  searchPlaceholder: 'Pesquisar por nome',
  failed: 'Não foi possível ler os registos deste projeto.',
  needsType: 'Crie primeiro um tipo.',
  needsTypeHint: 'Um registo é de um tipo, por isso este projeto precisa de ter pelo menos um.',
  delete: 'Apagar',
  deleting: 'A apagar…',
  deleteFailed: 'Não foi possível apagar este registo.',
  trash: {
    title: 'Apagar “{name}”?',
    message: 'Fica apagado para sempre e não pode ser restaurado.',
  },
  canon: 'No Lore: {name}',
}

export default projectsEntries
