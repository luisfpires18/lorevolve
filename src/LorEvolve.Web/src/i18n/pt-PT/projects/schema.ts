import type { Dictionary } from '../../en'

const projectsSchema: Dictionary['projects']['schema'] = {
  title: 'Tipos',
  lede: 'Os tipos de coisa de que este projeto é feito.',
  failed: 'Não foi possível ler os tipos deste projeto.',
  empty: 'Ainda não há tipos.',
  emptyHint:
    'Um tipo é um género de coisa que este projeto guarda, como uma personagem ou um lugar.',
  starterOffer: 'Começar com {types}?',
  starterHint: 'Um ponto de partida. Mude o nome, apague, ou faça os seus.',
  starterApply: 'Adicionar estes tipos',
  starterApplying: 'A adicionar…',
  fromTemplate: {
    button: 'A partir de um modelo',
    title: 'Novo tipo a partir de um modelo',
    source: 'Modelo',
    template: 'Modelo',
    option: '{name} ({count} campos)',
    copyHint: 'O jogo fica com uma cópia própria. Alterações posteriores ao modelo não a mudam.',
    nameHint: 'Deixa vazio para usar o nome do modelo.',
    detailsCreate: 'Verifica o campo assinalado.',
    failed: 'Não foi possível criar o tipo.',
  },
  iconHint:
    'Opcional, e apenas uma imagem: marca o tipo no seu cartão. Nada é escolhido por si a partir do nome.',
  parentHint:
    'Organiza os tipos: um tipo aninhado fica sob o seu pai e tem todos os campos dos tipos acima dele.',
  entryCount: {
    one: '1 registo',
    other: '{count} registos',
  },
  noEntries: 'Ainda não há registos',
  fields: 'Campos',
  noFields: 'Ainda não há campos.',
  fieldOptions: 'Opções, uma por linha',
  addField: 'Adicionar campo',
}

export default projectsSchema
