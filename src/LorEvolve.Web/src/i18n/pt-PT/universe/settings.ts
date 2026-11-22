import type { Dictionary } from '../../en'

const universeSettings: Dictionary['universe']['settings'] = {
  tabs: {
    general: 'Geral',
    appearance: 'Aparência',
    collaborators: 'Colaboradores',
    data: 'Dados',
    advanced: 'Avançadas',
  },
  exportFailed: 'Não foi possível preparar esse ficheiro.',
  changeFailed: 'Não foi possível alterar isso.',
  deleteFailed: 'Não foi possível eliminar isso.',
  title: 'Definições',
  lede: 'O nome, a cor, os colaboradores, as cópias de segurança e o arquivo deste universo.',
  tabsLabel: 'Definições',
  details: 'Detalhes',
  detailsSaved: 'Guardado.',
  detailsSave: 'Guardar',
  detailsSaving: 'A guardar…',
  colour: 'Cor',
  colourNote:
    'O modo claro ou escuro é escolhido para todo o LorEvolve no menu da tua conta, não por universo.',
  colourSaved: 'Guardada.',
  colourSave: 'Guardar',
  colourSaving: 'A guardar…',
  backup: 'Cópia de segurança',
  backupNote:
    'Um único ficheiro deste universo que o LorEvolve consegue restaurar: o lore, os tipos e campos, os artigos, as relações, a linha do tempo, as histórias e cenas, os mapas, as regras do mundo, as ideias, as tuas notas privadas, a reciclagem, as versões guardadas e todas as imagens tal como as carregaste. Sem dados da conta, colaboradores ou comentários, e sem indicar se é público: um universo restaurado é sempre privado.',
  backupPreparing: 'A preparar a cópia de segurança…',
  backupDownload: 'Transferir cópia de segurança',
  readableNote:
    'Uma exportação legível é o mesmo universo em páginas Markdown, uma por entrada, história, cena e mapa, com as imagens ao lado, para ler em qualquer editor ou guardar. Não inclui a reciclagem nem as versões guardadas, e o LorEvolve não consegue restaurar a partir dela.',
  readablePreparing: 'A preparar a exportação…',
  readableDownload: 'Transferir exportação legível',
  exportSaved: 'Guardado como {name}.',
  restore: 'Restaurar',
  restoreNote:
    'Uma cópia de segurança é restaurada como um novo universo ao lado deste, nunca por cima dele.',
  restoreLink: 'Restaurar uma cópia de segurança',
  restoreHeading: 'Restaurar',
  archiveHeading: 'Arquivo',
  archivedNote: 'Este universo está arquivado. Restaurá-lo devolve-o à tua lista de ativos.',
  archiveNote:
    'Arquivar guarda tudo e tira o universo da tua lista de ativos. Não altera se o universo é público.',
  stillPublic:
    '{still} Arquivar não tira um universo do portal público. {link} para remover a sua página pública.',
  stillPublicLead: 'Continua público.',
  stillPublicLink: 'Torna-o privado em Publicação',
  archiveConfirmPublic: 'Arquivar {name}? Continua público.',
  archiveConfirm: 'Arquivar {name}?',
  archiveConfirmPublicNote:
    'Arquivar apenas o tira da tua lista de ativos. A página pública, o lugar em Explorar e tudo o que publicaste nele continuam disponíveis para qualquer pessoa até o tornares privado em Publicação.',
  archiveConfirmUnknownNote:
    'O LorEvolve não conseguiu verificar se este universo é público. Arquivar nunca altera isso: se for público, continua público até o tornares privado em Publicação.',
  archiving: 'A arquivar…',
  archiveKeepPublic: 'Arquivar, manter público',
  archiveConfirmButton: 'Arquivar universo',
  makePrivateFirst: 'Torna-o privado primeiro',
  restoreUniverse: 'Restaurar universo',
  archiveUniverse: 'Arquivar universo',
  deleteHeading: 'Eliminar universo',
  deleteNote:
    'Eliminar remove este universo e tudo o que ele contém, para sempre. Não há como desfazer, nem reciclagem para ele.',
  deleteNotePublic:
    'Eliminar remove este universo e tudo o que ele contém, para sempre. Não há como desfazer, nem reciclagem para ele. A página pública desaparece com ele.',
  deleteIdeasNote:
    'As tuas ideias sobre ele são mantidas: pertencem à tua conta, por isso ficam em Ideias sem universo, e só se perdem as referências ao conteúdo deste universo.',
  deleteConfirm: 'Eliminar {name} para sempre?',
  deleteConfirmButton: 'Eliminar para sempre',
  deleteKeep: 'Manter',
  deleteButton: 'Eliminar universo…',
  deleteNeedsArchive: 'Para eliminar este universo, arquiva-o primeiro.',
}

export default universeSettings
