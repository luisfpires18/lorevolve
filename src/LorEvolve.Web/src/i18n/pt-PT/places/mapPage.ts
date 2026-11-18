import type { Dictionary } from '../../en'

const placesMapPage: Dictionary['places']['mapPage'] = {
  moveFailed: 'Não foi possível mover o marcador.',
  removePinTitle: 'Eliminar o marcador {pin}?',
  removePinLore: 'A entrada de lore que ele representa não é afetada.',
  removePinOnly: 'Só o marcador desaparece.',
  removePinConfirm: 'Eliminar marcador',
  deleteTitle: 'Eliminar o mapa {map}?',
  deleteMessage:
    'O mapa e os respetivos marcadores são eliminados definitivamente. Os mapas não vão para a reciclagem. As entradas de lore que os marcadores representam não são afetadas.',
  pinCount: {
    one: '{n} marcador',
    other: '{n} marcadores',
  },
  deleteConfirm: 'Eliminar mapa',
  loading: 'A desenrolar o mapa…',
  missingTitle: 'Esse mapa não está aqui.',
  missingHint: 'Pode ter sido eliminado. {link}',
  missingLink: 'Voltar aos mapas',
  error: 'Não foi possível abrir o mapa.',
  retry: 'Tentar novamente',
  crumb: 'Mapas',
  placingButton: 'A colocar um marcador…',
  addPin: 'Adicionar marcador',
  moreActions: 'Mais ações para {name}',
  editDetails: 'Editar detalhes',
  replacePicture: 'Substituir imagem',
  deleteMap: 'Eliminar mapa',
  reviewEditor: {
    one: 'Um marcador foi colocado numa imagem anterior deste mapa. Abre-o para verificar o lugar dele na nova imagem e guarda para confirmar.',
    other:
      '{n} marcadores foram colocados numa imagem anterior deste mapa. Abre cada um para verificar o lugar dele na nova imagem e guarda para confirmar.',
  },
  reviewViewer: {
    one: 'Um marcador foi colocado numa imagem anterior deste mapa. O lugar dele é mostrado como era.',
    other:
      '{n} marcadores foram colocados numa imagem anterior deste mapa. Os lugares deles são mostrados como eram.',
  },
  calibrating:
    'A definir a escala: clica no mapa para marcar o ponto A, depois o ponto B, ou escreve onde estão ao lado do mapa.',
  placing: 'Clica no mapa onde o marcador fica, ou {position}.',
  typePosition: 'escreve a posição dele',
  cancel: 'Cancelar',
  markerA: 'A',
  markerB: 'B',
  panel: 'Marcadores e escala',
  pinReview: 'Posição a aguardar revisão',
  pinTrashed: 'A entrada que este marcador representava está na reciclagem.',
  openEntry: 'Abrir {name}',
  entryType: '· {type}',
  annotation: 'Uma anotação, sem ligação a nenhuma entrada.',
  position: '{x}% na horizontal · {y}% na vertical',
  editPin: 'Editar',
  removePin: 'Eliminar',
  pins: 'Marcadores',
  noPinsEditor:
    'Ainda sem marcadores. Adiciona um para assinalar um lugar e abrir o lore dele a partir do mapa.',
  noPins: 'Ainda sem marcadores neste mapa.',
  awaitingReview: '· a aguardar revisão',
  listType: '· {type}',
}

export default placesMapPage
