# Contributing

Before you start, please note that the ability to use the following technologies is required.

- [TypeScript](https://www.typescriptlang.org/)
- Web scraping ([HTML](https://developer.mozilla.org/en-US/docs/Web/HTML), [CSS selectors](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors))
- Basic understanding of REST APIs

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Getting Started](#getting-started)
3. [File Structure](#file-structure)
4. [Manifest](#manifest)
5. [Extension Contract](#extension-contract)
6. [API Reference](#api-reference)
7. [Templates](#templates)
8. [Building](#building)
9. [Examples](#examples)
10. [Submitting Changes](#submitting-changes)

---

## Prerequisites

### Tools

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/)
- [VS Code](https://code.visualstudio.com/) (recommended)
- A recent version of [Hagitori](https://github.com/hagitori/hagitori) installed

### Cloning the Repository

```bash
git clone https://github.com/hagitori/hagitori-extensions.git
cd hagitori-extensions
pnpm install
```

---

## Getting Started

The quickest way to get started is to copy an existing extension's folder structure and rename it as needed. Read through a few existing extensions before starting.

Each extension lives in `src/<lang>/<name>/` where:
- `<lang>` is an ISO 639-1 language code (`en`, `pt-br`, `multi`, etc.)
- `<name>` is the source identifier (lowercase, alphanumeric)
- The entry point file **must** have the same name as its folder: `src/<lang>/<name>/<name>.ts`

---

## File Structure

```
src/
└── <lang>/
    └── <name>/
        ├── <name>.ts        # Entry point (must match folder name)
        ├── package.json     # Manifest
        └── icon.png         # Icon (optional)
```

Build output goes to `builds/<lang>/<name>/`:

```
builds/
└── <lang>/
    └── <name>/
        ├── index.js         # Transpiled bundle
        ├── package.json     # Processed manifest
        └── icon.png         # Copied from source
```

---

## Manifest

Each extension folder requires a `package.json` with a `hagitori` field:

```json
{
  "hagitori": {
    "displayName": "My Extension",
    "domains": ["example.com"],
    "version": 1,
    "capabilities": [],
    "supportsDetails": false,
    "languages": ["en"]
  }
}
```

### Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `displayName` | `string` | required | Name shown in the UI |
| `domains` | `string[]` | `[]` | Domains this extension handles |
| `version` | `number` | `0` | Extension version (integer, bump on changes) |
| `capabilities` | `string[]` | `[]` | Required capabilities: `"browser"`, `"crypto"` |
| `supportsDetails` | `boolean` | `false` | Whether `getDetails()` is implemented |
| `languages` | `string[]` | — | Supported languages (multi-language extensions) |
| `lang` | `string` | from path | Override language |
| `apiVersion` | `number` | `1` | SDK API version |
| `type` | `string` | `"source"` | Extension type |

The build script derives `name` (as `hagitori.<lang>.<name>`) and `main` (`"index.js"`) from the folder path.

---

## Extension Contract

Every extension must implement the `HagitoriExtension` interface and expose it via `globalThis`:

```typescript
class MyExtension implements HagitoriExtension {
  async getManga(url: string): Promise<Manga> { /* ... */ }
  async getChapters(mangaId: string): Promise<Chapter[]> { /* ... */ }
  async getPages(chapter: Chapter): Promise<Pages> { /* ... */ }
  async getDetails?(mangaId: string): Promise<any> { /* ... */ }
}

(globalThis as any).__extension_class__ = MyExtension;
(globalThis as any).__extension__ = new MyExtension();
```

### Entities

**Manga** — returned by `getManga()`:

```typescript
new Manga({ 
  id: string, 
  name: string, 
  cover?: string 
 })
```

**Chapter** — returned by `getChapters()`:

```typescript
new Chapter({
  id: string,
  number: string,
  name: string,
  title?: string,
  date?: string,
  scanlator?: string,
})
```

**Pages** — returned by `getPages()`:

```typescript
new Pages({
  id: string,
  number: string,
  name: string,
  urls: string[],
  headers?: Record<string, string>,
  useBrowser?: boolean,
})
```

### getDetails (optional)

If `supportsDetails: true` in the manifest, implement `getDetails()` returning:

```typescript
{
  id: string,
  name: string,
  cover?: string,
  synopsis?: string,
  author?: string,
  artist?: string,
  status?: string,
  alt_titles?: string[],
  tags?: string[],
}
```

---

## API Reference

### HTTP — `fetch()`

```typescript
const resp = await fetch(url, {
  method?: "GET" | "POST",
  headers?: Record<string, string>,
  body?: string,
  form?: Record<string, string>,
  referer?: string,
});

resp.status;     // number
resp.headers;    // Record<string, string>
resp.text();     // string
resp.json();     // any
resp.bytes();    // number[]
```

### HTML Parser — `parseHtml()`

```typescript
const doc = parseHtml(htmlString);

doc.select("div.item");        // HtmlElement[]
doc.selectOne("h1.title");     // HtmlElement | null
doc.text();                    // string
doc.html();                    // string

element.text();                // inner text
element.html();                // inner HTML
element.outerHtml();           // outer HTML
element.attr("href");          // string | null
element.select("a");           // HtmlElement[]
element.selectOne("span");     // HtmlElement | null
```

### Browser — `browser`

Requires `"browser"` capability.

```typescript
// intercept network requests matching URL patterns
const requests: InterceptedRequest[] = JSON.parse(
  await browser.interceptRequests(url, ["pattern1", "pattern2"], { waitTime?: 30 })
);

// intercept network responses matching URL patterns
const responses: InterceptedResponse[] = JSON.parse(
  await browser.interceptResponses(url, ["pattern1", "pattern2"], { waitTime?: 30 })
);

// intercept both requests and responses at once
const result = await browser.intercept(url, {
  requests?: string[],   // URL patterns for requests
  responses?: string[],  // URL patterns for responses
  waitTime?: number,     // timeout in seconds (default 30)
});
result.requests;   // InterceptedRequest[]
result.responses;  // InterceptedResponse[]

// bypass Cloudflare protection (opens headful browser, clicks Turnstile)
const cf = await browser.bypassCloudflare(url, { autoClick?: true });
cf.cookies;        // { [name]: value }
cf.userAgent;      // string
cf.hasCfClearance; // boolean
cf.cookieHeader;   // "name=value; name2=value2"

// get cookies for a URL
const cookies: string = await browser.getCookies(url); // JSON string

// close the browser
await browser.close();
```

**Notes:**
- `bypassCloudflare()` keeps the browser alive — subsequent `intercept*()` calls reuse it, inheriting CF cookies.
- `intercept*()` calls auto-detect CF challenges and solve them in-place before intercepting.
- `interceptRequests()` and `interceptResponses()` return raw JSON strings; parse with `JSON.parse()`.

### Cookies — `cookies`

```typescript
cookies.set(domain, { key: "value" });
cookies.get(domain);
cookies.remove(domain, "key");
cookies.clear(domain);
```

### Session — `session`

```typescript
session.setHeaders(domain, { "X-Token": "abc" });
session.setUserAgent(domain, "custom-ua");
```

### Crypto — `crypto`

Requires `"crypto"` capability.

```typescript
crypto.md5(input);
crypto.sha256(input);
crypto.sha512(input);
crypto.hmacSha256(key, msg);
crypto.hmacSha512(key, msg);
crypto.randomUUID();
crypto.randomBytes(n);
```

### Date — `parseDate()`

```typescript
parseDate("2024-01-15");                   // "15-01-2024"
parseDate("15/01/2024", "dd/MM/yyyy");     // "15-01-2024"
parseDate("1705276800");                   // timestamp
```

### Utilities

```typescript
atob(encoded);
btoa(data);
await sleep(ms);
await setTimeout(fn, ms);
console.log(...args);
console.warn(...args);
console.error(...args);
```

### URLSearchParams

```typescript
const params = new URLSearchParams("key=value&foo=bar");
params.get("key");
params.set("key", "new");
params.append("key", "extra");
params.delete("key");
params.toString();
```

### Runtime Variables

```typescript
__lang__;    // extension language ("pt-br", "en", "multi")
__id__;      // extension id ("hagitori.en.mangadex")
```

---

## Templates

Templates allow code reuse across extensions that share the same site generator (CMS). A template defines a base class with shared logic, and individual extensions override only what differs (URL, selectors, etc.).

Templates live in `src/templates/<template-name>/` and are imported by extensions.

When using a template, the extension's `package.json` includes a `template` field, and versioning is computed as `baseVersion + overrideVersion` — changes to the template propagate updates to all derived extensions.

---

## Building

Extensions are built automatically by GitHub Actions on merge to `main`.

For local development:

```bash
# Build all extensions
node .github/scripts/build.mjs

# Watch mode
node .github/scripts/build.mjs --watch

# Type-check
npx tsc --noEmit
```

---

## Submitting Changes

Submit a Pull Request from a feature branch (not `main`). Test your extension locally before submitting.

### Pull Request Checklist

- [ ] Bumped `version` in `package.json`
- [ ] Entry point file matches folder name
- [ ] Extension builds without errors (`npx tsc --noEmit`)
- [ ] Tested all implemented methods (`getManga`,`getChapters`, `getPages`)
- [ ] Added `icon.png` if it's a new extension
- [ ] Set `supportsDetails: true` only if `getDetails()` is implemented
- [ ] Set required `capabilities` (`"browser"`, `"crypto"`) if used
- [ ] Domains list is accurate and complete
