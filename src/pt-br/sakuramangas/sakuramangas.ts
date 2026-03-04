// SakuraMangás — sakuramangas.org
// Browser-based extension with request/response interception for auth and chapters

import * as h from "./helpers";

// ═══════════════════════════════════════════════════════════════
// EXTENSION
// ═══════════════════════════════════════════════════════════════

class SakuraMangasExtension implements HagitoriExtension {

  async getManga(url: string): Promise<Manga> {
    h.setCachedMangaInfo(null);
    h.setCachedChaptersData(null);

    const slug = h.extractSlug(url);
    const fullUrl = `${h.BASE_URL}/${slug}`;

    // Bypass Cloudflare se necessário (propaga cookies para session store)
    await h.ensureCloudflareBypass();

    const pageData = await browser.intercept(fullUrl, {
      requests: ["__obf__manga_capitulos", "__obf__manga_info"],
      responses: ["__obf__manga_info", "__obf__manga_capitulos"],
      waitTime: h.WAIT_SECONDS,
    });

    // Extract manga data from intercepted responses
    const mangaData = h.findMangaResponse(pageData.responses);
    if (!mangaData) {
      throw new Error(
        "Não foi possível obter informações do mangá. Tente novamente."
      );
    }
    h.setCachedMangaInfo(mangaData);

    const title = mangaData.titulo || mangaData.title || slug;
    const coverUrl = `${h.BASE_URL}/${slug}/thumb_256.jpg`;
    const manga = new Manga({ id: slug, name: title, cover: coverUrl });

    // Extract auth + security headers from intercepted POST
    const authResult = h.extractAuth(pageData.requests, fullUrl);
    if (authResult) {
      h.setCachedAuth(authResult.auth);
      h.setCachedSecHeaders(authResult.headers);
    }

    // Cache chapters from intercepted response
    const chaptersBody = h.findChaptersResponse(pageData.responses);
    if (chaptersBody) h.setCachedChaptersData(chaptersBody);

    return manga;
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    let allChapters: Chapter[] = [];
    let hasMore = false;
    let offset = 0;
    const limit = 100;

    // Use chapters cached from getManga intercepted response
    if (h.cachedChaptersData) {
      const initialBatch = h.parseChaptersResponse(h.cachedChaptersData, mangaId);
      allChapters = initialBatch.chapters;
      hasMore = initialBatch.hasMore;
      h.setCachedChaptersData(null);

      if (!hasMore) {
        await browser.close();
        h.setCfBypassed(false);
        return allChapters;
      }
      offset = allChapters.length;
    }

    if (!h.cachedAuth?.proof || !h.cachedSecHeaders) {
      console.warn("[SakuraMangás] auth/security headers not found — chapter pagination disabled, returning cached chapters only");
      await browser.close();
      h.setCfBypassed(false);
      return allChapters;
    }

    let pageCount = 0;
    while (hasMore && pageCount < 100) {
      pageCount++;

      const formFields: Record<string, string> = {
        manga_id: h.cachedAuth.mangaApiId,
        offset: String(offset),
        order: "desc",
        limit: String(limit),
        challenge: h.cachedAuth.challenge,
        proof: h.cachedAuth.proof,
      };

      const resp = await fetch(h.CHAPTERS_API, {
        method: "POST",
        headers: { ...h.cachedSecHeaders },
        form: formFields,
      });

      if (resp.status !== 200) {
        console.warn(`[SakuraMangás] chapters API returned status ${resp.status} at offset ${offset} — stopping pagination`);
        break;
      }

      const batch = h.parseChaptersResponse(resp.json(), mangaId);
      allChapters = allChapters.concat(batch.chapters);
      hasMore = batch.hasMore;

      if (!hasMore) break;
      offset += limit;
    }

    await browser.close();
    h.setCfBypassed(false);

    return allChapters;
  }

