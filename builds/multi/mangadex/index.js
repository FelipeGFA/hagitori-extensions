// Transpiled from mangadex.ts
"use strict";
(() => {
  // src/multi/mangadex/mangadex.ts
  var BASE_URL = "https://api.mangadex.org";
  var CHAPTERS_LIMIT = 100;
  var COVERS_BASE = "https://uploads.mangadex.org/covers";
  function extractId(url) {
    const parts = url.split("/");
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "title" && i + 1 < parts.length) {
        return parts[i + 1];
      }
    }
    return url;
  }
  function extractTitle(titles) {
    if (titles[__lang__]) return titles[__lang__];
    if (titles.en) return titles.en;
    if (titles["ja-ro"]) return titles["ja-ro"];
    const keys = Object.keys(titles);
    return keys.length > 0 ? titles[keys[0]] : "";
  }
  function extractCover(mangaId, relationships) {
    if (!relationships) return null;
    for (const rel of relationships) {
      if (rel.type === "cover_art" && rel.attributes?.fileName) {
        return `${COVERS_BASE}/${mangaId}/${rel.attributes.fileName}.256.jpg`;
      }
    }
    return null;
  }
  var STATUS_MAP = {
    "pt-br": { ongoing: "Em andamento", completed: "Completo", hiatus: "Hiato", cancelled: "Cancelado" },
    es: { ongoing: "En curso", completed: "Completado", hiatus: "Hiato", cancelled: "Cancelado" },
    "es-la": { ongoing: "En curso", completed: "Completado", hiatus: "Hiato", cancelled: "Cancelado" },
    fr: { ongoing: "En cours", completed: "Termin\xE9", hiatus: "Hiatus", cancelled: "Annul\xE9" },
    de: { ongoing: "Laufend", completed: "Abgeschlossen", hiatus: "Pause", cancelled: "Eingestellt" },
    it: { ongoing: "In corso", completed: "Completato", hiatus: "Pausa", cancelled: "Cancellato" },
    ru: { ongoing: "\u0412\u044B\u043F\u0443\u0441\u043A\u0430\u0435\u0442\u0441\u044F", completed: "\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E", hiatus: "\u041F\u0440\u0438\u043E\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E", cancelled: "\u041E\u0442\u043C\u0435\u043D\u0435\u043D\u043E" },
    ja: { ongoing: "\u9023\u8F09\u4E2D", completed: "\u5B8C\u7D50", hiatus: "\u4F11\u8F09", cancelled: "\u6253\u3061\u5207\u308A" },
    ko: { ongoing: "\uC5F0\uC7AC \uC911", completed: "\uC644\uACB0", hiatus: "\uD734\uC7AC", cancelled: "\uC911\uB2E8" },
    zh: { ongoing: "\u8FDE\u8F7D\u4E2D", completed: "\u5DF2\u5B8C\u7ED3", hiatus: "\u6682\u505C", cancelled: "\u53D6\u6D88" },
    en: { ongoing: "Ongoing", completed: "Completed", hiatus: "Hiatus", cancelled: "Cancelled" }
  };
  function translateStatus(status) {
    if (!status) return null;
    const map = STATUS_MAP[__lang__] || STATUS_MAP["en"];
    return map[status] || status;
  }
  var MangaDexExtension = class {
    async getManga(url) {
      const mangaId = extractId(url);
      const resp = await fetch(
        `${BASE_URL}/manga/${mangaId}?includes[]=cover_art`
      );
      const data = resp.json();
      if (!data?.data) {
        throw new Error(`Mang\xE1 n\xE3o encontrado: ${mangaId}`);
      }
      const manga = data.data;
      const title = extractTitle(manga.attributes.title);
      if (!title) {
        throw new Error(`Failed to extract title for manga: ${mangaId}`);
      }
      const cover = extractCover(mangaId, manga.relationships);
      return new Manga({ id: manga.id, name: title, cover: cover ?? void 0 });
    }
    async getChapters(mangaId) {
      const uuid = extractId(mangaId);
      const chapters = [];
      let offset = 0;
      let hasMore = true;
      while (hasMore) {
        const apiUrl = `${BASE_URL}/manga/${uuid}/feed?limit=${CHAPTERS_LIMIT}&offset=${offset}&translatedLanguage[]=${__lang__}&order[chapter]=asc&includes[]=scanlation_group`;
        const resp = await fetch(apiUrl);
        const data = resp.json();
        if (!data?.data) {
          console.warn(`[MangaDex] getChapters: unexpected API response at offset ${offset} \u2014 stopping pagination`);
          break;
        }
        for (const ch of data.data) {
          const attrs = ch.attributes;
          if (attrs.externalUrl) continue;
          let scanlator;
          if (ch.relationships) {
            for (const rel of ch.relationships) {
              if (rel.type === "scanlation_group" && rel.attributes?.name) {
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
              title: attrs.title || void 0,
              date: attrs.publishAt ? parseDate(attrs.publishAt) ?? void 0 : void 0,
              scanlator
            })
          );
        }
        offset += CHAPTERS_LIMIT;
        hasMore = offset < (data.total || 0);
      }
      return chapters;
    }
    async getPages(chapter) {
      const resp = await fetch(`${BASE_URL}/at-home/server/${chapter.id}`);
      const data = resp.json();
      if (!data?.chapter) {
        throw new Error(
          `P\xE1ginas n\xE3o encontradas para cap\xEDtulo: ${chapter.id}`
        );
      }
      const base = data.baseUrl;
      const hash = data.chapter.hash;
      const files = data.chapter.data;
      if (!files || files.length === 0) {
        throw new Error(
          `Cap\xEDtulo sem p\xE1ginas dispon\xEDveis: ${chapter.id}`
        );
      }
      const urls = files.map((f) => `${base}/data/${hash}/${f}`);
      return new Pages({
        id: chapter.id,
        number: chapter.number,
        name: chapter.name,
        urls
      });
    }
    async getDetails(mangaId) {
      const uuid = extractId(mangaId);
      const resp = await fetch(
        `${BASE_URL}/manga/${uuid}?includes[]=cover_art&includes[]=author&includes[]=artist`
      );
      const data = resp.json();
      if (!data?.data) {
        throw new Error(`Detalhes n\xE3o encontrados para: ${uuid}`);
      }
      const manga = data.data;
      const attrs = manga.attributes;
      const title = extractTitle(attrs.title);
      const cover = extractCover(uuid, manga.relationships);
      let synopsis = null;
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
      const status = translateStatus(attrs.status);
      const alt_titles = [];
      if (attrs.altTitles) {
        for (const altObj of attrs.altTitles) {
          for (const val of Object.values(altObj)) {
            alt_titles.push(val);
          }
        }
      }
      const tags = [];
      if (attrs.tags) {
        for (const tag of attrs.tags) {
          const tagName = tag.attributes?.name?.[__lang__] || tag.attributes?.name?.en || "";
          if (tagName) tags.push(tagName);
        }
      }
      const authors = [];
      const artists = [];
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
        author: authors.length > 0 ? authors.join(", ") : void 0,
        artist: artists.length > 0 ? artists.join(", ") : void 0,
        status,
        alt_titles: alt_titles.length > 0 ? alt_titles : null,
        tags: tags.length > 0 ? tags : null
      };
    }
  };
  globalThis.__extension_class__ = MangaDexExtension;
  globalThis.__extension__ = new MangaDexExtension();
})();
