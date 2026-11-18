import type { Dictionary } from '../../en'

const loreMassCreate: Dictionary['lore']['massCreate'] = {
  paste: {
    shapes:
      'Cola um nome por linha, ou três colunas separadas por tabulações, pela ordem Tipo, Nome, Estado.',
    twoColumns:
      'A linha {line} tem duas colunas, que podem ser lidas de mais do que uma forma. {shapes}',
    columnCount: 'A linha {line} tem {columns}. {shapes}',
    columnMismatch: 'A linha {line} tem {columns} mas a linha {first} tem {firstColumns}. {shapes}',
    columns: { one: 'uma coluna', other: '{n} colunas' },
  },
  problem: {
    nameRequired: 'O nome é obrigatório.',
    nameTooLong: 'Mantém o nome abaixo de {max} carateres.',
    unknownType: 'Tipo {subject} desconhecido. Escolhe um dos tipos deste universo.',
    chooseType: 'Escolhe um tipo.',
    typeRequiredFields:
      'O tipo {subject} tem campos obrigatórios. Cria esta entrada individualmente.',
    unknownStatus: 'Estado {subject} desconhecido. Usa Ideia, Rascunho ou Cânone.',
    chooseStatus: 'Escolhe um estado.',
  },
  addRow: 'Adicionar linha',
  addToList: 'Adicionar à lista',
  added: { one: '1 linha adicionada.', other: '{n} linhas adicionadas.' },
  allBlank: 'Todas as linhas estavam em branco, por isso nada foi adicionado.',
  allRequired:
    'Todos os tipos deste universo têm campos obrigatórios, por isso as suas entradas são criadas uma a uma.',
  applied: {
    one: 'Valores predefinidos aplicados a 1 linha.',
    other: 'Valores predefinidos aplicados a {n} linhas.',
  },
  applyAll: 'Aplicar a todas',
  cancel: 'Cancelar',
  chooseStatus: 'Escolher um estado',
  chooseType: 'Escolher um tipo',
  columnName: 'Nome',
  columnStatus: 'Estado',
  columnType: 'Tipo',
  count: '{rows} de {max}',
  create: { one: 'Criar 1 entrada', other: 'Criar {n} entradas' },
  createNone: 'Criar entradas',
  creating: { one: 'A criar 1 entrada…', other: 'A criar {n} entradas…' },
  crumb: 'Lore',
  defaultStatus: 'Estado predefinido',
  defaultType: 'Tipo predefinido',
  defaults: 'Predefinições',
  empty: 'Os nomes colados aparecem aqui para revisão antes de algo ser criado.',
  entries: { one: '1 entrada', other: '{n} entradas' },
  entriesHeading: 'Entradas',
  fixRows: 'Corrige as linhas assinaladas abaixo e volta a criá-las.',
  hasRequired: '{label} (tem campos obrigatórios)',
  leavePaste: 'O texto colado não foi adicionado. Sair sem ele?',
  leaveRows: {
    one: '1 entrada não foi criada. Sair sem a criar?',
    other: '{n} entradas não foram criadas. Sair sem as criar?',
  },
  lede: 'Cria já as entradas básicas. Acrescenta artigos, imagens, campos e relações mais tarde.',
  limit: 'A criação em massa aceita até {max} de cada vez.',
  noTypes: 'Este universo ainda não tem tipos. Adiciona um em Tipos e volta aqui.',
  nothingCreated: 'Nada foi criado. {reason}',
  nothingCreatedKept: 'Nada foi criado. {reason} As tuas linhas continuam aqui.',
  pasteHint:
    'As linhas em branco são ignoradas. A partir de uma folha de cálculo, copia três colunas pela ordem Tipo, Nome, Estado.',
  header: {
    type: 'Tipo',
    name: 'Nome',
    status: 'Estado',
  },
  pasteLabel: 'Cola nomes, um por linha',
  readingTypes: 'A ler os tipos deste universo…',
  removeRow: 'Remover linha {number}',
  removeRowNamed: 'Remover linha {number}: {name}',
  removeRowTitle: 'Remover linha',
  removed: 'Linha {number} removida.',
  repeat: 'Mesmo tipo e nome que a linha {row}. Será criada duas vezes.',
  retry: 'Tentar novamente',
  rowName: 'Nome da linha {number}',
  rowStatus: 'Estado da linha {number}',
  rowType: 'Tipo da linha {number}',
  startingBlocked:
    '{name} tem campos obrigatórios, por isso as suas entradas são criadas uma a uma.',
  statusFix: {
    one: '1 linha precisa de correção. Nada é criado até todas as linhas estarem prontas.',
    other: '{n} linhas precisam de correção. Nada é criado até todas as linhas estarem prontas.',
  },
  statusNone: 'Ainda nada para criar.',
  statusReady: { one: '1 entrada pronta a criar.', other: '{n} entradas prontas a criar.' },
  title: 'Criação em massa',
  tooMany:
    'Esse texto colado tem {entries}. A criação em massa aceita até {max} de cada vez, por isso divide a lista e adiciona-a por partes.',
  tooManyRoom:
    'Esse texto colado tem {entries}, e a lista tem espaço para mais {room}. A criação em massa aceita até {max} de cada vez, por isso divide a lista e adiciona-a por partes.',
  tryAgain: 'Tenta novamente.',
  typesFailed: 'Não foi possível ler os tipos deste universo.',
  unknown: 'Desconhecido: {text}',
}

export default loreMassCreate
