import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("public");
const MANIFEST = path.join(ROOT, "books", "books.json");
const OUTPUT = path.join(ROOT, "sw-precache.json");

const CACHEABLE = new Set([
  ".avif",
  ".bcmap",
  ".css",
  ".ico",
  ".icc",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".mjs",
  ".pfb",
  ".png",
  ".svg",
  ".ttf",
  ".wasm",
  ".webmanifest",
  ".webp",
  ".woff",
  ".woff2",
]);

const NEXT_STATIC = path.resolve(".next/static");

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function urlFor(file) {
  return `/${path.relative(ROOT, file).split(path.sep).join("/")}`;
}

const files = new Set();
const entries = new Map();

function addEntry(file, url) {
  files.add(file);
  entries.set(file, url);
}

for (const file of walk(NEXT_STATIC)) {
  if (!CACHEABLE.has(path.extname(file).toLowerCase())) continue;
  const relative = path.relative(NEXT_STATIC, file).split(path.sep).join("/");
  addEntry(file, `/_next/static/${relative}`);
}

for (const file of walk(path.join(ROOT, "pdfjs"))) {
  if (CACHEABLE.has(path.extname(file).toLowerCase())) addEntry(file, urlFor(file));
}

for (const name of [
  "apple-touch-icon.png",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
]) {
  const file = path.join(ROOT, "icons", name);
  if (fs.existsSync(file)) addEntry(file, urlFor(file));
}

if (fs.existsSync(MANIFEST)) {
  addEntry(MANIFEST, urlFor(MANIFEST));
  try {
    const books = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
    for (const book of books) {
      if (typeof book.file === "string" && book.file.startsWith("/")) {
        const file = path.join(ROOT, book.file.slice(1));
        if (fs.existsSync(file)) addEntry(file, urlFor(file));
      }
    }
  } catch (cause) {
    console.warn(`No pudimos leer books.json: ${cause.message}`);
  }
}

const urls = [...entries.values()].sort();
const hash = crypto.createHash("sha256");

for (const file of [...files].sort()) {
  hash.update(entries.get(file));
  hash.update(fs.readFileSync(file));
}

const version = hash.digest("hex").slice(0, 12);
fs.writeFileSync(OUTPUT, `${JSON.stringify({ version, urls }, null, 2)}\n`);

console.log(`Precache list: ${urls.length} files · ${version}`);
