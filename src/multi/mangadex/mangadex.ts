// MangaDex — mangadex.org
// API pública REST: https://api.mangadex.org

const BASE_URL = "https://api.mangadex.org";
const CHAPTERS_LIMIT = 100;
const COVERS_BASE = "https://uploads.mangadex.org/covers";

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/** Extrai o UUID do mangá a partir de uma URL do MangaDex. */
function extractId(url: string): string {
  const parts = url.split("/");
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "title" && i + 1 < parts.length) {
      return parts[i + 1];
    }
  }
  return url;
}

/** Extrai o título preferencial. Prioridade: idioma atual > en > ja-ro > primeiro. */
function extractTitle(titles: Record<string, string>): string {
  if (titles[__lang__]) return titles[__lang__];
  if (titles.en) return titles.en;
  if (titles["ja-ro"]) return titles["ja-ro"];
  const keys = Object.keys(titles);
  return keys.length > 0 ? titles[keys[0]] : "";
}

/** Extrai a URL da capa a partir dos relationships do mangá. */
function extractCover(
  mangaId: string,
  relationships: any[] | undefined
): string | null {
  if (!relationships) return null;
  for (const rel of relationships) {
    if (
      rel.type === "cover_art" &&
      rel.attributes?.fileName
    ) {
      return `${COVERS_BASE}/${mangaId}/${rel.attributes.fileName}.256.jpg`;
    }
  }
  return null;
}

/** Mapa de tradução de status por idioma. */
const STATUS_MAP: Record<string, Record<string, string>> = {
  "pt-br": { ongoing: "Em andamento", completed: "Completo", hiatus: "Hiato", cancelled: "Cancelado" },
  es:      { ongoing: "En curso", completed: "Completado", hiatus: "Hiato", cancelled: "Cancelado" },
  "es-la": { ongoing: "En curso", completed: "Completado", hiatus: "Hiato", cancelled: "Cancelado" },
  fr:      { ongoing: "En cours", completed: "Terminé", hiatus: "Hiatus", cancelled: "Annulé" },
  de:      { ongoing: "Laufend", completed: "Abgeschlossen", hiatus: "Pause", cancelled: "Eingestellt" },
  it:      { ongoing: "In corso", completed: "Completato", hiatus: "Pausa", cancelled: "Cancellato" },
  ru:      { ongoing: "Выпускается", completed: "Завершено", hiatus: "Приостановлено", cancelled: "Отменено" },
  ja:      { ongoing: "連載中", completed: "完結", hiatus: "休載", cancelled: "打ち切り" },
  ko:      { ongoing: "연재 중", completed: "완결", hiatus: "휴재", cancelled: "중단" },
  zh:      { ongoing: "连载中", completed: "已完结", hiatus: "暂停", cancelled: "取消" },
  en:      { ongoing: "Ongoing", completed: "Completed", hiatus: "Hiatus", cancelled: "Cancelled" },
};

function translateStatus(status: string | null): string | null {
  if (!status) return null;
  const map = STATUS_MAP[__lang__] || STATUS_MAP["en"];
  return map[status] || status;
}

// ═══════════════════════════════════════════════════════════════
// EXTENSION
// ═══════════════════════════════════════════════════════════════

class MangaDexExtension implements HagitoriExtension {

  async getManga(url: string): Promise<Manga> {
    const mangaId = extractId(url);
    const resp = await fetch(
      `${BASE_URL}/manga/${mangaId}?includes[]=cover_art`
    );
    const data = resp.json();

    if (!data?.data) {
      throw new Error(`Mangá não encontrado: ${mangaId}`);
    }

    const manga = data.data;
    const title = extractTitle(manga.attributes.title);
    if (!title) {
      throw new Error(`Failed to extract title for manga: ${mangaId}`);
    }
    const cover = extractCover(mangaId, manga.relationships);

    return new Manga({ id: manga.id, name: title, cover: cover ?? undefined });
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const uuid = extractId(mangaId);
    const chapters: Chapter[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const apiUrl =
        `${BASE_URL}/manga/${uuid}/feed` +
        `?limit=${CHAPTERS_LIMIT}` +
        `&offset=${offset}` +
        `&translatedLanguage[]=${__lang__}` +
        `&order[chapter]=asc` +
        `&includes[]=scanlation_group`;

      const resp = await fetch(apiUrl);
      const data = resp.json();

      if (!data?.data) {
        console.warn(`[MangaDex] getChapters: unexpected API response at offset ${offset} — stopping pagination`);
        break;
      }

      for (const ch of data.data) {
        const attrs = ch.attributes;

        // Ignora capítulos hospedados externamente (sem páginas no MangaDex)
        if (attrs.externalUrl) continue;

        // Extrai o nome do grupo de scanlation dos relationships
        let scanlator: string | undefined;
        if (ch.relationships) {
          for (const rel of ch.relationships) {
            if (
              rel.type === "scanlation_group" &&
              rel.attributes?.name
            ) {
              scanlator = rel.attributes.name;
              break;
            }
          }
        }

        chapters.push(
          new Chapter({
            id: ch.id,
            number: attrs.chapter || "0",
            name: "",
            title: attrs.title || undefined,
            date: attrs.publishAt
              ? parseDate(attrs.publishAt) ?? undefined
              : undefined,
            scanlator,
          })
        );
      }

      offset += CHAPTERS_LIMIT;
      hasMore = offset < (data.total || 0);
    }

    return chapters;
  }