  async getPages(chapter: Chapter): Promise<Pages> {
    let chapterId = chapter.id;
    if (!chapterId.endsWith("/")) chapterId += "/";
    const fullUrl = `${h.BASE_URL}/${chapterId}`;

    // Bypass Cloudflare se necessário
    await h.ensureCloudflareBypass();

    const pageData = await browser.intercept(fullUrl, {
      requests: ["/imagens/"],
      responses: ["capitulos__read", "capitulo"],
      waitTime: h.WAIT_SECONDS_PAGES,
    });

    // Extract imageHash and extension from first image request
    let imageHash: string | null = null;
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

    // Extract numPages from responses
    let numPages = 0;
    for (const resp of pageData.responses) {
      const body = h.tryParseBody(resp.body);
      if (body && typeof body.numPages === "number" && body.numPages > 0) {
        numPages = body.numPages;
        if (!imageHash && body.hash) imageHash = body.hash;
        break;
      }
    }

    if (!imageHash) {
      throw new Error(
        "Não foi possível obter o hash da imagem. Tente novamente."
      );
    }

    if (numPages <= 0) {
      // Fallback: count pages from intercepted requests
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
          "Não foi possível determinar o número de páginas do capítulo. Tente novamente."
        );
      }
      numPages = maxPage;
    }

    // Build image URLs
    const pageUrls: string[] = [];
    for (let p = 1; p <= numPages; p++) {
      const padded = String(p).padStart(3, "0");
      pageUrls.push(
        `${h.BASE_URL}/imagens/${imageHash}/${padded}.${imageExtension}`
      );
    }

    // Build image headers — custom headers exigidos pelo site.
    // Cookie (cf_clearance) e User-Agent são propagados automaticamente
    // pelo session store do Hagitori (via bypassCloudflare).
    // NÃO incluir Cookie/User-Agent aqui pois Pages.headers sobrescrevem
    // o session store (overriding o cf_clearance/UA do bypass).
    const imgHeaders: Record<string, string> = {
      Accept: h.IMG_ACCEPT,
      "Content-Type": h.IMG_CONTENT_TYPE,
      "Accept-Language": h.IMG_ACCEPT_LANG,
      "X-Requested-With": h.IMG_X_REQUESTED_WITH,
      "X-Signature-Version": h.IMG_X_SIGNATURE_VERSION,
      "X-Realtime": h.generateXRealtime(),
      Referer: fullUrl,
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
    };

    return new Pages({
      id: chapter.id,
      number: chapter.number,
      name: chapter.name,
      urls: pageUrls,
      useBrowser: false,
      headers: imgHeaders,
    });
  }

  async getDetails(mangaId: string): Promise<any> {
    let data = h.cachedMangaInfo;

    if (!data) {
      const fullUrl = `${h.BASE_URL}/${mangaId}`;

      // Bypass Cloudflare se necessário
      await h.ensureCloudflareBypass();

      const pageData = await browser.intercept(fullUrl, {
        responses: ["__obf__manga_info"],
        waitTime: h.WAIT_SECONDS,
      });
      data = h.findMangaResponse(pageData.responses);

      if (!data) {
        throw new Error(
          "Não foi possível obter detalhes do mangá. Tente novamente."
        );
      }
    }

    const title = data.titulo || data.title || mangaId;
    const cover = `${h.BASE_URL}/${mangaId}/thumb_256.jpg`;
    const synopsis: string | null = data.sinopse || null;

    // Status mapping
    let status: string | null = null;
    if (data.status) {
      const st = data.status.toLowerCase();
      if (st === "em andamento" || st === "ativo") status = "Em andamento";
      else if (st === "completo" || st === "finalizado") status = "Completo";
      else if (st === "cancelado") status = "Cancelado";
      else if (st === "hiato" || st === "em hiato") status = "Hiato";
      else status = data.status;
    }

    const tags: string[] | null =
      data.tags && Array.isArray(data.tags) && data.tags.length > 0
        ? data.tags
        : null;

    const alt_titles: string[] = [];
    if (data.demografia) alt_titles.push(`Demografia: ${data.demografia}`);
    if (data.ano) alt_titles.push(`Ano: ${data.ano}`);

    return {
      id: mangaId,
      name: title,
      cover,
      synopsis,
      author: data.autor || undefined,
      artist: data.artista || undefined,
      status,
      alt_titles: alt_titles.length > 0 ? alt_titles : null,
      tags,
    };
  }
}

// Expose to the Hagitori runtime
(globalThis as any).__extension_class__ = SakuraMangasExtension;
(globalThis as any).__extension__ = new SakuraMangasExtension();
