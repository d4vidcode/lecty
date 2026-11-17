import type { Book, BookCategory } from "./types";
import {
  deleteLocalBook,
  forgetBook,
  getCachedCover,
  getLocalBook,
  getUploadedFile,
  listLocalBooks,
  saveLinkedBook,
  saveUploadedBook,
  setCachedCover,
} from "./storage";
import { inspectPdf } from "./pdf";
import { categoryOf } from "./categories";
import { applyBookMeta, removeBookMeta } from "./book-meta";
import { detectBookMetadata } from "./metadata";

const MANIFEST_URL = "/books/books.json";

const ACCENTS = ["#7c3b32", "#2c5546", "#33485c", "#6b4a2f", "#4a3b63", "#7a3f52"];

let manifestPromise: Promise<Book[]> | null = null;

export async function loadSamples(): Promise<Book[]> {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL)
      .then(async (response) => {
        if (!response.ok) throw new Error("No se pudo leer la biblioteca de ejemplo");
        const data = (await response.json()) as Book[];
        return data.map((book) => ({
          ...book,
          author: book.author || "Anónimo",
          tags: book.tags ?? [],
          kind: "sample" as const,
          category: categoryOf({ ...book, kind: "sample" }),
        }));
      })
      .catch(() => []);
  }
  return manifestPromise;
}

export async function loadLibrary(): Promise<Book[]> {
  const [samples, uploads] = await Promise.all([loadSamples(), listLocalBooks()]);
  return [...uploads, ...samples]
    .map(applyBookMeta)
    .sort((a, b) => b.addedAt - a.addedAt);
}

export async function findBook(id: string): Promise<Book | null> {
  const [samples, uploaded] = await Promise.all([loadSamples(), getLocalBook(id)]);
  const book = uploaded ?? samples.find((item) => item.id === id) ?? null;
  return book ? applyBookMeta(book) : null;
}

export async function resolveBookSource(
  book: Book
): Promise<{ url: string; revoke: () => void }> {
  if (book.kind === "sample" && book.file) {
    return { url: book.file, revoke: () => undefined };
  }
  if (book.kind === "link" && book.url) {
    return {
      url: book.viaProxy ? pdfProxyUrl(book.url) : book.url,
      revoke: () => undefined,
    };
  }
  const blob = await getUploadedFile(book.id);
  if (!blob) throw new Error("El archivo de este libro ya no está en el navegador.");
  const url = URL.createObjectURL(blob);
  return {
    url,
    revoke: () => URL.revokeObjectURL(url),
  };
}

function accentFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return ACCENTS[Math.abs(hash) % ACCENTS.length];
}

export function prettyFileName(name: string): string {
  return name
    .replace(/\.pdf$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanTitle(title: string): string {
  const value = title.replace(/\.pdf$/i, "").trim();
  if (!value) return "";
  if (/^(untitled|sin t[ií]tulo|documento|document)$/i.test(value)) return "";
  if (/^(microsoft word|powerpoint|adobe|scan)\b/i.test(value)) return "";
  return value;
}

function isPdfFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";
}

function uniqueTags(tags: string[]): string[] {
  const result: string[] = [];
  for (const tag of tags) {
    const clean = tag.trim();
    if (!clean) continue;
    if (result.some((item) => item.toLocaleLowerCase("es") === clean.toLocaleLowerCase("es"))) {
      continue;
    }
    result.push(clean);
  }
  return result.slice(0, 8);
}

function folderOf(path: string | undefined): string {
  if (!path) return "";
  const parts = path.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 1) return "";
  parts.pop();
  return parts.join("/");
}

