import type { Dictionary } from '../../en'

const projectsEntries: Dictionary['projects']['entries'] = {
  searchPlaceholder: 'Pesquisar por nome',
  noMatch: 'Nenhuma entrada corresponde.',
  noMatchHint: 'Altere ou limpe a pesquisa para ver mais.',
  nested: 'Incluir tipos aninhados',
  title: 'Registos',
  failed: 'Não foi possível ler os registos deste projeto.',
  empty: 'Ainda não há nada deste tipo.',
  emptyHint: 'Acrescente um registo para fazer o primeiro.',
  needsType: 'Crie primeiro um tipo.',
  needsTypeHint: 'Um registo é de um tipo, por isso este projeto precisa de ter pelo menos um.',
  typeMissing: 'Este tipo não está neste projeto.',
  typeMissingHint: 'Pode ter sido apagado. Volta a todos os tipos para escolher outro.',
  ofType: 'Tipo',
  add: 'Adicionar registo',
  name: 'Nome',
  summary: 'Descrição',
  saving: 'A guardar…',
  delete: 'Apagar',
  deleting: 'A apagar…',
  deleteFailed: 'Não foi possível apagar este registo.',
  trash: {
    title: 'Apagar “{name}”?',
    message: 'Fica apagado para sempre e não pode ser restaurado.',
  },
  leaveEdited: 'Esta entrada tem alterações por guardar. Sair sem as guardar?',
  leaveNew: 'Esta entrada ainda não foi criada. Sair sem a criar?',
  canon: 'No Lore: {name}',
  values: 'Campos',
}

export default projectsEntries
