import type { Dictionary } from '../../en'

const placesCalibration: Dictionary['places']['calibration'] = {
  leave: 'A escala do mapa tem alterações por guardar. Sair sem as guardar?',
  removeTitle: 'Remover a escala?',
  removeMessage:
    'Deixa de ser possível medir distâncias neste mapa até ser calibrado de novo. Os marcadores não são afetados.',
  removeConfirm: 'Remover escala',
  scale: 'Escala',
  summary:
    'Dois pontos estão a {distance} de distância, por isso um píxel da imagem equivale a cerca de {perPixel} {unit}. As distâncias pedidas a uma aplicação de IA ligada são linhas retas nesta imagem, segundo esta escala.',
  noneEditor:
    'Ainda sem escala. Marca dois pontos e diz a que distância estão um do outro, e uma aplicação de IA ligada consegue medir distâncias em linha reta entre marcadores.',
  none: 'Ainda sem escala. Não é possível medir distâncias neste mapa.',
  setAgain: 'Definir a escala de novo',
  set: 'Definir a escala',
  remove: 'Remover escala',
  firstMissing: 'Marca o primeiro ponto.',
  secondMissing: 'Marca o segundo ponto.',
  distanceInvalid: 'Um número acima de zero.',
  unitMissing: 'Indica a unidade: km, milhas, léguas, dias de viagem.',
  fieldErrors: 'Verifica os pontos e a distância.',
  failed: 'Não foi possível guardar a escala.',
  formTitle: 'Definir a escala',
  formIntro:
    'Clica no mapa duas vezes para marcar dois pontos cuja distância conheces, ou escreve onde estão. Depois diz a que distância estão um do outro, na unidade própria do teu universo.',
  pointA: 'Ponto A',
  pointANot: 'Ponto A (não marcado)',
  pointB: 'Ponto B',
  pointBNot: 'Ponto B (não marcado)',
  across: 'Na horizontal',
  down: 'Na vertical',
  distance: 'Distância',
  unit: 'Unidade',
  saving: 'A guardar…',
  save: 'Guardar',
}

export default placesCalibration
