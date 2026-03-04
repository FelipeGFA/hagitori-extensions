//based on Madara by Keiyoushi: https://github.com/keiyoushi/extensions-source/blob/main/lib-multisrc/madara/src/eu/kanade/tachiyomi/multisrc/madara/Madara.kt

export interface MadaraConfig {
  baseUrl: string;
  mangaPath?: string;
  useAjaxChapters?: boolean;
  useNewChapterEndpoint?: boolean;
  chapterUrlSuffix?: string;
  selectors?: Partial<MadaraSelectors>;
  dateFormat?: string;
}

export interface MadaraSelectors {
  title: string;
  author: string;
  artist: string;
  status: string;
  description: string;
  thumbnail: string;
  genre: string;
  chapterList: string;
  chapterLink: string;
  chapterDate: string;
  pageImage: string;
}

const DEFAULT_SELECTORS: MadaraSelectors = {
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
  pageImage: "div.page-break img, li.blocks-gallery-item img, .reading-content .text-left img",
};

export class Madara implements HagitoriExtension {
  protected baseUrl: string;
  protected mangaPath: string;
  protected useAjaxChapters: boolean;
  protected useNewChapterEndpoint: boolean;
  protected chapterUrlSuffix: string;
  protected selectors: MadaraSelectors;
  protected dateFormat: string;

  constructor(config: MadaraConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.mangaPath = config.mangaPath ?? "manga";
    this.useAjaxChapters = config.useAjaxChapters ?? true;
    this.useNewChapterEndpoint = config.useNewChapterEndpoint ?? true;
    this.chapterUrlSuffix = config.chapterUrlSuffix ?? "?style=list";
    this.selectors = { ...DEFAULT_SELECTORS, ...config.selectors };
    this.dateFormat = config.dateFormat ?? "MMMM dd, yyyy";
  }

  async getManga(url: string): Promise<Manga> {
    const slug = this.extractSlug(url);
    const fullUrl = `${this.baseUrl}/${this.mangaPath}/${slug}/`;

    console.log(`[Madara] getManga: slug=${slug}, url=${fullUrl}`);

    const resp = await fetch(fullUrl, {
      headers: this.defaultHeaders(),
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

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const mangaUrl = `${this.baseUrl}/${this.mangaPath}/${mangaId}/`;

    let doc: HtmlDocument;

    if (this.useAjaxChapters) {
      const ajaxUrl = this.useNewChapterEndpoint
        ? `${mangaUrl}ajax/chapters/`
        : `${this.baseUrl}/wp-admin/admin-ajax.php`;

      console.log(`[Madara] getChapters: POST ${ajaxUrl}`);

      const resp = this.useNewChapterEndpoint
        ? await fetch(ajaxUrl, {
            method: "POST",
            headers: this.ajaxHeaders(),
            // empty form body — Madara expects x-www-form-urlencoded, not JSON
            form: {},
          })
        : await fetch(ajaxUrl, {
            method: "POST",
            headers: this.ajaxHeaders(),
            form: {
              action: "manga_get_chapters",
              manga: mangaId,
            },
          });

      const html = resp.text();
      console.log(`[Madara] getChapters: status=${resp.status}, body=${html.length} chars`);
      doc = parseHtml(html);
    } else {
      const resp = await fetch(mangaUrl, {
        headers: this.defaultHeaders(),
      });
      doc = parseHtml(resp.text());
    }

    const elements = doc.select(this.selectors.chapterList);
    const chapters: Chapter[] = [];

    console.log(`[Madara] getChapters: found ${elements.length} chapter elements (selector: ${this.selectors.chapterList})`);

    for (const el of elements) {
      const link = el.selectOne(this.selectors.chapterLink);
      if (!link) {
        console.warn(`[Madara] chapter element has no link — skipped`);
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
          date: date ?? undefined,
        })
      );
    }

    return chapters;
  }