export async function importPdfFile(
  file: File,
  options: {
    onStage?: (stage: string) => void;
    category?: BookCategory;
    folderPath?: string;
    autoMetadata?: boolean;
  } = {}
): Promise<Book> {
  if (!isPdfFile(file)) {
    throw new Error(`«${file.name}» no es un archivo PDF.`);
  }
  if (file.size > 120 * 1024 * 1024) {
    throw new Error("El PDF supera los 120 MB.");
  }

  options.onStage?.("Leyendo el documento…");
  const buffer = await file.arrayBuffer();
  const signature = new TextDecoder().decode(buffer.slice(0, 5));
  if (signature !== "%PDF-") {
    throw new Error("El archivo no parece un PDF válido.");
  }

  const inspection = await inspectPdf(buffer, 640);
  options.onStage?.("Guardando en tu biblioteca…");

  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `up-${crypto.randomUUID()}`
      : `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const fallbackTitle =
    cleanTitle(inspection.title) || prettyFileName(file.name) || "Documento sin título";

  let title = fallbackTitle;
  let author = inspection.author || "Anónimo";
  let tags = ["Subido"];
  let category = options.category ?? "libros";

  if (options.autoMetadata !== false) {
    const detected = detectBookMetadata({
      fileName: file.name,
      folderPath: options.folderPath ?? folderOf(file.webkitRelativePath),
      pdfTitle: inspection.title,
      pdfAuthor: inspection.author,
      fallbackCategory: options.category,
    });
    title = detected.title || fallbackTitle;
    author = detected.author || "Anónimo";
    tags = uniqueTags([...detected.tags, "Subido"]);
    category = detected.category ?? options.category ?? "libros";
  }

  const book: Book = {
    id,
    title,
    author,
    pages: inspection.pages,
    cover: inspection.cover,
    tags,
    accent: accentFor(id + file.name),
    addedAt: Date.now(),
    kind: "upload",
    category,
    size: file.size,
    fileName: file.name,
  };

  await saveUploadedBook(book, file);
  return book;
}

function fileNameFromUrl(url: URL): string {
  const last = url.pathname.split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export function normalizePdfUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Escribe el enlace de un PDF.");
  const relative = trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../");
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : relative
      ? new URL(trimmed, window.location.origin).toString()
      : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Ese enlace no parece válido.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Solo podemos abrir enlaces http o https.");
  }
  if (
    !relative &&
    (!parsed.hostname ||
      /\s|%20/i.test(parsed.hostname) ||
      (!parsed.hostname.includes(".") && !parsed.hostname.includes(":")))
  ) {
    throw new Error("Ese enlace no parece válido.");
  }
  return parsed.toString();
}

export function pdfProxyUrl(url: string): string {
  return `/api/pdf?${new URLSearchParams({ url }).toString()}`;
}

const DOWNLOAD_HINT = "Descárgalo y súbelo desde tu equipo.";

function statusFromError(cause: unknown): number | null {
  const detail = cause instanceof Error ? cause.message : "";
  const match = detail.match(/\b([45]\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function linkErrorMessage(cause: unknown, viaProxy: boolean): string {
  const status = statusFromError(cause);
  if (viaProxy && status === 403) {
    return "El enlace apunta a una dirección privada o interna. Por seguridad, Lecty solo abre PDF públicos.";
  }
  if (status === 400) {
    return "El enlace no es válido. Comprueba que esté completo y empiece por https://.";
  }
  if (status === 404) {
    return `El enlace ya no existe (404). Comprueba la dirección. ${DOWNLOAD_HINT}`;
  }
  if (status === 401) {
    return `El servidor del PDF pide iniciar sesión. Ábrelo en su web, ${DOWNLOAD_HINT.toLowerCase()}`;
  }
  if (status === 403) {
    return `El servidor del PDF bloquea la descarga. Ábrelo en su web, ${DOWNLOAD_HINT.toLowerCase()}`;
  }
  if (status === 413) {
    return "El PDF supera los 80 MB admitidos desde un enlace. Descárgalo y súbelo (hasta 120 MB).";
  }
  if (status === 415) {
    return "El enlace no devuelve un PDF. Comprueba que apunte al archivo y no a una página web.";
  }
  if (status === 502 || status === 504) {
    return `No pudimos descargar el PDF desde ese servidor. Puede que ya no esté disponible o que bloquee el acceso. ${DOWNLOAD_HINT}`;
  }
  return `No pudimos abrir el enlace, ni directamente ni a través de Lecty. Comprueba la dirección. ${DOWNLOAD_HINT}`;
}

export async function importPdfUrl(
  input: string,
  options: {
    onStage?: (stage: string) => void;
    category?: BookCategory;
    autoMetadata?: boolean;
  } = {}
): Promise<Book> {
  const url = normalizePdfUrl(input);
  const parsed = new URL(url);
  const fallbackName = prettyFileName(fileNameFromUrl(parsed));

  options.onStage?.("Conectando con el enlace…");
  let inspection: Awaited<ReturnType<typeof inspectPdf>>;
  let viaProxy = false;
  try {
    inspection = await inspectPdf(url, 640);
  } catch {
    options.onStage?.("Probando a través del servidor de Lecty…");
    try {
      inspection = await inspectPdf(pdfProxyUrl(url), 640);
      viaProxy = true;
    } catch (proxyCause) {
      throw new Error(linkErrorMessage(proxyCause, true));
    }
  }

  options.onStage?.("Guardando en tu biblioteca…");
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `ln-${crypto.randomUUID()}`
      : `ln-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const hostAuthor = parsed.hostname.replace(/^www\./, "") || "Enlace";
  let title = cleanTitle(inspection.title) || fallbackName || "Documento enlazado";
  let author = inspection.author || hostAuthor;
  let tags = ["Enlace"];
  let category = options.category ?? "libros";

  if (options.autoMetadata !== false) {
    const detected = detectBookMetadata({
      fileName: fallbackName || fileNameFromUrl(parsed) || parsed.hostname,
      pdfTitle: inspection.title,
      pdfAuthor: inspection.author,
      fallbackCategory: options.category,
    });
    title = detected.title || title;
    author = detected.author || hostAuthor;
    tags = uniqueTags([...detected.tags, "Enlace"]);
    category = detected.category ?? options.category ?? "libros";
  }

  const book: Book = {
    id,
    title,
    author,
    pages: inspection.pages,
    cover: inspection.cover,
    tags,
    accent: accentFor(id + url),
    addedAt: Date.now(),
    kind: "link",
    category,
    url,
    viaProxy,
    fileName: fallbackName || fileNameFromUrl(parsed) || parsed.hostname,
  };

  await saveLinkedBook(book);
  return book;
}

const coverPromises = new Map<string, Promise<string | null>>();

export function getBookCover(book: Book): Promise<string | null> {
  if (book.cover) return Promise.resolve(book.cover);
  const existing = coverPromises.get(book.id);
  if (existing) return existing;

  const promise = (async () => {
    const cached = await getCachedCover(book.id);
    if (cached) return cached;
    if (!book.file) return null;
    try {
      const { renderCoverFromSource } = await import("./pdf");
      const { cover } = await renderCoverFromSource(book.file, 620);
      await setCachedCover(book.id, cover);
      return cover;
    } catch {
      return null;
    }
  })();

  coverPromises.set(book.id, promise);
  return promise;
}

export async function removeBook(book: Book): Promise<void> {
  if (book.kind !== "sample") {
    await deleteLocalBook(book.id);
  }
  removeBookMeta(book.id);
  forgetBook(book.id);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function readingPercent(page: number, pages: number): number {
  if (pages <= 1) return 0;
  return Math.min(100, Math.round((page / (pages - 1)) * 100));
}

export { isPdfFile };
