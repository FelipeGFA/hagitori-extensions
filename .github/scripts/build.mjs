#!/usr/bin/env node

import { build, context } from "esbuild";
import { readdirSync, readFileSync, statSync, copyFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve, relative, dirname, extname, basename } from "path";

const SRC = resolve("src");
const OUT = resolve("builds");
const TEMPLATES_DIR = join(SRC, "templates");
const isWatch = process.argv.includes("--watch");

const templates = {};
if (existsSync(TEMPLATES_DIR)) {
  for (const name of readdirSync(TEMPLATES_DIR)) {
    const p = join(TEMPLATES_DIR, name, "template.json");
    if (existsSync(p)) {
      const t = JSON.parse(readFileSync(p, "utf-8"));
      templates[t.name || name] = t;
    }
  }
}

function findEntries(dir, depth = 0) {
  if (!existsSync(dir)) return [];
  const results = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    if (full === TEMPLATES_DIR) continue;
    if (depth >= 1) {
      const entry = join(full, `${name}.ts`);
      if (existsSync(entry)) results.push(entry);
    } else {
      results.push(...findEntries(full, depth + 1));
    }
  }
  return results;
}

function copyAssets(srcDir, destDir) {
  if (!existsSync(srcDir)) return;
  for (const file of readdirSync(srcDir)) {
    if ([".png", ".jpg", ".jpeg", ".webp", ".ico", ".svg"].includes(extname(file).toLowerCase())) {
      mkdirSync(destDir, { recursive: true });
      copyFileSync(join(srcDir, file), join(destDir, file));
    }
  }
}

function writePackageJson(srcDir, destDir, relDir) {
  const pkg = JSON.parse(readFileSync(join(srcDir, "package.json"), "utf-8"));
  const h = pkg.hagitori || {};
  const [lang, name] = relDir.split(/[\/\\]/);

  let version;
  if (h.template && templates[h.template]) {
    version = (templates[h.template].baseVersion || 0) + (h.overrideVersion || 0);
  } else {
    const v = h.version ?? pkg.version ?? 0;
    version = typeof v === "string" ? parseInt(v, 10) || 0 : v;
  }

  const out = {
    name: `hagitori.${h.lang ?? lang}.${name}`,
    version,
    main: "index.js",
    hagitori: {
      apiVersion: h.apiVersion ?? 1,
      type: h.type ?? "source",
      displayName: h.displayName,
      lang: h.lang ?? lang,
      domains: h.domains ?? [],
      capabilities: h.capabilities ?? [],
      supportsDetails: h.supportsDetails ?? false,
      ...(h.languages ? { languages: h.languages } : {}),
    },
  };

  mkdirSync(destDir, { recursive: true });
  writeFileSync(join(destDir, "package.json"), JSON.stringify(out, null, 2) + "\n");
}

const entries = findEntries(SRC);
if (entries.length === 0) process.exit(0);

for (const entry of entries) {
  const relPath = relative(SRC, entry);
  const relDir = dirname(relPath);
  const outFile = join(OUT, relDir, "index.js");

  const opts = {
    entryPoints: [entry],
    outfile: outFile,
    bundle: true,
    format: "iife",
    target: "es2023",
    minify: false,
    platform: "neutral",
    treeShaking: false,
    banner: { js: `// Transpiled from ${basename(entry)}` },
  };

  if (isWatch) {
    const ctx = await context(opts);
    await ctx.watch();
  } else {
    await build(opts);
  }

  copyAssets(dirname(entry), join(OUT, relDir));
  writePackageJson(dirname(entry), join(OUT, relDir), relDir);
}

console.log(`${entries.length} extension(s) built`);
if (isWatch) console.log("Watching for changes...");
