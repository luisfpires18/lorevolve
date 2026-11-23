import type { Dictionary } from '../../en'

const projectsEntries: Dictionary['projects']['entries'] = {
  searchPlaceholder: 'Pesquisar por nome',
  failed: 'Não foi possível ler os registos deste projeto.',
  needsType: 'Crie primeiro um tipo.',
  needsTypeHint: 'Um registo é de um tipo, por isso este projeto precisa de ter pelo menos um.',
  canon: 'No Lore: {name}',
  import: {
    action: 'Importar entidade do Lore',
    title:
      'Copia os valores de uma entidade do Lore para este registo. A entidade do Lore não é alterada.',
    eyebrow: 'Do Lore',
    search: 'Procurar uma entidade do Lore pelo nome',
    looking: 'A procurar…',
    searchFailed: 'Não foi possível pesquisar o Lore.',
    emptyNamed: 'Nenhuma entidade do Lore tem esse nome.',
    emptyNone: 'O Lore ainda não tem entidades.',
    add: 'Importar',
    failed: 'Não foi possível importar esta entidade do Lore.',
    skipped: 'Importado de {name}. Não importado: {fields}.',
  },
}

export default projectsEntries
