import { Madara } from "../../templates/madara";

class MangaLivre extends Madara {
  private cfBypassed = false;
  private chromeMajor = "145";
  private chromeFullVersion = "145.0.0.0";

  constructor() {
    super({
      baseUrl: "https://mangalivre.tv",
      mangaPath: "manga",
      useAjaxChapters: true,
      useNewChapterEndpoint: true,
      chapterUrlSuffix: "?style=list",
      selectors: {
        chapterList: "li.wp-manga-chapter, li.chapter-li",
        pageImage: ".reading-content .page-break img.wp-manga-chapter-img[src]",
      },
    });
  }

  /**
   * Garante que o bypass de Cloudflare foi feito antes de qualquer requisição.
   * Cookies e User-Agent são propagados automaticamente para o session store,
   * então fetch() subsequentes já os incluem.
   * Também extrai a versão do Chrome para gerar os headers sec-ch-ua.
   */
  private async ensureCloudflareBypass(): Promise<void> {
    if (this.cfBypassed) return;

    console.log("[MangaLivre] Iniciando bypass de Cloudflare...");
    const result = await browser.bypassCloudflare(this.baseUrl);

    if (result.hasCfClearance) {
      console.log("[MangaLivre] Bypass OK — cf_clearance obtido");
    } else {
      console.warn("[MangaLivre] Bypass concluído sem cf_clearance — requests podem falhar");
    }

    // Extract Chrome version from the browser UA for sec-ch-ua headers
    const versionMatch = result.userAgent.match(/Chrome\/(\d+)\.(\d+\.\d+\.\d+)/);
    if (versionMatch) {
      this.chromeMajor = versionMatch[1];
      this.chromeFullVersion = `${versionMatch[1]}.${versionMatch[2]}`;
      console.log(`[MangaLivre] Chrome version: ${this.chromeFullVersion}`);
    }

    this.cfBypassed = true;
  }

  async getManga(url: string): Promise<Manga> {
    await this.ensureCloudflareBypass();
    return super.getManga(url);
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    await this.ensureCloudflareBypass();
    return super.getChapters(mangaId);
  }

  async getPages(chapter: Chapter): Promise<Pages> {
    await this.ensureCloudflareBypass();
    return super.getPages(chapter);
  }

  async getDetails(mangaId: string): Promise<any> {
    await this.ensureCloudflareBypass();
    return super.getDetails(mangaId);
  }

  /**
   * Headers padrão para requisições de navegação (GET pages).
   * Inclui sec-ch-ua (Client Hints) e sec-fetch (Fetch Metadata)
   * que Cloudflare valida para verificar que o request vem de um browser real.
   */
  protected defaultHeaders(): Record<string, string> {
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
      "Priority": "u=0, i",
    };
  }

  /**
   * Headers para requisições AJAX (POST to ajax endpoints).
   * Usa sec-fetch-mode: cors em vez de navigate.
   */
  protected ajaxHeaders(): Record<string, string> {
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
      "Priority": "u=1, i",
    };
  }

  /**
   * Gera os headers sec-ch-ua (Client Hints) com base na versão do Chrome
   * detectada durante o bypass. São os "low entropy" hints que Chrome
   * envia automaticamente em todos os requests.
   */
  private secChUaHeaders(): Record<string, string> {
    return {
      "Sec-CH-UA": `"Not:A-Brand";v="99", "Google Chrome";v="${this.chromeMajor}", "Chromium";v="${this.chromeMajor}"`,
      "Sec-CH-UA-Mobile": "?0",
      "Sec-CH-UA-Platform": '"Windows"',
    };
  }
}

(globalThis as any).__extension_class__ = MangaLivre;
(globalThis as any).__extension__ = new MangaLivre();
