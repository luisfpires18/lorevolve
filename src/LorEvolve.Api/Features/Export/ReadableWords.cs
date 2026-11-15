using LorEvolve.Api.Features.Localization;
using LorEvolve.Api.Features.Lore;
using LorEvolve.Api.Features.Publishing;
using LorEvolve.Api.Features.Stories;

namespace LorEvolve.Api.Features.Export;

/// <summary>
/// The readable export's own words, in the language the request asked for (#110, ADR 0071).
///
/// Server-side, not codes with a mapping in the web app, because a readable export has no client: it is a folder of
/// Markdown files a person opens in any editor, long after the request that made it. Nothing is left to render it
/// later, so the words have to be chosen when the archive is written, from the <c>Accept-Language</c> the request
/// carried (<see cref="RequestLanguage"/>). That is the same choice #109 made for the emails, and the same shape: a
/// record of the words, one instance per language, no resource file and no <c>IStringLocalizer</c>.
///
/// Only LorEvolve's own words are here. Everything the author wrote - names, titles, summaries, prose, their own
/// field names, their eras and their tags - is theirs and is written exactly as they typed it, in whatever language
/// they typed it in.
///
/// A number joined to a word is a method rather than a property, so a language can put the two in its own order and
/// use its own plural. The ids and the paths a page is built from (<c>media/</c>, the file names, the layout version)
/// are never words: they are the same in every language, so the folder a reader gets is the same folder.
/// </summary>
internal sealed record ReadableWords
{
    public static readonly ReadableWords English = new();

