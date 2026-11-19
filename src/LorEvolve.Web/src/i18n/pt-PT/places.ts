import type { Dictionary } from '../en'
import placesPositions from './places/positions'
import placesDiscovery from './places/discovery'
import placesFamilyPage from './places/familyPage'
import placesMapForm from './places/mapForm'
import placesCalibration from './places/calibration'
import placesMapPage from './places/mapPage'

/** Maps and family trees: their pages, pins, calibration and the kinds a family link can have (#103). */
const places: Dictionary['places'] = {
  familyTypes: {
    summary: 'Tipos na árvore genealógica',
    intro:
      'A pesquisa da árvore genealógica e a ação Árvore genealógica numa entrada funcionam para entradas destes tipos. A família já registada numa entrada é sempre mostrada, qualquer que seja o tipo.',
    oneByOne: 'Tipos ativados um a um',
    none: 'Ainda nenhum.',
    chooseWhere: 'Escolhes isto ao criar um tipo, em {link}.',
    chooseWhereLink: 'Tipos → Tipos de lore',
    groups: 'Grupos',
    noGroups:
      'Este universo ainda não tem grupos de tipos. Podes criar um no editor de um tipo, em {link}.',
    noGroupsLink: 'Tipos → Tipos de lore',
    groupHelp:
      'Ativa um grupo para oferecer a árvore genealógica a todos os tipos que ele contém, incluindo os que adicionares mais tarde. Desativá-lo deixa a família registada como está.',
    covers: 'Abrange {types}',
    coversNone: 'Ainda sem tipos',
    ownersOnly: 'Só um proprietário ou um editor pode alterar isto.',
    groupNotOn: 'Não foi possível ativar {name}.',
    groupNotOff: 'Não foi possível desativar {name}.',
  },
  memberDetails: {
    close: 'Fechar',
    inFamily: 'Nesta família',
    focal: 'Esta página mostra a família desta entrada.',
    position: '{position}:',
    pathDraft: '(ligação: {status})',
    linkDraft: '(ligação: {status})',
    connectionDraft: '(ligação: {status})',
    other: 'Outra família',
    noneRecorded: 'Nenhuma registada.',
    otherNote:
      'Registada tal como a escreveste. Estas ligações são desenhadas a pontilhado quando se aponta para esta pessoa, não colocam ninguém numa geração e não implicam nenhum outro familiar.',
    openEntry: 'Abrir entrada',
    showFamily: 'Mostrar esta família',
  },
  positions: placesPositions,
  reading: {
    hidden: 'uma entrada oculta',
    parent: 'Progenitor {word}',
    child: 'Filho ou filha ({word})',
    auntUncle: 'Irmão ou irmã de {name}',
    cousin: 'Filho ou filha de {name}',
    nieceNephew: 'Filho ou filha de {name}',
    sharesBoth: 'Partilha {shared} ({word} para ambos)',
    sharesEach: 'Partilha {shared} ({first} para {focal}, {second} para {relative})',
    grandparent: 'Progenitor {word} de {through}',
    grandchild: 'Filho ou filha ({word}) de {through}',
    linkSentence: '{parent} {kind} {child}',
  },
  kindDialog: {
    meaningFamily: 'Relação familiar, não define ascendência',
    meaningBiological: 'Progenitor biológico',
    meaningAdoptive: 'Progenitor adotivo',
    leave: 'Este tipo de relação ainda não foi criado. Sair sem o criar?',
    fieldErrors: 'Alguns detalhes precisam de uma alteração antes de se poder criar.',
    failed: 'Não foi possível criar esse tipo de relação.',
    readsAs: 'lê-se',
    eyebrow: 'Árvore genealógica',
    title: 'Novo tipo de relação familiar',
    name: 'Nome',
    namePlaceholder: 'Insere um nome',
    bothWays: 'As duas entradas leem-se “{reads}”. Nada é redigido ao contrário.',
    inverse: 'Nome inverso',
    inversePlaceholder: 'Insere um nome inverso',
    symmetric: 'Lê-se da mesma forma dos dois lados',
    meaning: 'Significado familiar',
    hintParent:
      'A entrada a partir da qual se lê é o progenitor. A árvore coloca ambas e deduz os familiares a partir dela.',
    hintOther:
      'Listada com a família tal como a escreveste. Não coloca ninguém na árvore e não implica nenhum outro familiar.',
    creating: 'A adicionar…',
    create: 'Adicionar tipo',
  },
  linkForm: {
    leave: 'Esta ligação familiar ainda não foi adicionada. Sair sem a guardar?',
    parentKind: '{name} (progenitor {word})',
    chooseEntry: 'Escolhe a entrada a que isto se liga.',
    fieldErrors: 'Alguns detalhes precisam de uma alteração antes de se poder guardar.',
    failed: 'Não foi possível guardar essa ligação familiar.',
    hintParent:
      'O progenitor está à esquerda e o filho ou a filha à direita, que é o que este tipo ({word}) foi configurado para significar.',
    hintOther:
      'Uma ligação familiar tal como a redigiste. Não coloca ninguém na árvore acima e não implica nenhum outro familiar.',
    connection: 'Ligação',
    newKind: 'Novo tipo de relação familiar',
    side: 'Que lado',
    focalParent: '{name} é o progenitor',
    focalChild: '{name} é filho ou filha',
    focalIs: '{name} é',
    theChild: 'O filho ou a filha',
    theParent: 'O progenitor',
    connectedTo: 'Ligação a',
    status: 'Estado',
    statusGroup: 'Estado da ligação',
    saving: 'A adicionar…',
    add: 'Adicionar ligação',
  },
  discovery: placesDiscovery,
  treeView: {
    rows: {
      grandparents: 'Avós',
      parents: 'Progenitores e tios',
      siblings: 'Esta entrada, irmãos e primos',
      children: 'Filhos e sobrinhos',
      grandchildren: 'Netos',
    },
    connection: '{from} {label} {to}',
    showFamily: 'Mostrar a família de {name}',
    details: 'Detalhes de {name}',
    focalNote: '(família mostrada para esta entrada)',
    caption: 'Aponta ou foca uma pessoa para ver a outra família registada para ela.',
    legendBiological: 'Biológico',
    legendAdoptive: 'Adotivo',
    legendOther: 'Outra família registada',
    legendNote:
      'Os filhos pendem da linha entre os progenitores. Lado a lado e unidos: progenitores de um filho, ou família registada numa só geração. Linhas esbatidas e anéis tracejados marcam o que ainda não é Cânone. Abre o olho junto a um retrato para ver os detalhes dessa pessoa, com todas as ligações escritas por extenso.',
  },
  familyPage: placesFamilyPage,
  maps: {
    tabMaps: 'Mapas',
    tabInteractive: 'Mapa interativo',
    tabsLabel: 'Mapas',
    new: 'Novo mapa',
    title: 'Mapas',
    lede: 'Imagens deste universo, cada uma com marcadores que abrem o lore que representam. Carrega um mapa que já tenhas; o LorEvolve não desenha nada nele.',
    deleted: '{name} foi eliminado, com os marcadores.',
    loading: 'A desenrolar os mapas…',
    error: 'Não foi possível ler os mapas.',
    retry: 'Tentar novamente',
    meta: '{pins} · {width} × {height}',
    noPins: 'Ainda sem marcadores',
    pins: {
      one: '{n} marcador',
      other: '{n} marcadores',
    },
    emptyTitle: 'Ainda não há mapas.',
    emptyHintEditor:
      'Carrega uma imagem deste universo, como um continente, uma cidade ou um navio, e coloca marcadores no lore que vive nela.',
    emptyHint: 'Ainda ninguém carregou um mapa deste universo.',
    soonTitle: 'O mapa interativo vem aí.',
    soonHint: 'Planeado, ainda não construído.',
  },
  mapForm: placesMapForm,
  pinForm: {
    leaveChanges: '“{title}” tem alterações por guardar. Sair sem as guardar?',
    leaveNew: 'Este marcador ainda não foi colocado. Sair sem o colocar?',
    titleMissing: 'Dá um título ao marcador.',
    xRange: 'De 0 a 100, como percentagem da largura.',
    yRange: 'De 0 a 100, como percentagem da altura.',
    fieldErrors:
      'Alguns detalhes precisam de uma alteração antes de este marcador poder ser guardado.',
    failed: 'Não foi possível guardar esse marcador.',
    eyebrowEdit: 'A editar um marcador',
    eyebrowNew: 'Novo marcador',
    title: 'Colocar um marcador',
    reviewNote:
      'Este marcador foi colocado numa imagem anterior. Verifica a posição e guarda para a confirmar.',
    lore: 'Entrada de lore',
    lorePlaceholder: 'Pesquisa o lugar que este marcador assinala',
    loreHint: 'Opcional. O marcador abre esta entrada, e a entrada leva de volta a este marcador.',
    loreHintTrashed:
      'Opcional. O marcador abre esta entrada, e a entrada leva de volta a este marcador. A entrada que ele representava está na reciclagem; restaura-a para a ligar de novo.',
    titleLabel: 'Título',
    note: 'Nota',
    noteHint: 'Uma ou duas linhas sobre este lugar no mapa. Opcional.',
    position: 'Posição',
    positionHint:
      'Em percentagem da imagem, a partir da margem esquerda e da margem superior. Arrastar o marcador no mapa também define estes valores.',
    across: 'Na horizontal',
    down: 'Na vertical',
    saving: 'A guardar…',
    save: 'Guardar',
    place: 'Colocar marcador',
  },
  calibration: placesCalibration,
  viewer: {
    stage: 'Mapa: {name}',
    pinReview: '{title} (posição a aguardar revisão)',
    fit: 'Ajustar o mapa inteiro',
    hint: 'Arrasta para deslocar e usa a roda para ampliar. Com o mapa em foco, as setas deslocam, mais e menos ampliam, e 0 ajusta o mapa inteiro. Tab chega a cada marcador; Enter seleciona-o.',
    hintPlacing:
      'Arrasta para deslocar e usa a roda para ampliar. Com o mapa em foco, as setas deslocam, mais e menos ampliam, e 0 ajusta o mapa inteiro. Tab chega a cada marcador; Enter seleciona-o. Ao colocar um marcador: clica no mapa onde ele fica, ou prime Enter para o colocar ao centro.',
  },
  mapPage: placesMapPage,
}

export default places
