<p align="center">
  <img src=".github/readme-images/logo_bg.png" alt="Hagitori Logo" width="20%" />
</p>

<h1 align="center">
  Hagitori Extensions
</h1>

<p align="center">
  <strong>Community-driven manga source extensions for <a href="https://github.com/hagitori/hagitori">Hagitori</a></strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/License-MIT-blue" alt="MIT" />
</p>

---

## About

This repository contains the **TypeScript extensions** that power Hagitori's manga sources. Each extension is a self-contained scraper that implements three functions:

```typescript
function getManga(url: string): Manga { /* ... */ }
function getChapters(mangaId: string): Chapter[] { /* ... */ }
function getPages(chapter: Chapter): Pages { /* ... */ }
// Optional — provides additional manga details (synopsis, tags, status, etc.)
function getDetails(mangaId: string): MangaDetails { /* ... */ }
```

Extensions are transpiled via **esbuild** and executed inside Hagitori's sandboxed **QuickJS** runtime. The SDK exposes built-in APIs: `http`, `html`, `browser`, `crypto`, `cookies`, `session`, and entity constructors.

## Structure

```
src/
├── en/          # English sources
├── pt-br/       # Portuguese (BR) sources
├── multi/       # Multi-language sources
└── templates/   # Extension templates
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on creating and submitting extensions.

## License

[MIT](LICENSE)
