// Transpiled from sakuramangas.ts
"use strict";
(() => {
  // src/pt-br/sakuramangas/helpers.ts
  var BASE_URL = "https://sakuramangas.org";
  var CHAPTERS_API = `${BASE_URL}/dist/sakura/models/manga/.__obf__manga_capitulos.php`;
  var WAIT_SECONDS = 10;
  var WAIT_SECONDS_PAGES = 8;
  var IMG_ACCEPT = "image/avif,image/webp,image/jpeg,image/png,image/svg+xml,image/*,*/*;q=0.8";
  var IMG_CONTENT_TYPE = "application/octet-stream";
  var IMG_ACCEPT_LANG = "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,es;q=0.5";
  var IMG_X_REQUESTED_WITH = "ab4741de32I128opk";
  var IMG_X_SIGNATURE_VERSION = "v5-fetch-secure";
  function generateXRealtime() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
  var cachedAuth = null;
  var cachedSecHeaders = null;
  var cachedChaptersData = null;
  var cachedMangaInfo = null;
  var cfBypassed = false;
  function setCachedAuth(v) {
    cachedAuth = v;
  }
  function setCachedSecHeaders(v) {
    cachedSecHeaders = v;
  }
  function setCachedChaptersData(v) {
    cachedChaptersData = v;
  }
  function setCachedMangaInfo(v) {
    cachedMangaInfo = v;
  }
  function setCfBypassed(v) {
    cfBypassed = v;
  }
  function extractSlug(url) {
    if (url.startsWith("http")) {
      url = url.replace(/^https?:\/\/sakuramangas\.org\/?/, "");
    }
    return url.replace(/^\//, "").replace(/\/$/, "");
  }
  function parseFormBody(body) {
    if (!body) return {};
    const params = {};
    for (const pair of body.split("&")) {
      const parts = pair.split("=");
      if (parts.length >= 2) {
        params[decodeURIComponent(parts[0])] = decodeURIComponent(
          parts.slice(1).join("=")
        );
      }
    }
    return params;
  }
  function parseChaptersResponse(data, mangaId) {
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch (e) {
        throw new Error(`[SakuraMang\xE1s] failed to parse chapters response as JSON: ${e}`);
      }
    }
    let chapterList = [];
    let hasMore = false;
    if (data?.data && Array.isArray(data.data)) {
      chapterList = data.data;
      hasMore = !!data.has_more;
    } else if (Array.isArray(data)) {
      chapterList = data;
    }
    const chapters = [];
    for (let i = 0; i < chapterList.length; i++) {
      const ch = chapterList[i];
      const chNum = ch.numero || ch.number || String(i + 1);
      let chUrl = "";
      let chTitle = "";
      let scanlator;
      if (ch.versoes && ch.versoes.length > 0) {
        const versao = ch.versoes[0];
        if (versao.url) {
          chUrl = versao.url;
          if (chUrl.startsWith("/")) chUrl = chUrl.substring(1);
        }
        if (versao.titulo) chTitle = versao.titulo;
        if (versao.scans?.length && versao.scans[0].nome) {
          scanlator = versao.scans[0].nome;
        }
      }
      if (!chUrl) {
        chUrl = `${mangaId}/${String(chNum).replace(".", "-")}`;
      }
      const date = ch.data_timestamp ? parseDate(String(ch.data_timestamp)) ?? void 0 : void 0;
      chapters.push(
        new Chapter({
          id: String(chUrl),
          number: String(chNum),
          name: mangaId,
          title: chTitle || void 0,
          date,
          scanlator
        })
      );
    }
    return { chapters, hasMore };
  }
  function extractAuth(requests, fullUrl) {
    for (const req of requests) {
      if (!req.url.includes("__obf__manga_capitulos") || !req.postBody) continue;
      const params = parseFormBody(req.postBody);
      const auth = {
        proof: params.proof || "",
        challenge: params.challenge || "",
        mangaApiId: params.manga_id || ""
      };
      const headers = {
        Accept: "*/*",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Origin: BASE_URL,
        Referer: fullUrl,
        "X-Requested-With": "XMLHttpRequest",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin"
      };
      if (req.headers) {
        for (const [key, value] of Object.entries(req.headers)) {
          const k = key.toLowerCase();
          if (k === "x-csrf-token") headers["X-CSRF-Token"] = value;
          else if (k === "x-client-signature") headers["X-Client-Signature"] = value;
          else if (k === "x-verification-key-1") headers["X-Verification-Key-1"] = value;
          else if (k === "x-verification-key-2") headers["X-Verification-Key-2"] = value;
          else if (k === "x-requested-with" && value !== "XMLHttpRequest") {
            headers["X-Requested-With"] = value;
          }
        }
      }
      return { auth, headers };
    }
    return null;
  }
  function tryParseBody(body) {
    if (typeof body === "string") {
      try {
        return JSON.parse(body);
      } catch {
        return null;
      }
    }
    return body ?? null;
  }
  function findMangaResponse(responses) {
    for (const resp of responses) {
      const body = tryParseBody(resp.body);
      if (body && (body.titulo || body.title)) return body;
    }
    return null;
  }
  function findChaptersResponse(responses) {
    for (const resp of responses) {
      if (!(resp.url || "").includes("__obf__manga_capitulos")) continue;
      const body = tryParseBody(resp.body);
      if (body) return body;
    }
    return null;
  }
  async function ensureCloudflareBypass() {
    if (cfBypassed) return;
    console.log("[SakuraMang\xE1s] Iniciando bypass de Cloudflare...");
    const result = await browser.bypassCloudflare(BASE_URL);
    if (result.hasCfClearance) {
      console.log("[SakuraMang\xE1s] Bypass OK \u2014 cf_clearance obtido");
    } else {
      console.warn("[SakuraMang\xE1s] Bypass conclu\xEDdo sem cf_clearance");
    }
    setCfBypassed(true);
  }

  // src/pt-br/sakuramangas/sakuramangas.ts
  var SakuraMangasExtension = class {
    async getManga(url) {
      setCachedMangaInfo(null);
      setCachedChaptersData(null);
      const slug = extractSlug(url);
      const fullUrl = `${BASE_URL}/${slug}`;
      await ensureCloudflareBypass();
      const pageData = await browser.intercept(fullUrl, {
        requests: ["__obf__manga_capitulos", "__obf__manga_info"],
        responses: ["__obf__manga_info", "__obf__manga_capitulos"],
        waitTime: WAIT_SECONDS
      });
      const mangaData = findMangaResponse(pageData.responses);
      if (!mangaData) {
        throw new Error(
          "N\xE3o foi poss\xEDvel obter informa\xE7\xF5es do mang\xE1. Tente novamente."
        );
      }
      setCachedMangaInfo(mangaData);
      const title = mangaData.titulo || mangaData.title || slug;
      const coverUrl = `${BASE_URL}/${slug}/thumb_256.jpg`;
      const manga = new Manga({ id: slug, name: title, cover: coverUrl });
      const authResult = extractAuth(pageData.requests, fullUrl);
      if (authResult) {
        setCachedAuth(authResult.auth);
        setCachedSecHeaders(authResult.headers);
      }
      const chaptersBody = findChaptersResponse(pageData.responses);
      if (chaptersBody) setCachedChaptersData(chaptersBody);
      return manga;
    }
    async getChapters(mangaId) {
      let allChapters = [];
      let hasMore = false;
      let offset = 0;
      const limit = 100;
      if (cachedChaptersData) {
        const initialBatch = parseChaptersResponse(cachedChaptersData, mangaId);
        allChapters = initialBatch.chapters;
        hasMore = initialBatch.hasMore;
        setCachedChaptersData(null);
        if (!hasMore) {
          await browser.close();
          setCfBypassed(false);
          return allChapters;
        }
        offset = allChapters.length;
      }
      if (!cachedAuth?.proof || !cachedSecHeaders) {
        console.warn("[SakuraMang\xE1s] auth/security headers not found \u2014 chapter pagination disabled, returning cached chapters only");
        await browser.close();
        setCfBypassed(false);
        return allChapters;
      }
      let pageCount = 0;
      while (hasMore && pageCount < 100) {
        pageCount++;
        const formFields = {
          manga_id: cachedAuth.mangaApiId,
          offset: String(offset),
          order: "desc",
          limit: String(limit),
          challenge: cachedAuth.challenge,
          proof: cachedAuth.proof
        };
        const resp = await fetch(CHAPTERS_API, {
          method: "POST",
          headers: { ...cachedSecHeaders },
          form: formFields
        });
        if (resp.status !== 200) {
          console.warn(`[SakuraMang\xE1s] chapters API returned status ${resp.status} at offset ${offset} \u2014 stopping pagination`);
          break;
        }
        const batch = parseChaptersResponse(resp.json(), mangaId);
        allChapters = allChapters.concat(batch.chapters);
        hasMore = batch.hasMore;
        if (!hasMore) break;
        offset += limit;
      }
      await browser.close();
      setCfBypassed(false);
      return allChapters;
    }
    async getPages(chapter) {
      let chapterId = chapter.id;
      if (!chapterId.endsWith("/")) chapterId += "/";
      const fullUrl = `${BASE_URL}/${chapterId}`;
      await ensureCloudflareBypass();
      const pageData = await browser.intercept(fullUrl, {
        requests: ["/imagens/"],
        responses: ["capitulos__read", "capitulo"],
        waitTime: WAIT_SECONDS_PAGES
      });
      let imageHash = null;
      let imageExtension = "jpg";
      for (const req of pageData.requests) {
        const match = req.url.match(
          /\/imagens\/([a-f0-9]{32,})\/(\d{3})\.(jpg|png|webp|gif)/i
        );
        if (match) {
          imageHash = match[1];
          imageExtension = match[3].toLowerCase();
          break;
        }
      }
      let numPages = 0;
      for (const resp of pageData.responses) {
        const body = tryParseBody(resp.body);
        if (body && typeof body.numPages === "number" && body.numPages > 0) {
          numPages = body.numPages;
          if (!imageHash && body.hash) imageHash = body.hash;
          break;
        }
      }
      if (!imageHash) {
        throw new Error(
          "N\xE3o foi poss\xEDvel obter o hash da imagem. Tente novamente."
        );
      }
      if (numPages <= 0) {
        let maxPage = 0;
        for (const req of pageData.requests) {
          const pm = req.url.match(/\/imagens\/[a-f0-9]+\/(\d{3})\./i);
          if (pm) {
            const pn = parseInt(pm[1]);
            if (pn > maxPage) maxPage = pn;
          }
        }
        if (maxPage <= 0) {
          throw new Error(
            "N\xE3o foi poss\xEDvel determinar o n\xFAmero de p\xE1ginas do cap\xEDtulo. Tente novamente."
          );
        }
        numPages = maxPage;
      }
      const pageUrls = [];
      for (let p = 1; p <= numPages; p++) {
        const padded = String(p).padStart(3, "0");
        pageUrls.push(
          `${BASE_URL}/imagens/${imageHash}/${padded}.${imageExtension}`
        );
      }
      const imgHeaders = {
        Accept: IMG_ACCEPT,
        "Content-Type": IMG_CONTENT_TYPE,
        "Accept-Language": IMG_ACCEPT_LANG,
        "X-Requested-With": IMG_X_REQUESTED_WITH,
        "X-Signature-Version": IMG_X_SIGNATURE_VERSION,
        "X-Realtime": generateXRealtime(),
        Referer: fullUrl,
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        Pragma: "no-cache",
        "Cache-Control": "no-cache"
      };
      return new Pages({
        id: chapter.id,
        number: chapter.number,
        name: chapter.name,
        urls: pageUrls,
        useBrowser: false,
        headers: imgHeaders
      });
    }
    async getDetails(mangaId) {
      let data = cachedMangaInfo;
      if (!data) {
        const fullUrl = `${BASE_URL}/${mangaId}`;
        await ensureCloudflareBypass();
        const pageData = await browser.intercept(fullUrl, {
          responses: ["__obf__manga_info"],
          waitTime: WAIT_SECONDS
        });
        data = findMangaResponse(pageData.responses);
        if (!data) {
          throw new Error(
            "N\xE3o foi poss\xEDvel obter detalhes do mang\xE1. Tente novamente."
          );
        }
      }
      const title = data.titulo || data.title || mangaId;
      const cover = `${BASE_URL}/${mangaId}/thumb_256.jpg`;
      const synopsis = data.sinopse || null;
      let status = null;
      if (data.status) {
        const st = data.status.toLowerCase();
        if (st === "em andamento" || st === "ativo") status = "Em andamento";
        else if (st === "completo" || st === "finalizado") status = "Completo";
        else if (st === "cancelado") status = "Cancelado";
        else if (st === "hiato" || st === "em hiato") status = "Hiato";
        else status = data.status;
      }
      const tags = data.tags && Array.isArray(data.tags) && data.tags.length > 0 ? data.tags : null;
      const alt_titles = [];
      if (data.demografia) alt_titles.push(`Demografia: ${data.demografia}`);
      if (data.ano) alt_titles.push(`Ano: ${data.ano}`);
      return {
        id: mangaId,
        name: title,
        cover,
        synopsis,
        author: data.autor || void 0,
        artist: data.artista || void 0,
        status,
        alt_titles: alt_titles.length > 0 ? alt_titles : null,
        tags
      };
    }
  };
  globalThis.__extension_class__ = SakuraMangasExtension;
  globalThis.__extension__ = new SakuraMangasExtension();
})();