    public static readonly ReadableWords Portuguese = new()
    {
        ArchivedUniverse = "*Este universo está arquivado no LorEvolve.*",
        TakenPrefix = "> Exportação legível de um universo LorEvolve, feita a ",
        LayoutPrefix = " UTC (layout ",
        BackupFormatPrefix = ", formato de cópia de segurança ",
        ForReadingLine = "> É para ler e guardar. O LorEvolve não a consegue ler de volta: para restaurares este universo, usa uma cópia de segurança",
        BackupHintLine = "> (Configurações, Dados, Descarregar cópia de segurança), que também leva a Reciclagem e todas as versões guardadas.",
        Artwork = "arte",
        PublicSummary = "Resumo público",
        Category = "Categoria",
        Genres = "Géneros",
        BasedOn = "Baseado em",
        Contents = "Conteúdo",
        Lore = "Lore",
        Relationships = "Relações",
        Timeline = "Cronologia",
        WorldRules = "Regras do mundo",
        Ideas = "Ideias",
        Stories = "Histórias",
        Maps = "Mapas",
        NotInThisExport = "Não está nesta exportação",
        TrashLine = "- O que está na Reciclagem ({0} itens aqui). Uma cópia de segurança leva-o.",
        SavedVersionsLine = "- Versões guardadas de entradas, artigos, manuscritos e progressões. Uma cópia de segurança leva-as.",
        AccountsLine = "- Contas, colaboradores, comentários, sugestões, alterações de IA pendentes e o que está público.",
        DerivedLine = "- O que o LorEvolve volta a derivar: miniaturas, pesquisa, deteções de canon. As deteções postas de parte estão numa cópia de segurança.",
        LooseIdeasLine = "- Ideias que não pertencem a nenhum universo: são da tua conta, não deste universo.",
        Pictures = "Imagens",
        PicturesLineA = "Todas as imagens que uma página mostra estão aqui como o original que carregaste, byte por byte, em `media/` - no",
        PicturesLineB = "mesmo caminho que uma cópia de segurança deste universo usa: `media/entities/{entry id}/original.{ext}`,",
        PicturesLineC = "`media/entities/{entry id}/appearances/{picture id}/original.{ext}`, `media/maps/{map id}/original.{ext}` e",
        Groups = "Grupos",
        Archived = " (arquivado)",
        ArchivedDash = " - arquivado",
        AlsoKnownAs = "Também conhecido por",
        Tags = "Etiquetas",
        Article = "Artigo",
        AllMomentsPrefix = "Todos os momentos: ",
        Scenes = "Cenas",
        PointOfViewNote = " (ponto de vista)",
        OnMaps = "Nos mapas",
        PrivateNote = "Nota privada",
        OwnerOnlyLine = "*Só o proprietário do universo pode ler isto no LorEvolve.*",
        Details = "Detalhes",
        ArchivedFieldSuffix = " (campo arquivado)",
        Yes = "Sim",
        No = "Não",
        Eras = "Eras",
        When = "Quando",
        To = " a ",
        ClearedInThisEra = "(limpo nesta era)",
        EraPrefix = "era ",
        ScenePrefix = "cena ",
        MomentPrefix = "momento ",
        Forms = "Formas",
        FirstUnlocked = "Desbloqueado pela primeira vez",
        AvailableInEras = "Disponível nas eras",
        UsedInScenes = "Usado nas cenas",
        Abilities = "Capacidades",
        Appearances = "Aparências",
        Knowledge = "Conhecimento",
        KnownFromStart = "sabido desde o início",
        LearntInPrefix = "aprendido em ",
        KnowsLabel = "- Sabe: ",
        KnowsInfix = " sabe: ",
        AboutPrefix = " (sobre ",
        None = "Nada.",
        RelationshipTableHeader = "| De | Relação | Para | Estado | Quando | Notas |",
        Kinds = "Tipos",
        BothWays = " (nos dois sentidos)",
        DatePeriods = "Períodos de datas",
        YearsCountDown = " - os anos contam para trás",
        Calendar = "Calendário",
        Days = " dias",
        Moments = "Momentos",
        MomentsSuffix = " momentos",
        EntriesInPrefix = " entradas em ",
        TypesSuffix = " tipos",
        Who = "Quem",
        EventPrefix = "evento: ",
        MethodPrefix = "método: ",
        ParticipantPrefix = "participante: ",
        Unchaptered = "Sem capítulo",
        ChapterWord = " Capítulo ",
        ArcHeading = "### Arco ",
        InPrefix = "Em ",
        InInfix = " em ",
        ChapterInfix = ", capítulo ",
        Notes = "Notas",
        PointOfView = "Ponto de vista",
        Beats = "Momentos-chave",
        Manuscript = "Manuscrito",
        Size = "Tamanho",
        PixelsSuffix = " píxeis",
        Scale = "Escala",
        BetweenWord = " entre ",
        AndWord = " e ",
        Pins = "Marcadores",
        PinTableHeader = "| Marcador | Lore | Horizontal | Vertical | Nota |",
        PlacedOnEarlierPicture = " (colocado numa imagem anterior)",
        Check = "Verificação",
        CheckSentence = "no máximo {0} por participante do evento {1} pelo método {2}",
        IdeasIntro = "*Possibilidades guardadas para este universo. Nenhuma delas é lore.*",
        About = "Sobre",
        InTheTrashSuffix = " (na Reciclagem)",
        EntryNotExported = "(uma entrada que não está nesta exportação)",
        SceneInTrash = "(uma cena na Reciclagem)",
        StoryInTrash = "(uma história na Reciclagem)",
        MomentInTrash = "(um momento na Reciclagem)",
        ArcInTrash = "(um arco na Reciclagem)",
        DateUnknown = "data desconhecida",
        AroundPrefix = "cerca de ",
        MonthPrefix = "mês ",
        DayPrefix = "dia ",
        DuringPrefix = "durante ",
        CanonIdea = "Ideia",
        CanonDraft = "Rascunho",
        CanonCanon = "Canon",
        StoryPlanning = "Em planeamento",
        StoryDrafting = "Em rascunho",
        StoryComplete = "Concluída",
        CategoryWords = new Dictionary<UniverseCategory, string>
        {
            [UniverseCategory.Original] = "Original",
            [UniverseCategory.MoviesAndTv] = "Cinema e TV",
            [UniverseCategory.Games] = "Jogos",
            [UniverseCategory.Books] = "Livros",
            [UniverseCategory.Comics] = "Banda desenhada",
            [UniverseCategory.TabletopAndRpg] = "Jogos de mesa e RPG",
            [UniverseCategory.Audio] = "Áudio",
            [UniverseCategory.Other] = "Outra",
        },
        GenreWords = new Dictionary<UniverseGenres, string>
        {
            [UniverseGenres.Fantasy] = "Fantasia",
            [UniverseGenres.ScienceFiction] = "Ficção científica",
            [UniverseGenres.Adventure] = "Aventura",
            [UniverseGenres.Horror] = "Terror",
            [UniverseGenres.Mystery] = "Mistério",
            [UniverseGenres.Historical] = "Histórico",
            [UniverseGenres.Romance] = "Romance",
            [UniverseGenres.Thriller] = "Thriller",
            [UniverseGenres.Supernatural] = "Sobrenatural",
            [UniverseGenres.PostApocalyptic] = "Pós-apocalíptico",
            [UniverseGenres.Contemporary] = "Contemporâneo",
            [UniverseGenres.Other] = "Outro",
        },
    };

    /// <summary>The words for a request's language; English for any language LorEvolve has no words for.</summary>
    public static ReadableWords For(string language) =>
        language == RequestLanguage.Portuguese ? Portuguese : English;

    // ---------- README ----------
    public string ArchivedUniverse { get; init; } = "*This universe is archived in LorEvolve.*";

    public string TakenPrefix { get; init; } = "> Readable export of a LorEvolve universe, taken ";

    public string LayoutPrefix { get; init; } = " UTC (layout ";

