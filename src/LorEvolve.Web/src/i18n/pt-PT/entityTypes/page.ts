import type { Dictionary } from '../../en'

const entityTypesPage: Dictionary['entityTypes']['page'] = {
  tabs: {
    lore: 'Tipos de lore',
    groups: 'Grupos',
    relations: 'Tipos de relação',
    events: 'Tipos e métodos de acontecimento',
  },
  ledes: {
    lore: 'Cada entrada é de um destes tipos. Cria os teus, aninha um dentro de outro para organizar o lore e dá a cada um os campos de que este mundo realmente precisa.',
    groups:
      'Tipos reunidos pelo que são, na tua prioridade: a ordem em que uma cena lista o seu lore.',
    relations:
      'Como as entradas se ligam: as duas leituras de cada tipo, as suas restrições de Cânone e o seu significado familiar.',
    events:
      'Os tipos e métodos de acontecimento que um acontecimento e a verificação de uma regra do mundo podem indicar.',
    gaming: 'Tipos de {game}. Pertencem só a este jogo.',
    templates:
      'Os modelos pertencem a este universo. Alterar ou apagar um nunca muda os tipos dos teus jogos.',
  },
  context: { label: 'Tipos de', lore: 'Lore', gaming: 'Jogos', templates: 'Modelos' },
  templates: {
    new: 'Novo modelo',
    eyebrow: 'Modelo',
    nameHint: 'Os jogos que já usaram este modelo ficam com a sua própria cópia.',
    chip: 'Modelo do universo',
    empty: 'Ainda não há modelos.',
    emptyHint:
      'Um modelo é um tipo que podes reutilizar em vários jogos. Cria um, dá-lhe campos e copia-o para um jogo quando precisares.',
    emptyHintViewer: 'Este universo ainda não tem modelos.',
    delete: 'Apagar modelo',
    deleteTitle: 'Apagar este modelo?',
    deleteMessage: 'Os tipos de jogo já criados a partir dele ficam como estão.',
    deleteConfirm: 'Apagar modelo',
    editField: 'Editar campo',
    loadFailed: 'Não foi possível carregar os modelos.',
    actionFailed: 'Não foi possível guardar essa alteração.',
  },
  game: { label: 'Jogo', loading: 'A carregar jogos…' },
  loadFailed: 'Não foi possível carregar os tipos.',
  movedToPlace: 'Tipo “{name}” movido para o lugar {place} de {total}.',
  moveFailed: 'Não foi possível mover esse tipo.',
  lifted:
    'Tipo “{name}” levantado, no lugar {place} de {total} entre os tipos do mesmo nível. As setas para cima e para baixo movem-no, Espaço larga-o, Escape devolve-o ao lugar.',
  stays: '“{name}” fica no lugar {place} de {total} entre os tipos do mesmo nível.',
  carriedAt: '“{name}”: lugar {place} de {total} entre os tipos do mesmo nível.',
  putBack:
    'Devolvido ao lugar. “{name}” fica no lugar {place} de {total} entre os tipos do mesmo nível.',
  putBackWhereItWas: 'Devolvido ao lugar. “{name}” fica onde estava.',
  movedUp: 'Tipo “{name}” movido para cima.',
  movedDown: 'Tipo “{name}” movido para baixo.',
  deleteTitle: 'Eliminar o tipo “{name}”?',
  deleteMessage: 'Nenhuma entrada o usa. Não é possível desfazer.',
  deleteConfirm: 'Eliminar tipo',
  deleted: 'Tipo “{name}” eliminado.',
  deleteFailed: 'Não foi possível eliminar esse tipo.',
  title: 'Tipos',
  newType: 'Novo tipo',
  createdInside: 'Tipo “{name}” criado dentro de “{parent}”.',
  created: 'Tipo “{name}” criado.',
  saved: 'Tipo “{name}” guardado.',
  retry: 'Tentar de novo',
  reading: 'A ler os tipos…',
  dnd: {
    instructions:
      'Prime Espaço ou Enter para levantar este tipo, as setas para cima e para baixo para o mover entre os tipos do mesmo nível, e Espaço ou Enter outra vez para o largar, ou Escape para o devolver ao lugar. Nunca passa para outro tipo-pai.',
    pickedUp: 'Tipo levantado: {name}.',
    aType: 'um tipo',
    dropped: 'Tipo largado: {name}.',
    theType: 'o tipo',
    putBack: 'Tipo devolvido ao lugar: {name}.',
  },
  inside: ', dentro de {path}',
  groupSuffix: '(grupo)',
  count: {
    one: '{n} entrada',
    other: '{n} entradas',
  },
  trashedOne: ', na Reciclagem',
  trashedAll: ', todas na Reciclagem',
  trashedSome: ', {n} na Reciclagem',
  orderOf: 'Ordem de {name}',
  moveUpLabel: 'Mover {name} para cima',
  moveDownLabel: 'Mover {name} para baixo',
  alreadyFirst: 'Já é o primeiro entre os tipos do mesmo nível',
  alreadyLast: 'Já é o último entre os tipos do mesmo nível',
  up: 'Subir',
  down: 'Descer',
  addChildLabel: 'Adicionar subtipo dentro de {name}',
  addChild: 'Adicionar subtipo',
  editLabel: 'Editar {name}',
  edit: 'Editar',
  fieldsLabel: 'Campos de {name}',
  fields: 'Campos',
  moreActions: 'Mais ações para {name}',
  addChildType: 'Adicionar subtipo',
  moveUp: 'Mover para cima',
  moveDown: 'Mover para baixo',
  deleteType: 'Eliminar tipo',
  showEntries: 'Mostrar as suas entradas no Lore',
  openTrash: 'Abrir a Reciclagem',
  nested: {
    one: '+ {n} tipo aninhado',
    other: '+ {n} tipos aninhados',
  },
  targetedNone:
    '{name} não pode ser eliminado porque o campo “{field}” de {owner} só pode ligar a este tipo. Altera primeiro esses campos para permitirem outro tipo.',
  targetedNoneArchived:
    '{name} não pode ser eliminado porque o campo “{field}” (arquivado) de {owner} só pode ligar a este tipo. Altera primeiro esses campos para permitirem outro tipo.',
  targetedOthers: {
    one: '{name} não pode ser eliminado porque o campo “{field}” de {owner} e mais 1 campo só podem ligar a este tipo. Altera primeiro esses campos para permitirem outro tipo.',
    other:
      '{name} não pode ser eliminado porque o campo “{field}” de {owner} e mais {n} campos só podem ligar a este tipo. Altera primeiro esses campos para permitirem outro tipo.',
  },
  targetedOthersArchived: {
    one: '{name} não pode ser eliminado porque o campo “{field}” (arquivado) de {owner} e mais 1 campo só podem ligar a este tipo. Altera primeiro esses campos para permitirem outro tipo.',
    other:
      '{name} não pode ser eliminado porque o campo “{field}” (arquivado) de {owner} e mais {n} campos só podem ligar a este tipo. Altera primeiro esses campos para permitirem outro tipo.',
  },
  inUse: {
    onlyNested: {
      one: '{name} não pode ser eliminado porque ainda contém 1 tipo aninhado. Move ou elimina primeiro esse tipo.',
      other:
        '{name} não pode ser eliminado porque ainda contém {n} tipos aninhados. Move ou elimina primeiro esses tipos.',
    },
    nested: {
      one: '{n} tipo aninhado',
      other: '{n} tipos aninhados',
    },
    reasonNone: {
      one: '{name} não pode ser eliminado porque 1 entrada ainda o usa.',
      other: '{name} não pode ser eliminado porque {n} entradas ainda o usam.',
    },
    reasonAll: {
      one: '{name} não pode ser eliminado porque 1 entrada ainda o usa, e está na Reciclagem.',
      other: '{name} não pode ser eliminado porque {n} entradas ainda o usam, todas na Reciclagem.',
    },
    reasonSome: {
      other:
        '{name} não pode ser eliminado porque {n} entradas ainda o usam, {trashed} delas na Reciclagem.',
    },
    reasonNestedNone: {
      one: '{name} não pode ser eliminado porque 1 entrada ainda o usa e o tipo ainda contém {nested}.',
      other:
        '{name} não pode ser eliminado porque {n} entradas ainda o usam e o tipo ainda contém {nested}.',
    },
    reasonNestedAll: {
      one: '{name} não pode ser eliminado porque 1 entrada ainda o usa (e está na Reciclagem) e o tipo ainda contém {nested}.',
      other:
        '{name} não pode ser eliminado porque {n} entradas ainda o usam (todas na Reciclagem) e o tipo ainda contém {nested}.',
    },
    reasonNestedSome: {
      other:
        '{name} não pode ser eliminado porque {n} entradas ainda o usam ({trashed} delas na Reciclagem) e o tipo ainda contém {nested}.',
    },
    fixOne: 'Move-a primeiro para outro tipo.',
    fixOneTrashed: 'Restaura-a da Reciclagem e depois move-a para outro tipo.',
    fixMany: 'Move-as primeiro para outro tipo.',
    fixManyTrashed:
      'Move-as primeiro para outro tipo; uma entrada na Reciclagem tem de ser restaurada antes de poder ser movida.',
    tail: {
      one: 'Move ou elimina também esse tipo.',
      other: 'Move ou elimina também esses tipos.',
    },
  },
  dialog: {
    leaveEdit: 'As tuas alterações a “{name}” não foram guardadas. Sair sem as guardar?',
    leaveNew: 'Este tipo não foi criado. Sair sem o guardar?',
    nameRequired: 'Dá um nome ao tipo.',
    detailsSave: 'Alguns detalhes precisam de uma alteração antes de isto poder ser guardado.',
    detailsCreate: 'Alguns detalhes precisam de uma alteração antes de isto poder ser criado.',
    saveFailed: 'Não foi possível guardar esse tipo.',
    createFailed: 'Não foi possível criar esse tipo.',
    eyebrow: 'Tipos de lore',
    editTitle: 'Editar tipo',
    newChildTitle: 'Novo subtipo',
    newTitle: 'Novo tipo',
    inside: 'Dentro de {name}',
    identity: 'Identidade',
    name: 'Nome',
    namePlaceholder: 'Insere um nome',
    iconHint:
      'Opcional, e apenas uma imagem: marca o tipo no filtro do Lore. Nada é escolhido por ti a partir do nome.',
    hierarchy: 'Hierarquia',
    parent: 'Tipo-pai',
    parentNone: 'Nenhum (um tipo de topo)',
    parentHint:
      'Organiza o Lore: escolher aí um tipo mostra também as entradas dos tipos que estão dentro dele. Um tipo aninhado herda os campos de todos os tipos acima dele; cada campo é editado no seu próprio tipo.',
    behaviour: 'Comportamento',
    familyLabel: 'Árvore genealógica',
    familyText: 'As entradas deste tipo podem aparecer na árvore genealógica',
    saving: 'A guardar…',
    saveChanges: 'Guardar',
    creating: 'A adicionar…',
    create: 'Adicionar tipo',
    cancel: 'Cancelar',
  },
}

export default entityTypesPage
