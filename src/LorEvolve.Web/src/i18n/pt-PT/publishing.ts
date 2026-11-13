import type { Dictionary } from '../en'

/** Palavras da publicação, partilhadas pelo portal e pelas definições de publicação de um universo: categorias e géneros (#101). */
const publishing: Dictionary['publishing'] = {
  categories: {
    original: 'Original',
    'movies-and-tv': 'Cinema e TV',
    games: 'Jogos',
    books: 'Livros',
    comics: 'Banda desenhada',
    'tabletop-and-rpg': 'Jogos de mesa e RPG',
    audio: 'Áudio',
    other: 'Outra',
  },
  genres: {
    fantasy: 'Fantasia',
    'science-fiction': 'Ficção científica',
    adventure: 'Aventura',
    horror: 'Terror',
    mystery: 'Mistério',
    historical: 'Histórico',
    romance: 'Romance',
    thriller: 'Thriller',
    supernatural: 'Sobrenatural',
    'post-apocalyptic': 'Pós-apocalíptico',
    contemporary: 'Contemporâneo',
    other: 'Outro',
  },
}

export default publishing