    public string BackupFormatPrefix { get; init; } = ", backup format ";

    public string ForReadingLine { get; init; } =
        "> It is for reading and keeping. LorEvolve cannot read it back: to restore this universe, use a backup";

    public string BackupHintLine { get; init; } =
        "> (Settings, Data, Download backup), which also carries the Trash and every saved version.";

    public string Artwork { get; init; } = "artwork";

    public string PublicSummary { get; init; } = "Public summary";

    public string Category { get; init; } = "Category";

    public string Genres { get; init; } = "Genres";

    public string BasedOn { get; init; } = "Based on";

    public string Contents { get; init; } = "Contents";

    public string Lore { get; init; } = "Lore";

    public string Relationships { get; init; } = "Relationships";

    public string Timeline { get; init; } = "Timeline";

    public string WorldRules { get; init; } = "World rules";

    public string Ideas { get; init; } = "Ideas";

    public string Stories { get; init; } = "Stories";

    public string Maps { get; init; } = "Maps";

    public string NotInThisExport { get; init; } = "Not in this export";

    public string TrashLine { get; init; } = "- What is in the Trash ({0} items here). A backup carries it.";

    public string SavedVersionsLine { get; init; } =
        "- Saved versions of entries, articles, manuscripts and progressions. A backup carries them.";

    public string AccountsLine { get; init; } =
        "- Accounts, collaborators, comments, suggestions, pending AI changes and whether anything is public.";

    public string DerivedLine { get; init; } =
        "- What LorEvolve derives again: thumbnails, search, Canon findings. Dismissed findings are in a backup.";

    public string LooseIdeasLine { get; init; } =
        "- Ideas that belong to no universe: they are your account's, not this universe's.";

    public string Pictures { get; init; } = "Pictures";

    public string PicturesLineA { get; init; } =
        "Every picture a page shows is here as the original you uploaded, byte for byte, under `media/` - at the";

    public string PicturesLineB { get; init; } =
        "same path a backup of this universe uses: `media/entities/{entry id}/original.{ext}`,";

    public string PicturesLineC { get; init; } =
        "`media/entities/{entry id}/appearances/{picture id}/original.{ext}`, `media/maps/{map id}/original.{ext}` and";

    // ---------- Lore ----------
    public string Groups { get; init; } = "Groups";

    public string Archived { get; init; } = " (archived)";

    public string ArchivedDash { get; init; } = " - archived";

    public string AlsoKnownAs { get; init; } = "Also known as";

    public string Tags { get; init; } = "Tags";

    public string Article { get; init; } = "Article";

    public string AllMomentsPrefix { get; init; } = "All moments: ";

    public string Scenes { get; init; } = "Scenes";

    public string PointOfViewNote { get; init; } = " (point of view)";

    public string OnMaps { get; init; } = "On maps";

    public string PrivateNote { get; init; } = "Private note";

    public string OwnerOnlyLine { get; init; } = "*Only the universe's owner can read this in LorEvolve.*";

    public string Details { get; init; } = "Details";

    public string ArchivedFieldSuffix { get; init; } = " (archived field)";

    public string Yes { get; init; } = "Yes";

    public string No { get; init; } = "No";

    // ---------- Progression ----------
    public string Eras { get; init; } = "Eras";

    public string When { get; init; } = "When";

    public string To { get; init; } = " to ";

    public string ClearedInThisEra { get; init; } = "(cleared in this era)";

    public string EraPrefix { get; init; } = "era ";

    public string ScenePrefix { get; init; } = "scene ";

    public string MomentPrefix { get; init; } = "moment ";

    public string Forms { get; init; } = "Forms";

    public string FirstUnlocked { get; init; } = "First unlocked";

    public string AvailableInEras { get; init; } = "Available in eras";

    public string UsedInScenes { get; init; } = "Used in scenes";

    public string Abilities { get; init; } = "Abilities";

    public string Appearances { get; init; } = "Appearances";

    // ---------- Knowledge ----------
    public string Knowledge { get; init; } = "Knowledge";

    public string KnownFromStart { get; init; } = "known from the start";

    public string LearntInPrefix { get; init; } = "learnt in ";

    public string KnowsLabel { get; init; } = "- Knows: ";

    public string KnowsInfix { get; init; } = " knows: ";

    public string AboutPrefix { get; init; } = " (about ";

    // ---------- Relationships ----------
    public string None { get; init; } = "None.";

    public string RelationshipTableHeader { get; init; } = "| From | Relationship | To | Status | When | Notes |";

    public string Kinds { get; init; } = "Kinds";

    public string BothWays { get; init; } = " (both ways)";

    // ---------- Timeline ----------
    public string DatePeriods { get; init; } = "Date periods";

    public string YearsCountDown { get; init; } = " - years count down";

    public string Calendar { get; init; } = "Calendar";