  async getPages(chapter: Chapter): Promise<Pages> {
    const resp = await fetch(`${BASE_URL}/at-home/server/${chapter.id}`);
    const data = resp.json();

    if (!data?.chapter) {
      throw new Error(
        `Páginas não encontradas para capítulo: ${chapter.id}`
      );
    }

    const base = data.baseUrl;
    const hash = data.chapter.hash;
    const files: string[] = data.chapter.data;

    if (!files || files.length === 0) {
      throw new Error(
        `Capítulo sem páginas disponíveis: ${chapter.id}`
      );
    }

    const urls = files.map((f: string) => `${base}/data/${hash}/${f}`);

    return new Pages({
      id: chapter.id,
      number: chapter.number,
      name: chapter.name,
      urls,
    });
  }

  async getDetails(mangaId: string): Promise<any> {
    const uuid = extractId(mangaId);
    const resp = await fetch(
      `${BASE_URL}/manga/${uuid}?includes[]=cover_art&includes[]=author&includes[]=artist`
    );
    const data = resp.json();

    if (!data?.data) {
      throw new Error(`Detalhes não encontrados para: ${uuid}`);
    }

    const manga = data.data;
    const attrs = manga.attributes;
    const title = extractTitle(attrs.title);
    const cover = extractCover(uuid, manga.relationships);

    // Sinopse — prioriza idioma atual, depois en
    let synopsis: string | null = null;
    if (attrs.description) {
      if (attrs.description[__lang__]) {
        synopsis = attrs.description[__lang__];
      } else if (attrs.description.en) {
        synopsis = attrs.description.en;
      } else {
        const descKeys = Object.keys(attrs.description);
        if (descKeys.length > 0) {
          synopsis = attrs.description[descKeys[0]];
        }
      }
    }

    // Status
    const status = translateStatus(attrs.status);

    // Títulos alternativos
    const alt_titles: string[] = [];
    if (attrs.altTitles) {
      for (const altObj of attrs.altTitles) {
        for (const val of Object.values(altObj) as string[]) {
          alt_titles.push(val);
        }
      }
    }

    // Tags
    const tags: string[] = [];
    if (attrs.tags) {
      for (const tag of attrs.tags) {
        const tagName =
          tag.attributes?.name?.[__lang__] ||
          tag.attributes?.name?.en ||
          "";
        if (tagName) tags.push(tagName);
      }
    }

    // Autores e artistas a partir dos relationships
    const authors: string[] = [];
    const artists: string[] = [];
    if (manga.relationships) {
      for (const rel of manga.relationships) {
        if (rel.type === "author" && rel.attributes?.name) {
          authors.push(rel.attributes.name);
        }
        if (rel.type === "artist" && rel.attributes?.name) {
          artists.push(rel.attributes.name);
        }
      }
    }

    return {
      id: uuid,
      name: title,
      cover,
      synopsis,
      author: authors.length > 0 ? authors.join(", ") : undefined,
      artist: artists.length > 0 ? artists.join(", ") : undefined,
      status,
      alt_titles: alt_titles.length > 0 ? alt_titles : null,
      tags: tags.length > 0 ? tags : null,
    };
  }
}

// Expõe para o runtime Hagitori
(globalThis as any).__extension_class__ = MangaDexExtension;
(globalThis as any).__extension__ = new MangaDexExtension();
