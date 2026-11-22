import type { Dictionary } from '../../en'

const loreSearch: Dictionary['lore']['search'] = {
  kind: {
    entity: 'Lore',
    story: 'História',
    chapter: 'Capítulo',
    scene: 'Cena',
    plotArc: 'Arco',
    manuscript: 'Manuscrito',
    idea: 'Ideia',
    worldRule: 'Regra do mundo',
  },
  field: {
    alias: 'Também conhecida como',
    summary: 'No resumo',
    premise: 'Na premissa',
    description: 'Na descrição',
    notes: 'Nas notas',
    body: 'Na ideia',
    article: 'No artigo',
    prose: 'Na prosa',
  },
  unreachable: 'Não foi possível contactar a pesquisa.',
  empty: 'Nada neste universo corresponde a “{query}”.',
  announce: {
    results: {
      one: '1 resultado. Usa as setas para cima e para baixo para escolher um.',
      other: '{n} resultados. Usa as setas para cima e para baixo para escolher um.',
    },
    resultsMore: {
      one: '1 resultado, e mais que não são mostrados. Usa as setas para cima e para baixo para escolher um.',
      other:
        '{n} resultados, e mais que não são mostrados. Usa as setas para cima e para baixo para escolher um.',
    },
  },
  opened: 'Abriste {kind} “{title}”.',
  label: 'Pesquisar neste universo',
  hint: 'Encontra palavras no lore e nos artigos, histórias, capítulos, cenas, arcos, manuscritos e ideias deste universo. Os resultados surgem enquanto escreves.',
  idle: 'Pesquisa no lore e nos artigos, histórias, capítulos, cenas, arcos, manuscritos e ideias deste universo.',
  searching: 'A pesquisar…',
  retry: 'Tentar novamente',
  results: 'Resultados',
  more: 'As correspondências mais próximas de cada tipo. Acrescenta uma palavra para restringir.',
}

export default loreSearch
