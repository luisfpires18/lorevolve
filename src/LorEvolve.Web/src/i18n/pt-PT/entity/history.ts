import type { Dictionary } from '../../en'

const entityHistory: Dictionary['entity']['history'] = {
  created: 'Criação',
  firstVersion: 'Primeira versão registada',
  changedNothing: 'Alteração',
  changedOne: 'Alteração: {last}',
  changedMany: 'Alteração: {list} e {last}',
  change: {
    name: 'nome',
    summary: 'resumo',
    article: 'artigo',
    status: 'estado',
    type: 'tipo',
    aliases: 'outros nomes',
    tags: 'etiquetas',
    details: 'detalhes',
    image: 'imagem',
  },
  imagesNotRestored: 'As imagens não são incluídas ao restaurar uma versão.',
  openFailed: 'Não foi possível abrir essa versão.',
  restoreConfirm: {
    title: 'Repor a versão {number}?',
    message:
      'Passa a ser a versão mais recente. O artigo mantém-se como está: tem o seu próprio histórico.',
    confirm: 'Repor esta versão',
  },
  changedElsewhere:
    'Esta entrada foi alterada depois de a abrires, por isso nada foi reposto. O histórico mostra agora a versão mais recente.',
  restoreFailed: 'Não foi possível repor essa versão.',
  title: 'Histórico',
  articleNote:
    'Versões dos detalhes desta entrada. O artigo mantém o seu próprio histórico, na vista Artigo.',
  readFailed: 'Não foi possível ler o histórico desta entrada.',
  retry: 'Tentar de novo',
  empty: 'Ainda nada registado. A próxima vez que guardares, começa o histórico desta entrada.',
  nowShowing: 'a mostrar',
  version: 'Versão {number}',
  restoredVersion: 'versão {number} restaurada',
  hide: 'Ocultar',
  view: 'Ver',
  restoring: 'A restaurar…',
  restore: 'Restaurar',
  opening: 'A abrir…',
  alsoKnownAs: 'também conhecida como {names}',
  articleThen: 'O artigo como estava nessa altura. Restaurar esta versão deixa o artigo como está.',
}

export default entityHistory