    public string Days { get; init; } = " days";

    public string Moments { get; init; } = "Moments";

    public string MomentsSuffix { get; init; } = " moments";

    public string EntriesInPrefix { get; init; } = " entries in ";

    public string TypesSuffix { get; init; } = " types";

    public string Who { get; init; } = "Who";

    public string EventPrefix { get; init; } = "event: ";

    public string MethodPrefix { get; init; } = "method: ";

    public string ParticipantPrefix { get; init; } = "participant: ";

    // ---------- Stories and scenes ----------
    public string Unchaptered { get; init; } = "Unchaptered";

    public string ChapterWord { get; init; } = " Chapter ";

    public string ArcHeading { get; init; } = "### Arc ";

    public string InPrefix { get; init; } = "In ";

    /// <summary>The same word inside a sentence rather than starting one: "a scene <b>in</b> a story".</summary>
    public string InInfix { get; init; } = " in ";

    public string ChapterInfix { get; init; } = ", chapter ";

    public string Notes { get; init; } = "Notes";

    public string PointOfView { get; init; } = "Point of view";

    public string Beats { get; init; } = "Beats";

    public string Manuscript { get; init; } = "Manuscript";

    // ---------- Maps ----------
    public string Size { get; init; } = "Size";

    public string PixelsSuffix { get; init; } = " pixels";

    public string Scale { get; init; } = "Scale";

    public string BetweenWord { get; init; } = " between ";

    public string AndWord { get; init; } = " and ";

    public string Pins { get; init; } = "Pins";

    public string PinTableHeader { get; init; } = "| Pin | Lore | Across | Down | Note |";

    public string PlacedOnEarlierPicture { get; init; } = " (placed on an earlier picture)";

    // ---------- World rules and ideas ----------
    public string Check { get; init; } = "Check";

    public string CheckSentence { get; init; } = "at most {0} per participant of event {1} by method {2}";

    public string IdeasIntro { get; init; } = "*Possibilities kept for this universe. None of them is lore.*";

    public string About { get; init; } = "About";

    // ---------- What is not in the export ----------
    public string InTheTrashSuffix { get; init; } = " (in the Trash)";

    public string EntryNotExported { get; init; } = "(an entry not in this export)";

    public string SceneInTrash { get; init; } = "(a scene in the Trash)";

    public string StoryInTrash { get; init; } = "(a story in the Trash)";

    public string MomentInTrash { get; init; } = "(a moment in the Trash)";

    public string ArcInTrash { get; init; } = "(arc in the Trash)";

    // ---------- Dates ----------
    public string DateUnknown { get; init; } = "date unknown";

    public string AroundPrefix { get; init; } = "around ";

    public string MonthPrefix { get; init; } = "month ";

    public string DayPrefix { get; init; } = "day ";

    public string DuringPrefix { get; init; } = "during ";

    // ---------- The words of LorEvolve's own enumerations ----------
    public string CanonIdea { get; init; } = "Idea";

    public string CanonDraft { get; init; } = "Draft";

    public string CanonCanon { get; init; } = "Canon";

    public string StoryPlanning { get; init; } = "Planning";

    public string StoryDrafting { get; init; } = "Drafting";

    public string StoryComplete { get; init; } = "Complete";

    /// <summary>English leaves these empty and falls back to the enumeration's own spaced-out name.</summary>
    public IReadOnlyDictionary<UniverseCategory, string> CategoryWords { get; init; } =
        new Dictionary<UniverseCategory, string>();

    public IReadOnlyDictionary<UniverseGenres, string> GenreWords { get; init; } =
        new Dictionary<UniverseGenres, string>();

    public string StatusOf(CanonStatus status) => status switch
    {
        CanonStatus.Idea => CanonIdea,
        CanonStatus.Draft => CanonDraft,
        _ => CanonCanon,
    };

    public string StatusOf(StoryStatus status) => status switch
    {
        StoryStatus.Planning => StoryPlanning,
        StoryStatus.Drafting => StoryDrafting,
        _ => StoryComplete,
    };

    public string CategoryOf(UniverseCategory category) =>
        CategoryWords.TryGetValue(category, out var word) ? word : SpacedName(category.ToString());

    public string GenreOf(UniverseGenres genre) =>
        GenreWords.TryGetValue(genre, out var word) ? word : SpacedName(genre.ToString());

    /// <summary>"MoviesAndTv" as "Movies and tv": the English fallback for an enumeration with no words of its own.</summary>
    private static string SpacedName(string name)
    {
        var text = new System.Text.StringBuilder();
        foreach (var character in name)
        {
            if (char.IsUpper(character) && text.Length > 0)
            {
                text.Append(' ').Append(char.ToLowerInvariant(character));
            }
            else
            {
                text.Append(character);
            }
        }

        return text.ToString();
    }
}
