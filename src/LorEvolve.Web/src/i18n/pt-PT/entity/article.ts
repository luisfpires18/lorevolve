import type { Dictionary } from '../../en'

const entityArticle: Dictionary['entity']['article'] = {
  leaveGuard: 'O artigo de “{name}” tem alterações por guardar. Sair sem as guardar?',
  gone: 'Esta entrada já não está aqui, por isso não foi possível guardar o artigo. Pode ter sido movida para a Reciclagem noutra janela. O teu texto continua aqui: copia-o antes de saíres.',
  saveFailed: 'Não foi possível guardar o artigo. O teu texto continua aqui. Tenta de novo.',
  discardConfirm: 'Fechar o artigo sem guardar as tuas alterações?',
  announce: {
    keptMine: 'As tuas alterações continuam por guardar. Guarda quando quiseres.',
    recovered: 'O rascunho recuperado está no editor. Ainda não foi guardado.',
    discarded: 'O rascunho recuperado foi descartado. O artigo guardado não mudou.',
  },
  status: {
    saving: 'A guardar…',
    unsaved: 'Alterações por guardar',
    empty: 'Ainda nada guardado',
    saved: 'Guardado',
  },
  note: {
    entryOpen: 'Guarda ou cancela primeiro as alterações a esta entrada e depois edita o artigo.',
    draftOffered: 'Recupera ou descarta primeiro o rascunho recuperado e depois edita o artigo.',
  },
  title: 'Artigo',
  edit: 'Editar artigo',
  opening: 'A abrir o artigo…',
  missing: 'Esta entrada não está aqui, nem o seu artigo.',
  openFailed: 'Não foi possível abrir o artigo.',
  retry: 'Tentar de novo',
  recoveredWhat: 'este artigo',
  draftBlank: 'Sem texto neste rascunho.',
  empty: {
    line: 'Ainda sem artigo.',
    hint: 'Tudo o que vale a pena contar sobre {name} para além dos seus factos pertence aqui.',
    write: 'Escrever o artigo',
  },
  conflictWhat: 'artigo',
  latestLabel: 'Último artigo guardado',
  latestBlank: 'Sem texto na versão mais recente.',
  tooLong:
    'Este artigo é demasiado longo para guardar. Encurta-o ou passa parte dele para outra entrada.',
  recoveryWarning:
    'Este dispositivo não conseguiu manter uma cópia de recuperação destas alterações. Guarda para as manter.',
  save: 'Guardar',
  saving: 'A guardar…',
}

export default entityArticle
