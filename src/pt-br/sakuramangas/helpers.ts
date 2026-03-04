// SakuraMangás — helper types, constants, and utility functions

export const BASE_URL = "https://sakuramangas.org";
export const CHAPTERS_API = `${BASE_URL}/dist/sakura/models/manga/.__obf__manga_capitulos.php`;
export const WAIT_SECONDS = 10;
export const WAIT_SECONDS_PAGES = 8;

// Headers estáticos para requests de imagens (hardcoded no JS do site)
export const IMG_ACCEPT = "image/avif,image/webp,image/jpeg,image/png,image/svg+xml,image/*,*/*;q=0.8";
export const IMG_CONTENT_TYPE = "application/octet-stream";
export const IMG_ACCEPT_LANG = "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,es;q=0.5";
export const IMG_X_REQUESTED_WITH = "ab4741de32I128opk";
export const IMG_X_SIGNATURE_VERSION = "v5-fetch-secure";

/**
 * Gera o header X-Realtime da mesma forma que o JS do site:
 * Math.random().toString(36).substring(2) + Date.now().toString(36)
 */
export function generateXRealtime(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface AuthData {
  proof: string;
  challenge: string;
  mangaApiId: string;
}

export interface ChapterData {
  numero?: string;
  number?: string;
  data_timestamp?: number;
  versoes?: Array<{
    url?: string;
    titulo?: string;
    scans?: Array<{ nome?: string }>;
  }>;
}

// ═══════════════════════════════════════════════════════════════
// Cache (shared state between getManga → getChapters → getPages)
// ═══════════════════════════════════════════════════════════════

export let cachedAuth: AuthData | null = null;
export let cachedSecHeaders: Record<string, string> | null = null;
export let cachedChaptersData: any = null;
export let cachedMangaInfo: any = null;
export let cfBypassed = false;

export function setCachedAuth(v: AuthData | null) { cachedAuth = v; }
export function setCachedSecHeaders(v: Record<string, string> | null) { cachedSecHeaders = v; }
export function setCachedChaptersData(v: any) { cachedChaptersData = v; }
export function setCachedMangaInfo(v: any) { cachedMangaInfo = v; }
export function setCfBypassed(v: boolean) { cfBypassed = v; }

// ═══════════════════════════════════════════════════════════════
// Utility functions
// ═══════════════════════════════════════════════════════════════

/** Extract the manga slug from a URL or path. */
export function extractSlug(url: string): string {
  if (url.startsWith("http")) {
    url = url.replace(/^https?:\/\/sakuramangas\.org\/?/, "");
  }
  return url.replace(/^\//, "").replace(/\/$/, "");
}

/** Decode a x-www-form-urlencoded body into an object. */
export function parseFormBody(body: string): Record<string, string> {
  if (!body) return {};
  const params: Record<string, string> = {};
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

/** Parse the chapters API response into a typed array. */
export function parseChaptersResponse(
  data: any,
  mangaId: string
): { chapters: Chapter[]; hasMore: boolean } {
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (e) {
      throw new Error(`[SakuraMangás] failed to parse chapters response as JSON: ${e}`);
    }
  }

  let chapterList: ChapterData[] = [];
  let hasMore = false;

  if (data?.data && Array.isArray(data.data)) {
    chapterList = data.data;
    hasMore = !!data.has_more;
  } else if (Array.isArray(data)) {
    chapterList = data;
  }

  const chapters: Chapter[] = [];
  for (let i = 0; i < chapterList.length; i++) {
    const ch = chapterList[i];
    const chNum = ch.numero || ch.number || String(i + 1);

    let chUrl = "";
    let chTitle = "";
    let scanlator: string | undefined;

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

    const date = ch.data_timestamp
      ? parseDate(String(ch.data_timestamp)) ?? undefined
      : undefined;

    chapters.push(
      new Chapter({
        id: String(chUrl),
        number: String(chNum),
        name: mangaId,
        title: chTitle || undefined,
        date,
        scanlator,
      })
    );
  }

  return { chapters, hasMore };
}

/** Extract auth data from an intercepted POST request. */
export function extractAuth(
  requests: any[],
  fullUrl: string
): { auth: AuthData; headers: Record<string, string> } | null {
  for (const req of requests) {
    if (!req.url.includes("__obf__manga_capitulos") || !req.postBody) continue;

    const params = parseFormBody(req.postBody);
    const auth: AuthData = {
      proof: params.proof || "",
      challenge: params.challenge || "",
      mangaApiId: params.manga_id || "",
    };

    const headers: Record<string, string> = {
      Accept: "*/*",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      Origin: BASE_URL,
      Referer: fullUrl,
      "X-Requested-With": "XMLHttpRequest",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
    };

    if (req.headers) {
      for (const [key, value] of Object.entries(req.headers)) {
        const k = key.toLowerCase();
        if (k === "x-csrf-token") headers["X-CSRF-Token"] = value as string;
        else if (k === "x-client-signature") headers["X-Client-Signature"] = value as string;
        else if (k === "x-verification-key-1") headers["X-Verification-Key-1"] = value as string;
        else if (k === "x-verification-key-2") headers["X-Verification-Key-2"] = value as string;
        else if (k === "x-requested-with" && value !== "XMLHttpRequest") {
          headers["X-Requested-With"] = value as string;
        }
      }
    }

    return { auth, headers };
  }
  return null;
}

/** Try to parse a JSON body from a response, returning null on failure. */
export function tryParseBody(body: any): any | null {
  if (typeof body === "string") {
    try { return JSON.parse(body); } catch { return null; }
  }
  return body ?? null;
}

/** Find the first response matching a URL pattern that has manga data. */
export function findMangaResponse(responses: any[]): any | null {
  for (const resp of responses) {
    const body = tryParseBody(resp.body);
    if (body && (body.titulo || body.title)) return body;
  }
  return null;
}

/** Find the first response containing chapters data. */
export function findChaptersResponse(responses: any[]): any | null {
  for (const resp of responses) {
    if (!(resp.url || "").includes("__obf__manga_capitulos")) continue;
    const body = tryParseBody(resp.body);
    if (body) return body;
  }
  return null;
}

/**
 * Garante que o bypass de Cloudflare foi feito.
 * Cookies e UA são propagados automaticamente para o session store.
 */
export async function ensureCloudflareBypass(): Promise<void> {
  if (cfBypassed) return;

  console.log("[SakuraMangás] Iniciando bypass de Cloudflare...");
  const result = await browser.bypassCloudflare(BASE_URL);

  if (result.hasCfClearance) {
    console.log("[SakuraMangás] Bypass OK — cf_clearance obtido");
  } else {
    console.warn("[SakuraMangás] Bypass concluído sem cf_clearance");
  }

  setCfBypassed(true);
}
