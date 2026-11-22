import type { Dictionary } from '../../en'

const storiesPublication: Dictionary['stories']['publication'] = {
  part: {
    shown: { private: 'Privado', public: 'Público', selected: 'Selecionado' },
    scene: {
      what: 'esboço da cena',
      verb: 'Publicar esboço',
      listed: 'Os leitores veem o título e o resumo desta cena no esboço da história.',
      kept: 'Isto não publica as suas notas, ponto de vista, lore, data, momentos da cena nem prosa.',
      isPublic: 'O esboço desta cena está na página pública da história.',
    },
    manuscript: {
      what: 'texto da cena',
      verb: 'Publicar texto',
      listed:
        'Os leitores podem ler o texto desta cena, sob o respetivo título, na página pública da história.',
      kept: 'Isto não publica o seu resumo, notas nem versões guardadas.',
      isPublic: 'O texto desta cena está na página pública da história.',
    },
    arc: {
      what: 'arco',
      verb: 'Publicar arco',
      listed: 'Os leitores veem o título e a descrição do arco.',
      kept: 'As notas e as ligações a cenas e lore não são publicadas. A trama revela muitas vezes a história: publica-a só de propósito.',
      isPublic: 'Este arco está na página pública da história.',
    },
    madePrivate: 'Tornado privado. Já não está na página pública da história.',
    published: 'Publicado. Está na página pública da história.',
    selected: 'Selecionado para publicação. Fica oculto até a história ser pública.',
    failedPublish: 'Não foi possível publicá-lo. Tenta novamente.',
    failedPrivate: 'Não foi possível torná-lo privado. Tenta novamente.',
    selectedHidden:
      'Selecionado para publicação, mas oculto até a história ser pública: a história, com o seu resumo público, num universo público.',
    onlyYou: 'Só tu podes ver este item: {what}.',
    onlyYouSelects:
      'Só tu podes ver este item: {what}. A história ainda não é pública, por isso publicar seleciona-o: fica oculto até a história o ser.',
    label: 'Publicação de {what} “{name}”: {state}',
    heading: 'Selecionado para publicação',
    makePrivate: 'Tornar privado',
  },
  content: {
    shown: { private: 'Privada', public: 'Pública', selected: 'Selecionada' },
    entry: {
      listed: 'Os leitores veem o nome, o tipo, o resumo, a imagem e o artigo.',
      kept: 'Os campos, alcunhas, etiquetas, relações e histórico não são publicados.',
      isPublic: 'Esta entrada de lore está disponível no teu universo público.',
      willPublish: 'Publicar esta entrada de lore torna-a disponível no teu universo público.',
      onlyYou: 'Só tu podes ver esta entrada.',
      publish: 'Publicar entrada',
    },
    story: {
      listed:
        'Os leitores veem o título, o resumo público, e as cenas, textos e arcos que publicares a partir dela.',
      kept: 'A premissa, os capítulos e as notas não são publicados, nem nenhuma cena, texto ou arco que não tenhas publicado.',
      needsSummary:
        'Esta história está selecionada para publicação mas precisa de um resumo público antes de os leitores a poderem ver.',
      noSummary:
        'Uma história precisa de um resumo público, escrito para os leitores, antes de poder ser publicada.',
      isPublic: 'Esta história está selecionada para o teu universo público.',
      willPublish: 'Publicar esta história seleciona-a para o teu universo público.',
      selectedHidden:
        'Esta história está selecionada para publicação, mas continua oculta enquanto o universo for privado.',
      willSelect:
        'O teu universo é privado. Publicar seleciona esta história: continua oculta enquanto o universo for privado.',
      onlyYou: 'Só tu podes ver esta história.',
      publish: 'Publicar história',
    },
    unavailable: 'Estado de publicação indisponível.',
    madePrivate: 'Tornada privada. Já não consta no teu universo público.',
    published: 'Publicada. Consta no teu universo público.',
    selected: 'Selecionada para publicação. Fica oculta enquanto o universo for privado.',
    failedPublish: 'Não foi possível publicá-la. Tenta novamente.',
    failedPrivate: 'Não foi possível torná-la privada. Tenta novamente.',
    headingPublic: 'Pública',
    headingSelected: 'Selecionada para publicação',
    headingPrivate: 'Privada',
    label: 'Publicação: {state}',
    summaryLabel: 'Resumo público',
    editSummary: 'Editar resumo público…',
    writeSummary: 'Escrever resumo público…',
    makePrivate: 'Tornar privada',
    summarySaved: 'Resumo público guardado.',
    summaryRemoved: 'Resumo público removido.',
  },
}

export default storiesPublication
