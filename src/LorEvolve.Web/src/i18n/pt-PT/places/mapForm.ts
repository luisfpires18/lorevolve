import type { Dictionary } from '../../en'

const placesMapForm: Dictionary['places']['mapForm'] = {
  leaveNew: 'Este mapa ainda não foi criado. Sair sem o criar?',
  leaveChanges: 'Há alterações por guardar. Sair sem as guardar?',
  tooLarge: 'As imagens têm de ter {size} ou menos.',
  nameMissing: 'Dá um nome ao mapa.',
  fileMissing: 'Escolhe uma imagem do mapa.',
  pinsMissing: 'Diz o que acontece aos marcadores que já estão no mapa.',
  fieldErrors: 'Alguns detalhes precisam de uma alteração antes de se poder guardar.',
  failed: 'Não foi possível guardar isso.',
  headingNew: 'Novo mapa',
  headingDetails: 'Detalhes do mapa',
  headingReplace: 'Substituir a imagem',
  name: 'Nome',
  description: 'Descrição',
  descriptionHint: 'O que este mapa mostra, numa ou duas linhas. Opcional.',
  imageNew: 'Imagem do mapa',
  imageReplace: 'Nova imagem',
  imageHint:
    'Um JPEG, PNG ou WebP até {size}. O original é guardado tal como está; o visualizador mostra uma cópia ajustada ao ecrã.',
  chosen: '{name} · {size}',
  pinsLegend: 'Os marcadores que já estão neste mapa',
  noPins:
    'Este mapa não tem marcadores, por isso nada corre risco. Escolhe qualquer uma das opções.',
  pinsPlaced: {
    one: '{n} marcador foi colocado na imagem atual. Uma nova imagem pode pô-lo noutro sítio.',
    other:
      '{n} marcadores foram colocados na imagem atual. Uma nova imagem pode pô-los noutro sítio.',
  },
  scaleNote:
    'A escala foi medida na imagem atual e acompanha-a. Define-a de novo na nova antes de pedires distâncias.',
  keep: '{lead}, e marca cada um como a aguardar revisão. Abre cada marcador para verificar o lugar dele na nova imagem e guarda para confirmar.',
  keepLead: 'Mantém os marcadores onde estão',
  remove: '{lead} As entradas de lore que eles representavam não são afetadas.',
  removeLead: 'Remove todos os marcadores.',
  uploading: 'A carregar… {percent}%',
  uploaded: 'Carregado. A preparar o mapa…',
  saving: 'A guardar…',
  createMap: 'Criar mapa',
  saveDetails: 'Guardar',
  replacePicture: 'Substituir imagem',
}

export default placesMapForm
