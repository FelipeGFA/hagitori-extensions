// Transpiled from mangalivre.ts
"use strict";
(() => {
  // src/templates/madara/Madara.ts
  var DEFAULT_SELECTORS = {
    title: "div.post-title h3, div.post-title h1, #manga-title > h1",
    author: "div.author-content > a",
    artist: "div.artist-content > a",
    status: "div.summary-content",
    description: "div.description-summary div.summary__content, div.summary_content div.post-content_item > h5 + div, div.summary_content div.manga-excerpt",
    thumbnail: "div.summary_image img",
    genre: "div.genres-content a",
    chapterList: "li.wp-manga-chapter",
    chapterLink: "a",
    chapterDate: "span.chapter-release-date",
    pageImage: "div.page-break img, li.blocks-gallery-item img, .reading-content .text-left img"
  };
  var Madara = class {
    baseUrl;
    mangaPath;
    useAjaxChapters;
    useNewChapterEndpoint;
    chapterUrlSuffix;
    selectors;
    dateFormat;
    constructor(config) {
      this.baseUrl = config.baseUrl.replace(/\/+$/, "");
      this.mangaPath = config.mangaPath ?? "manga";
      this.useAjaxChapters = config.useAjaxChapters ?? true;
      this.useNewChapterEndpoint = config.useNewChapterEndpoint ?? true;
      this.chapterUrlSuffix = config.chapterUrlSuffix ?? "?style=list";
      this.selectors = { ...DEFAULT_SELECTORS, ...config.selectors };
      this.dateFormat = config.dateFormat ?? "MMMM dd, yyyy";
    }
    async getManga(url) {
      const slug = this.extractSlug(url);
      const fullUrl = `${this.baseUrl}/${this.mangaPath}/${slug}/`;
      console.log(`[Madara] getManga: slug=${slug}, url=${fullUrl}`);
      const resp = await fetch(fullUrl, {
        headers: this.defaultHeaders()
      });
      const html = resp.text();
      console.log(`[Madara] getManga: status=${resp.status}, body=${html.length} chars`);
      if (html.length < 500) {
        console.log(`[Madara] getManga: body=${html}`);
      } else {
        console.log(`[Madara] getManga: body preview=${html.substring(0, 300)}`);
      }
      const doc = parseHtml(html);
      const title = this.parseTitle(doc);
      const cover = this.parseThumbnail(doc);
      console.log(`[Madara] getManga: title="${title}", cover=${cover ? "yes" : "none"}`);
      if (!title) {
        throw new Error(`[Madara] Failed to extract manga title from ${fullUrl}`);
      }
      return new Manga({ id: slug, name: title, cover });
    }
    async getChapters(mangaId) {
      const mangaUrl = `${this.baseUrl}/${this.mangaPath}/${mangaId}/`;
      let doc;
      if (this.useAjaxChapters) {
        const ajaxUrl = this.useNewChapterEndpoint ? `${mangaUrl}ajax/chapters/` : `${this.baseUrl}/wp-admin/admin-ajax.php`;
        console.log(`[Madara] getChapters: POST ${ajaxUrl}`);
        const resp = this.useNewChapterEndpoint ? await fetch(ajaxUrl, {
          method: "POST",
          headers: this.ajaxHeaders(),
          // empty form body — Madara expects x-www-form-urlencoded, not JSON
          form: {}
        }) : await fetch(ajaxUrl, {
          method: "POST",
          headers: this.ajaxHeaders(),
          form: {
            action: "manga_get_chapters",
            manga: mangaId
          }
        });
        const html = resp.text();
        console.log(`[Madara] getChapters: status=${resp.status}, body=${html.length} chars`);
        doc = parseHtml(html);
      } else {
        const resp = await fetch(mangaUrl, {
          headers: this.defaultHeaders()
        });
        doc = parseHtml(resp.text());
      }
      const elements = doc.select(this.selectors.chapterList);
      const chapters = [];
      console.log(`[Madara] getChapters: found ${elements.length} chapter elements (selector: ${this.selectors.chapterList})`);
      for (const el of elements) {
        const link = el.selectOne(this.selectors.chapterLink);
        if (!link) {
          console.warn(`[Madara] chapter element has no link \u2014 skipped`);
          continue;
        }
        const href = link.attr("href") ?? "";
        const chapterName = link.text().trim();
        const number = this.extractChapterNumber(chapterName);
        const dateEl = el.selectOne(this.selectors.chapterDate);
        const dateText = dateEl?.text().trim() ?? "";
        const date = this.parseChapterDate(dateText);
        chapters.push(
          new Chapter({
            id: this.normalizeChapterUrl(href),
            number,
            name: mangaId,
            title: chapterName,
            date: date ?? void 0
          })
        );
      }
      return chapters;
    }
    async getPages(chapter) {
      let url = chapter.id;
      if (!url.startsWith("http")) {
        url = `${this.baseUrl}${url}`;
      }
      if (!url.includes("style=")) {
        url = url.replace(/\?.*$/, "") + this.chapterUrlSuffix;
      }
      const resp = await fetch(url, {
        headers: this.defaultHeaders()
      });
      const doc = parseHtml(resp.text());
      const images = doc.select(this.selectors.pageImage);
      const urls = [];
      for (const img of images) {
        const src = img.attr("data-src") ?? img.attr("data-lazy-src") ?? img.attr("src");
        if (src) {
          urls.push(src.trim());
        }
      }
      if (urls.length === 0) {
        throw new Error(`[Madara] No page images found for chapter ${chapter.id}`);
      }
      return new Pages({
        id: chapter.id,
        number: chapter.number,
        name: chapter.name,
        urls,
        headers: { Referer: `${this.baseUrl}/` }
      });
    }
    async getDetails(mangaId) {
      const mangaUrl = `${this.baseUrl}/${this.mangaPath}/${mangaId}/`;
      const resp = await fetch(mangaUrl, {
        headers: this.defaultHeaders()
      });
      const doc = parseHtml(resp.text());
      const title = this.parseTitle(doc);
      const cover = this.parseThumbnail(doc);
      const synopsis = this.parseDescription(doc);
      const status = this.parseStatus(doc);
      const tags = this.parseTags(doc);
      const author = doc.select(this.selectors.author).map((el) => el.text().trim()).filter(Boolean).join(", ");
      const artist = doc.select(this.selectors.artist).map((el) => el.text().trim()).filter(Boolean).join(", ");
      return {
        id: mangaId,
        name: title,
        cover,
        synopsis,
        author: author || void 0,
        artist: artist || void 0,
        status,
        tags: tags.length > 0 ? tags : void 0
      };
    }
    // Overridable helpers
    defaultHeaders() {
      return { Referer: `${this.baseUrl}/` };
    }
    /**
     * Headers for AJAX/XHR requests (POST to ajax endpoints).
     * Override in subclasses for CF-protected sites that need sec-fetch-* headers.
     */
    ajaxHeaders() {
      return {
        ...this.defaultHeaders(),
        "X-Requested-With": "XMLHttpRequest"
      };
    }
    parseTitle(doc) {
      const el = doc.selectOne(this.selectors.title);
      return el?.text().trim() ?? "";
    }
    parseThumbnail(doc) {
      const el = doc.selectOne(this.selectors.thumbnail);
      if (!el) return void 0;
      return el.attr("data-src") ?? el.attr("data-lazy-src") ?? el.attr("srcset")?.split(" ").find((s) => s.startsWith("http")) ?? el.attr("src") ?? void 0;
    }
    parseDescription(doc) {
      const el = doc.selectOne(this.selectors.description);
      if (!el) return void 0;
      const text = el.text().trim();
      return text || void 0;
    }
    parseStatus(doc) {
      const els = doc.select(this.selectors.status);
      const last = els.length > 0 ? els[els.length - 1] : null;
      if (!last) return void 0;
      const raw = last.text().trim().toLowerCase();
      const completed = ["completed", "completo", "completado", "conclu\xEDdo", "finalizado", "termin\xE9"];
      const ongoing = ["ongoing", "updating", "em lan\xE7amento", "em andamento", "en cours", "ativo"];
      const hiatus = ["on hold", "pausado", "en espera"];
      const canceled = ["canceled", "cancelado"];
      if (completed.some((s) => raw.includes(s))) return "Completed";
      if (ongoing.some((s) => raw.includes(s))) return "Ongoing";
      if (hiatus.some((s) => raw.includes(s))) return "On Hold";
      if (canceled.some((s) => raw.includes(s))) return "Canceled";
      return void 0;
    }
    parseTags(doc) {
      return doc.select(this.selectors.genre).map((el) => el.text().trim()).filter(Boolean);
    }
    extractSlug(url) {
      const cleaned = url.replace(/\/+$/, "");
      const parts = cleaned.split("/");
      return parts[parts.length - 1];
    }
    extractChapterNumber(text) {
      const match = text.match(/(?:chapter|cap[ií]tulo|ch\.?)\s*([\d.]+)/i);
      if (match) return match[1];
      const numMatch = text.match(/([\d.]+)/);
      return numMatch ? numMatch[1] : "0";
    }
    normalizeChapterUrl(href) {
      if (href.startsWith("http")) {
        const match = href.match(/^https?:\/\/[^/]+(\/.*)/);
        return match ? match[1] : href;
      }
      return href;
    }
    parseChapterDate(dateStr) {
      if (!dateStr) return null;
      const lower = dateStr.toLowerCase().trim();
      if (lower.includes("ago") || lower.includes("atr\xE1s")) {
        return null;
      }
      return parseDate(dateStr) ?? null;
    }
  };

  // src/pt-br/mangalivre/mangalivre.ts
  var MangaLivre = class extends Madara {
    cfBypassed = false;
    chromeMajor = "145";
    chromeFullVersion = "145.0.0.0";
    constructor() {
      super({
        baseUrl: "https://mangalivre.tv",
        mangaPath: "manga",
        useAjaxChapters: true,
        useNewChapterEndpoint: true,
        chapterUrlSuffix: "?style=list",
        selectors: {
          chapterList: "li.wp-manga-chapter, li.chapter-li",
          pageImage: ".reading-content .page-break img.wp-manga-chapter-img[src]"
        }
      });
    }
    /**
     * Garante que o bypass de Cloudflare foi feito antes de qualquer requisição.
     * Cookies e User-Agent são propagados automaticamente para o session store,
     * então fetch() subsequentes já os incluem.
     * Também extrai a versão do Chrome para gerar os headers sec-ch-ua.
     */
    async ensureCloudflareBypass() {
      if (this.cfBypassed) return;
      console.log("[MangaLivre] Iniciando bypass de Cloudflare...");
      const result = await browser.bypassCloudflare(this.baseUrl);
      if (result.hasCfClearance) {
        console.log("[MangaLivre] Bypass OK \u2014 cf_clearance obtido");
      } else {
        console.warn("[MangaLivre] Bypass conclu\xEDdo sem cf_clearance \u2014 requests podem falhar");
      }
      const versionMatch = result.userAgent.match(/Chrome\/(\d+)\.(\d+\.\d+\.\d+)/);
      if (versionMatch) {
        this.chromeMajor = versionMatch[1];
        this.chromeFullVersion = `${versionMatch[1]}.${versionMatch[2]}`;
        console.log(`[MangaLivre] Chrome version: ${this.chromeFullVersion}`);
      }
      this.cfBypassed = true;
    }
    async getManga(url) {
      await this.ensureCloudflareBypass();
      return super.getManga(url);
    }
    async getChapters(mangaId) {
      await this.ensureCloudflareBypass();
      return super.getChapters(mangaId);
    }
    async getPages(chapter) {
      await this.ensureCloudflareBypass();
      return super.getPages(chapter);
    }
    async getDetails(mangaId) {
      await this.ensureCloudflareBypass();
      return super.getDetails(mangaId);
    }
    /**
     * Headers padrão para requisições de navegação (GET pages).
     * Inclui sec-ch-ua (Client Hints) e sec-fetch (Fetch Metadata)
     * que Cloudflare valida para verificar que o request vem de um browser real.
     */
    defaultHeaders() {
      return {
        ...this.secChUaHeaders(),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        DNT: "1",
        Referer: `${this.baseUrl}/`,
        // Sec-Fetch for navigation requests (GET pages)
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
        "Priority": "u=0, i"
      };
    }
    /**
     * Headers para requisições AJAX (POST to ajax endpoints).
     * Usa sec-fetch-mode: cors em vez de navigate.
     */
    ajaxHeaders() {
      return {
        ...this.secChUaHeaders(),
        Accept: "*/*",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        DNT: "1",
        Referer: `${this.baseUrl}/`,
        Origin: this.baseUrl,
        "X-Requested-With": "XMLHttpRequest",
        // Sec-Fetch for AJAX requests
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        "Priority": "u=1, i"
      };
    }
    /**
     * Gera os headers sec-ch-ua (Client Hints) com base na versão do Chrome
     * detectada durante o bypass. São os "low entropy" hints que Chrome
     * envia automaticamente em todos os requests.
     */
    secChUaHeaders() {
      return {
        "Sec-CH-UA": `"Not:A-Brand";v="99", "Google Chrome";v="${this.chromeMajor}", "Chromium";v="${this.chromeMajor}"`,
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"Windows"'
      };
    }
  };
  globalThis.__extension_class__ = MangaLivre;
  globalThis.__extension__ = new MangaLivre();
})();
