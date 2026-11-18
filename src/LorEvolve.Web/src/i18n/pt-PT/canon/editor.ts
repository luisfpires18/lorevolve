import type { Dictionary } from '../../en'

const canonEditor: Dictionary['canon']['editor'] = {
  openFailed: 'Não foi possível abrir esta regra.',
  thisRule: 'Esta regra',
  unsaved: '“{name}” tem alterações por guardar. Sair sem as guardar?',
  titleRequired: 'Dá um título à regra, para a poderes encontrar de novo.',
  saveGone:
    'Esta regra já não está aqui, por isso não pôde ser guardada. Pode ter sido movida para a Reciclagem noutra janela. O que escreveste continua aqui: copia-o antes de saíres.',
  saveInvalid: 'Algo precisa de ser alterado antes de esta regra poder ser guardada.',
  saveFailed: 'Não foi possível guardar a regra. O que escreveste continua aqui. Tenta novamente.',
  replace: {
    title: 'Substituir esta regra pela versão guardada noutro local?',
    message: 'O que alteraste aqui desde a última vez que guardaste será perdido.',
    confirm: 'Usar a versão guardada',
    cancel: 'Manter as minhas alterações',
  },
  savedLoaded: 'Está agora aberta a versão guardada da regra.',
  trash: {
    title: 'Mover “{title}” para a Reciclagem?',
    messageDirty:
      'As alterações por guardar serão perdidas. A regra, tal como foi guardada pela última vez, vai para a Reciclagem, onde a podes restaurar.',
    message: 'Podes restaurá-la a partir da Reciclagem.',
    confirm: 'Mover para a Reciclagem',
    busy: 'A mover…',
    gone: 'Esta regra já não está aqui. Pode já estar na Reciclagem.',
    failed: 'Não foi possível mover a regra para a Reciclagem. Tenta novamente.',
  },
  opening: 'A abrir a regra…',
  missing: {
    title: 'Esta regra não está aqui.',
    hint: 'Pode estar na Reciclagem, ou não ser uma regra deste universo. {trash}, ou volta a {rules}.',
    openTrash: 'Abre a Reciclagem',
    rules: 'Regras do mundo',
  },
  retry: 'Tentar novamente',
  back: 'Regras do mundo',
  newRule: 'Nova regra',
  actions: 'Mais ações para {title}',
  delete: 'Eliminar regra',
  lede: 'Uma regra de como este mundo funciona, nas tuas próprias palavras. O LorEvolve nunca as lê, e guardar não altera mais nada no universo; só é contabilizada uma verificação da cronologia dos acontecimentos que definas abaixo.',
  lastSaved: 'Guardada pela última vez {time}.',
  conflict:
    'Esta regra foi guardada noutro separador ou noutro dispositivo depois de a abrires aqui. Nada foi substituído, e a tua versão abaixo não está guardada.',
  keepMine: 'Guardar a minha por cima',
  loadSaved: 'Usar a versão guardada',
  title: 'Título',
  titlePlaceholder: 'Insere um título',
  description: 'Descrição',
  descriptionHint: 'Opcional. Texto simples, guardado exatamente como o escreves.',
  descriptionPlaceholder: 'O que a regra diz, onde se aplica e o que não abrange.',
  count: '{used} de {max} caracteres.',
  countTooLong: 'Demasiado longo para guardar: {used} de {max} caracteres.',
  create: 'Criar regra',
  save: 'Guardar alterações',
  notSaved: 'Ainda não guardada',
  saved: 'Guardada',
}

export default canonEditor
