# European Portuguese glossary

The words LorEvolve uses in `pt-PT` (ADR 0071, issue #106). One term per thing, every time: a reader who
learns "entrada" on the Lore screen should not meet "registo" for the same thing in the Trash.

European Portuguese only. The forms below are the ones that differ from Brazilian Portuguese, which is
what an untended translation drifts into.

## Never these

| Not | Use | Why |
| --- | --- | --- |
| usuário | utilizador | pt-BR |
| tela | ecrã | pt-BR |
| arquivo (meaning a file) | ficheiro | pt-BR. "Arquivo" as *archive* is right and is used for an archived universe. |
| salvar | guardar | pt-BR |
| excluir, deletar | eliminar | pt-BR |
| cadastro, cadastrar | registo, registar | pt-BR |
| time (a team) | equipa | pt-BR |
| gerenciar | gerir | pt-BR |
| planejar | planear | pt-BR |
| conteúdos (as a mass noun) | conteúdo | pt-BR habit |
| você, seu/sua | (second person singular, implied) | LorEvolve speaks to one author; see "How it speaks" |

## LorEvolve's own words

| English | pt-PT | Note |
| --- | --- | --- |
| universe | universo | The world an author builds. Never "mundo", which is the published face of it. |
| world (as published) | mundo | The portal's word for a universe someone chose to share. |
| lore | lore | Kept. It names the section and has no Portuguese word that carries it. |
| entry | entrada | A lore page: a person, a place, a thing. Feminine: "a entrada", "eliminada". |
| entry type | tipo de entrada | Masculine: "o tipo", "eliminado". |
| field | campo | Masculine. |
| field section | secção de campos | Feminine. Not "seção", which is pt-BR. |
| group | grupo | Masculine. |
| relation, relationship | relação | Feminine. |
| relation kind | tipo de relação | Masculine ("o tipo"). |
| canon | cânone | Masculine. The adjective is "canónico" (not "canônico", pt-BR). |
| canon status | estado de cânone | Idea / Draft / Canon are "Ideia", "Rascunho", "Cânone". |
| world rule | regra do mundo | Feminine. |
| conflict | conflito | Masculine. |
| story | história | Feminine. |
| arc | arco | Masculine. |
| chapter | capítulo | Masculine. |
| scene | cena | Feminine. |
| beat | momento da cena | "Batida" reads as a drum. |
| manuscript | manuscrito | Masculine. |
| timeline | cronologia dos acontecimentos | The section is "Linha do tempo" where space is short. |
| moment (timeline) | acontecimento | Masculine. |
| chronology (the calendar system) | calendário | The section that defines how dates are written. |
| era | era | Feminine. |
| date period | período de datas | Masculine. |
| progression | progressão | Feminine. |
| stage | fase | Feminine. |
| form | forma | Feminine. |
| ability | capacidade | Feminine. |
| appearance (a look) | aspeto | Masculine. Not "aspecto", which is the pre-reform spelling. |
| family tree | árvore genealógica | Feminine. |
| map | mapa | Masculine, despite the -a. |
| pin | marcador | Masculine. |
| idea | ideia | Feminine. Not "idéia". |
| idea board | quadro de ideias | Masculine ("o quadro"). |
| card | cartão | Masculine. |
| comment | comentário | Masculine. |
| suggested change | alteração sugerida | Feminine. |
| AI change, proposal | proposta | Feminine. The section is "Alterações da IA". |
| assistant | assistente | Masculine here (o assistente). |
| trash | reciclagem | "A Reciclagem" as a place. Moving something there is "mover para a reciclagem". |
| publish | publicar | The section is "Publicação". |
| collaborator | colaborador | Roles: Owner "Proprietário", Editor "Editor", Reviewer "Revisor", Viewer "Leitor". |
| backup | cópia de segurança | Feminine. Never "backup". |
| archive (a universe) | arquivo | Masculine. The verb is "arquivar". Not the same word as a file. |
| feedback | opinião | "Opiniões" for the admin list of them. |
| tag | etiqueta | Feminine. |
| artwork | ilustração | Feminine. |
| export | exportação | Feminine. The verb is "exportar". |
| account | conta | Feminine. |
| sign in / sign out | iniciar sessão / terminar sessão | Not "logar" or "login". |
| username | nome de utilizador | |
| password | palavra-passe | Feminine. Not "senha", which is pt-BR. |
| settings | definições | Feminine plural. Not "configurações", which is pt-BR. |
| theme | tema | Masculine. |
| language | idioma | Masculine. |
| picture, image | imagem | Feminine. |
| upload (verb) | carregar | |
| download (verb) | transferir | |
| draft (unsaved work) | rascunho | Masculine. |
| version | versão | Feminine. |
| restore | restaurar | |

## How it speaks

- **Second person singular, no pronoun.** "Guarda as tuas alterações" reads as LorEvolve does in English:
  one author, spoken to directly. Never "você", which is pt-BR, and never the formal "o utilizador deve".
- **Possessives stay.** English says "your world"; Portuguese says "o teu mundo", not "o mundo do utilizador".
- **Agreement is per noun.** "Eliminado" for a masculine noun, "eliminada" for a feminine one. Where one
  English word serves both (Deleted, Saved, None), the dictionary holds a key per context rather than one
  shared key, so each can agree. Never invent a neuter form.
- **Zero is plural.** `Intl.PluralRules('pt-PT')` puts 0 in `other`: "0 entradas", not "0 entrada".
- **Sentence case, as in English.** "Guardar alterações", not "Guardar Alterações".
- **Keep the placeholders.** `{name}`, `{count}`, `{n}` must survive, and may be reordered freely.
- **Never translate:** LorEvolve, the names an author writes, and the wire values the API sends.
