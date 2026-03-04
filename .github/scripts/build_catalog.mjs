#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, posix } from "node:path";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const REPO = getArg("repo", "hagitori/hagitori-extensions");
const BRANCH = getArg("branch", "main");
const BUILDS = join(process.cwd(), "builds");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function getFiles(dir) {
  const out = {};
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isFile()) out[e.name] = sha256(await readFile(join(dir, e.name)));
  }
  return out;
}

async function main() {
  const catalog = {
    version: 1,
    updated_at: new Date().toISOString(),
    repo: REPO,
    branch: BRANCH,
    extensions: [],
  };

  for (const lang of await readdir(BUILDS, { withFileTypes: true })) {
    if (!lang.isDirectory()) continue;
    for (const ext of await readdir(join(BUILDS, lang.name), { withFileTypes: true })) {
      if (!ext.isDirectory()) continue;
      const dir = join(BUILDS, lang.name, ext.name);

      const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf-8"));
      const h = pkg.hagitori;

      const files = await getFiles(dir);
      const icon = h.icon || Object.keys(files).find((f) => /^icon\.(png|jpg|ico|webp|svg)$/i.test(f)) || null;

      catalog.extensions.push({
        id: pkg.name,
        name: h.displayName || pkg.name,
        lang: h.lang || "",
        version_id: parseInt(pkg.version, 10) || 0,
        path: posix.join("builds", lang.name, ext.name),
        entry: pkg.main || "index.js",
        requires: [],
        icon,
        domains: h.domains || [],
        features: h.capabilities || [],
        supports_details: h.supportsDetails || false,
        languages: h.languages || [],
        files,
        min_app_version: h.minAppVersion || null,
      });
    }
  }

  catalog.extensions.sort((a, b) => a.id.localeCompare(b.id));
  await writeFile("catalog.json", JSON.stringify(catalog, null, 2) + "\n");
  await writeFile("catalog.min.json", JSON.stringify(catalog));
  console.log(`${catalog.extensions.length} extension(s) cataloged`);
}

main();