  async getPages(chapter: Chapter): Promise<Pages> {
    let url = chapter.id;
    if (!url.startsWith("http")) {
      url = `${this.baseUrl}${url}`;
    }
    if (!url.includes("style=")) {
      url = url.replace(/\?.*$/, "") + this.chapterUrlSuffix;
    }

    const resp = await fetch(url, {
      headers: this.defaultHeaders(),
    });
    const doc = parseHtml(resp.text());

    const images = doc.select(this.selectors.pageImage);
    const urls: string[] = [];

    for (const img of images) {
      const src =
        img.attr("data-src") ??
        img.attr("data-lazy-src") ??
        img.attr("src");
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
      headers: { Referer: `${this.baseUrl}/` },
    });
  }

  async getDetails(mangaId: string): Promise<any> {
    const mangaUrl = `${this.baseUrl}/${this.mangaPath}/${mangaId}/`;
    const resp = await fetch(mangaUrl, {
      headers: this.defaultHeaders(),
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
      author: author || undefined,
      artist: artist || undefined,
      status,
      tags: tags.length > 0 ? tags : undefined,
    };
  }

  // Overridable helpers

  protected defaultHeaders(): Record<string, string> {
    return { Referer: `${this.baseUrl}/` };
  }

  /**
   * Headers for AJAX/XHR requests (POST to ajax endpoints).
   * Override in subclasses for CF-protected sites that need sec-fetch-* headers.
   */
  protected ajaxHeaders(): Record<string, string> {
    return {
      ...this.defaultHeaders(),
      "X-Requested-With": "XMLHttpRequest",
    };
  }

  protected parseTitle(doc: HtmlDocument): string {
    const el = doc.selectOne(this.selectors.title);
    return el?.text().trim() ?? "";
  }

  protected parseThumbnail(doc: HtmlDocument): string | undefined {
    const el = doc.selectOne(this.selectors.thumbnail);
    if (!el) return undefined;
    return (
      el.attr("data-src") ??
      el.attr("data-lazy-src") ??
      el.attr("srcset")?.split(" ").find((s) => s.startsWith("http")) ??
      el.attr("src") ??
      undefined
    );
  }

  protected parseDescription(doc: HtmlDocument): string | undefined {
    const el = doc.selectOne(this.selectors.description);
    if (!el) return undefined;
    const text = el.text().trim();
    return text || undefined;
  }

  protected parseStatus(doc: HtmlDocument): string | undefined {
    const els = doc.select(this.selectors.status);
    const last = els.length > 0 ? els[els.length - 1] : null;
    if (!last) return undefined;

    const raw = last.text().trim().toLowerCase();

    const completed = ["completed", "completo", "completado", "concluído", "finalizado", "terminé"];
    const ongoing = ["ongoing", "updating", "em lançamento", "em andamento", "en cours", "ativo"];
    const hiatus = ["on hold", "pausado", "en espera"];
    const canceled = ["canceled", "cancelado"];

    if (completed.some((s) => raw.includes(s))) return "Completed";
    if (ongoing.some((s) => raw.includes(s))) return "Ongoing";
    if (hiatus.some((s) => raw.includes(s))) return "On Hold";
    if (canceled.some((s) => raw.includes(s))) return "Canceled";

    return undefined;
  }

  protected parseTags(doc: HtmlDocument): string[] {
    return doc
      .select(this.selectors.genre)
      .map((el) => el.text().trim())
      .filter(Boolean);
  }

  protected extractSlug(url: string): string {
    const cleaned = url.replace(/\/+$/, "");
    const parts = cleaned.split("/");
    return parts[parts.length - 1];
  }

  protected extractChapterNumber(text: string): string {
    const match = text.match(/(?:chapter|cap[ií]tulo|ch\.?)\s*([\d.]+)/i);
    if (match) return match[1];
    const numMatch = text.match(/([\d.]+)/);
    return numMatch ? numMatch[1] : "0";
  }

  protected normalizeChapterUrl(href: string): string {
    if (href.startsWith("http")) {
      const match = href.match(/^https?:\/\/[^/]+(\/.*)/);
      return match ? match[1] : href;
    }
    return href;
  }

  protected parseChapterDate(dateStr: string): string | null {
    if (!dateStr) return null;

    const lower = dateStr.toLowerCase().trim();

    if (lower.includes("ago") || lower.includes("atrás")) {
      return null;
    }

    return parseDate(dateStr) ?? null;
  }
}
