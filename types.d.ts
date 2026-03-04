// ─── Hagitori Extension SDK ────────────────────────────────────────────────
// Tipos TypeScript para o runtime de extensões do Hagitori.
// Gerado a partir das APIs registradas em src-tauri/crates/extensions/src/apis/

// ── Contrato da Extensão ───────────────────────────────────────────────────

interface HagitoriExtension {
  getManga(url: string): Promise<Manga>;
  getChapters(mangaId: string): Promise<Chapter[]>;
  getPages(chapter: Chapter): Promise<Pages>;
  getDetails?(mangaId: string): Promise<MangaDetails>;
}

// ── Entidades ──────────────────────────────────────────────────────────────

interface MangaDetails {
  id: string;
  name: string;
  cover?: string;
  synopsis?: string;
  author?: string;
  artist?: string;
  status?: string;
  alt_titles?: string[];
  tags?: string[];
}

// ── Entidades ──────────────────────────────────────────────────────────────

declare class Manga {
  constructor(data: { id: string; name: string; cover?: string });
  id: string;
  name: string;
  cover: string | null;
  source: string;
}

declare class Chapter {
  constructor(data: {
    id: string;
    number: string;
    name: string;
    title?: string;
    date?: string;
    scanlator?: string;
  });
  id: string;
  number: string;
  name: string;
  title: string | null;
  date: string | null;
  scanlator: string | null;
}

declare class Pages {
  constructor(data: {
    id: string;
    number: string;
    name: string;
    urls: string[];
    headers?: Record<string, string>;
    useBrowser?: boolean;
  });
  chapter_id: string;
  chapter_number: string;
  manga_name: string;
  pages: string[];
  headers: Record<string, string> | null;
  useBrowser: boolean;
}

// ── HTTP (fetch) ───────────────────────────────────────────────────────────

interface FetchOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  form?: Record<string, string>;
  referer?: string;
}

interface FetchResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  text(): string;
  json(): any;
  bytes(): number[];
}

declare function fetch(url: string, options?: FetchOptions): Promise<FetchResponse>;

// ── HTML Parser ────────────────────────────────────────────────────────────

interface HtmlElement {
  text(): string;
  html(): string;
  outerHtml(): string;
  attr(name: string): string | null;
  select(css: string): HtmlElement[];
  selectOne(css: string): HtmlElement | null;
}

interface HtmlDocument {
  select(css: string): HtmlElement[];
  selectOne(css: string): HtmlElement | null;
  text(): string;
  html(): string;
}

declare function parseHtml(html: string): HtmlDocument;

// ── Browser (requer capability "browser") ──────────────────────────────────

interface InterceptedRequest {
  url: string;
  method: string;
  headers?: Record<string, string>;
  postBody?: string;
  resourceType?: string;
}

interface InterceptedResponse {
  url: string;
  status: number;
  body: any;
  headers?: Record<string, string>;
}

interface InterceptOptions {
  /** Tempo de espera em segundos (default: 30). */
  waitTime?: number;
}

interface InterceptAllOptions {
  /** Patterns de URL para interceptar requests. */
  requests?: string[];
  /** Patterns de URL para interceptar responses. */
  responses?: string[];
  /** Tempo de espera em segundos (default: 30). */
  waitTime?: number;
}

interface InterceptResult {
  /** Requests interceptados. */
  readonly requests: InterceptedRequest[];
  /** Responses interceptados. */
  readonly responses: InterceptedResponse[];
}

interface CloudflareBypassOptions {
  /** Se true, tenta clicar automaticamente no checkbox do Turnstile (default: true). */
  autoClick?: boolean;
}

interface CloudflareResult {
  /** Cookies extraídos como { name: value }. */
  readonly cookies: Record<string, string>;
  /** User-agent do browser usado no bypass. */
  readonly userAgent: string;
  /** Se true, o cookie cf_clearance foi encontrado. */
  readonly hasCfClearance: boolean;
  /** Cookies formatados como header: "name=value; name2=value2". */
  readonly cookieHeader: string;
}

declare const browser: {
  /** Intercepta requests que match os patterns ao navegar para a URL. */
  interceptRequests(url: string, patterns: string[], options?: InterceptOptions): Promise<string>;
  /** Intercepta responses que match os patterns ao navegar para a URL. */
  interceptResponses(url: string, patterns: string[], options?: InterceptOptions): Promise<string>;
  /** Intercepta requests e responses simultaneamente. */
  intercept(url: string, options?: InterceptAllOptions): Promise<InterceptResult>;
  /** Retorna cookies do browser como JSON string { name: value }. */
  getCookies(url: string): Promise<string>;
  /**
   * Bypass de Cloudflare via disconnect CDP.
   * Cookies e User-Agent são automaticamente propagados para o session store,
   * então fetch() subsequentes já incluem os cookies.
   */
  bypassCloudflare(url: string, options?: CloudflareBypassOptions): Promise<CloudflareResult>;
  /** Fecha o browser. */
  close(): Promise<void>;
};

// ── Cookies ────────────────────────────────────────────────────────────────

declare const cookies: {
  set(domain: string, cookies: Record<string, string>): void;
  get(domain: string): Record<string, string>;
  remove(domain: string, name: string): void;
  clear(domain: string): void;
};

// ── Session ────────────────────────────────────────────────────────────────

declare const session: {
  setHeaders(domain: string, headers: Record<string, string>): void;
  setUserAgent(domain: string, ua: string): void;
};

// ── Crypto (requer capability "crypto") ────────────────────────────────────

declare const crypto: {
  md5(input: string): string;
  sha256(input: string): string;
  sha512(input: string): string;
  hmacSha256(key: string, msg: string): string;
  hmacSha512(key: string, msg: string): string;
  randomUUID(): string;
  randomBytes(n: number): number[];
};

// ── Date ───────────────────────────────────────────────────────────────────

/**
 * Parseia uma string de data em diversos formatos.
 * Retorna formato "dd-MM-yyyy" ou null se falhar.
 * @param input - String de data (ISO, timestamps, formatos comuns)
 * @param format - Formato Java opcional (ex: "yyyy-MM-dd", "dd/MM/yyyy")
 */
declare function parseDate(input: string, format?: string): string | null;

// ── Utils ──────────────────────────────────────────────────────────────────

declare function atob(encoded: string): string;
declare function btoa(data: string): string;
declare function sleep(ms: number): Promise<void>;
declare function setTimeout(fn: () => void, ms?: number): Promise<number>;
declare function clearTimeout(): void;
declare function clearInterval(): void;

// ── URLSearchParams ────────────────────────────────────────────────────────

declare class URLSearchParams {
  constructor(init?: string | Record<string, string>);
  get(key: string): string | null;
  has(key: string): boolean;
  set(key: string, value: string): void;
  append(key: string, value: string): void;
  delete(key: string): void;
  toString(): string;
  getAll(key: string): string[];
  keys(): string[];
  values(): string[];
  entries(): [string, string][];
}

// ── Console ────────────────────────────────────────────────────────────────

declare const console: {
  log(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
};

// ── Variáveis injetadas pelo runtime ───────────────────────────────────────

declare const __lang__: string;
declare const __id__: string;
