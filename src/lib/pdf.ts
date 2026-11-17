import type { PDFDocumentProxy } from "pdfjs-dist";
import type { OutlineNode, SearchHit } from "./types";

type PdfjsModule = typeof import("pdfjs-dist");
type PdfSource = string | ArrayBuffer | Uint8Array;

let pdfjsPromise: Promise<PdfjsModule> | null = null;

export function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

const ASSET_OPTIONS = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
  iccUrl: "/pdfjs/iccs/",
  useSystemFonts: true,
  // Dibuja los glifos en el canvas en lugar de inyectar @font-face:
  // ideal para rasterizar hojas y no ensuciar el documento.
  disableFontFace: true,
};

function documentParams(src: PdfSource) {
  if (typeof src === "string") return { url: src };
  return { data: src };
}

export type OpenedPdf = {
  doc: PDFDocumentProxy;
  pageCount: number;
  pageAspect: number;
  title: string;
  author: string;
};

export async function openPdf(src: PdfSource): Promise<OpenedPdf> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    ...documentParams(src),
    ...ASSET_OPTIONS,
  });
  const doc = await task.promise;
  const firstPage = await doc.getPage(1);
  const viewport = firstPage.getViewport({ scale: 1 });
  const aspect = viewport.width / viewport.height;
  firstPage.cleanup();

  let title = "";
  let author = "";
  try {
    const metadata = await doc.getMetadata();
    const info = metadata?.info as Record<string, unknown> | undefined;
    if (typeof info?.Title === "string") title = info.Title.trim();
    if (typeof info?.Author === "string") author = info.Author.trim();
  } catch {
    // Sin metadatos.
  }

  return { doc, pageCount: doc.numPages, pageAspect: aspect, title, author };
}

async function renderPageToDataUrl(
  doc: PDFDocumentProxy,
  pageIndex: number,
  targetHeight: number,
  quality = 0.88
): Promise<string> {
  const page = await doc.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const maxSide = 2400;
  const scale = Math.min(
    targetHeight / base.height,
    maxSide / Math.max(base.width, base.height)
  );
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("No se pudo crear el lienzo de dibujo");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Las páginas se rasterizan a imágenes estáticas, así que usamos el
  // intent de impresión: además de ser el modo correcto para una imagen
  // final, evita que pdf.js dependa de requestAnimationFrame, que los
  // navegadores pausan en pestañas de fondo.
  await page.render({
    canvas,
    canvasContext: context,
    viewport,
    intent: "print",
  }).promise;

  page.cleanup();
  return canvas.toDataURL("image/jpeg", quality);
}

export async function renderCoverFromSource(
  src: PdfSource,
  height = 620
): Promise<{ cover: string; pages: number; aspect: number }> {
  const { doc, pageCount, pageAspect } = await openPdf(src);
  try {
    const cover = await renderPageToDataUrl(doc, 0, height, 0.86);
    return { cover, pages: pageCount, aspect: pageAspect };
  } finally {
    await doc.loadingTask.destroy().catch(() => undefined);
  }
}

export type PdfInspection = {
  title: string;
  author: string;
  pages: number;
  aspect: number;
  cover: string;
};

export async function inspectPdf(src: PdfSource, coverHeight = 620): Promise<PdfInspection> {
  const { doc, pageCount, pageAspect, title, author } = await openPdf(src);
  try {
    const cover = await renderPageToDataUrl(doc, 0, coverHeight, 0.86);
    return {
      title,
      author,
      pages: pageCount,
      aspect: pageAspect,
      cover,
    };
  } finally {
    await doc.loadingTask.destroy().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* Renderizador por libro                                              */
/* ------------------------------------------------------------------ */

const PAGE_CACHE_LIMIT = 40;
const THUMB_CACHE_LIMIT = 200;
const MAX_SEARCH_HITS = 80;

type RendererOptions = {
  targetHeight?: number;
  onBackgroundError?: (error: unknown) => void;
};

export class BookRenderer {
  readonly doc: PDFDocumentProxy;
  readonly pageCount: number;
  readonly pageAspect: number;
  readonly targetHeight: number;

  private pageCache = new Map<number, string>();
  private thumbCache = new Map<number, string>();
  private pending = new Map<string, Promise<string>>();
  private queue: Promise<unknown> = Promise.resolve();
  private textCache = new Map<number, string>();
  private destroyed = false;
  private options: RendererOptions;

  private constructor(
    doc: PDFDocumentProxy,
    pageCount: number,
    pageAspect: number,
    targetHeight: number,
    options: RendererOptions
  ) {
    this.doc = doc;
    this.pageCount = pageCount;
    this.pageAspect = pageAspect;
    this.targetHeight = targetHeight;
    this.options = options;
  }

  static async open(src: PdfSource, options: RendererOptions = {}): Promise<BookRenderer> {
    const opened = await openPdf(src);
    const height = options.targetHeight ?? 1500;
    return new BookRenderer(opened.doc, opened.pageCount, opened.pageAspect, height, options);
  }

  peek(page: number): string | null {
    return this.pageCache.get(page) ?? null;
  }

  has(page: number): boolean {
    return this.pageCache.has(page);
  }

  getPage(page: number): Promise<string> {
    if (this.destroyed) return Promise.reject(new Error("El libro se ha cerrado"));
    const cached = this.pageCache.get(page);
    if (cached) {
      this.touch(this.pageCache, page);
      return Promise.resolve(cached);
    }
    return this.enqueue(`page:${page}`, () =>
      renderPageToDataUrl(this.doc, page, this.targetHeight).then((url) => {
        this.store(this.pageCache, page, url, PAGE_CACHE_LIMIT);
        return url;
      })
    );
  }

  getThumb(page: number): Promise<string> {
    if (this.destroyed) return Promise.reject(new Error("El libro se ha cerrado"));
    const cached = this.thumbCache.get(page);
    if (cached) {
      this.touch(this.thumbCache, page);
      return Promise.resolve(cached);
    }
    return this.enqueue(`thumb:${page}`, () =>
      renderPageToDataUrl(this.doc, page, 280, 0.8).then((url) => {
        this.store(this.thumbCache, page, url, THUMB_CACHE_LIMIT);
        return url;
      })
    );
  }

  preload(pages: number[]): void {
    if (this.destroyed) return;
    for (const page of pages) {
      if (page < 0 || page >= this.pageCount) continue;
      void this.getPage(page).catch(() => undefined);
    }
  }

  async getPageText(page: number): Promise<string> {
    if (this.destroyed) return "";
    const cached = this.textCache.get(page);
    if (cached !== undefined) return cached;
    try {
      const pdfPage = await this.doc.getPage(page + 1);
      const content = await pdfPage.getTextContent();
      let text = "";
      for (const item of content.items) {
        if ("str" in item) {
          text += item.str;
          text += item.hasEOL ? "\n" : " ";
        }
      }
      const clean = text.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();
      this.textCache.set(page, clean);
      pdfPage.cleanup();
      return clean;
    } catch {
      return "";
    }
  }

  async getSnippet(page: number, length = 110): Promise<string> {
    const text = await this.getPageText(page);
    const flat = text.replace(/\s+/g, " ").trim();
    return flat.length > length ? `${flat.slice(0, length).trim()}…` : flat;
  }

  async getOutline(): Promise<OutlineNode[]> {
    try {
      const outline = await this.doc.getOutline();
      if (!outline) return [];

      const resolvePage = async (dest: unknown): Promise<number | null> => {
        try {
          let resolved = dest;
          if (typeof resolved === "string") {
            resolved = await this.doc.getDestination(resolved);
          }
          if (!Array.isArray(resolved) || resolved.length === 0) return null;
          const ref = resolved[0] as unknown;
          if (typeof ref === "number") return ref;
          if (ref && typeof ref === "object") {
            return await this.doc.getPageIndex(ref as Parameters<PDFDocumentProxy["getPageIndex"]>[0]);
          }
          return null;
        } catch {
          return null;
        }
      };

      const walk = async (items: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>): Promise<OutlineNode[]> => {
        if (!items) return [];
        const nodes: OutlineNode[] = [];
        for (const item of items) {
          nodes.push({
            title: item.title?.trim() || "Sin título",
            page: await resolvePage(item.dest),
            children: await walk(item.items),
          });
        }
        return nodes;
      };

      return await walk(outline);
    } catch {
      return [];
    }
  }

  async search(
    query: string,
    options: {
      onProgress?: (done: number, total: number) => void;
      signal?: AbortSignal;
    } = {}
  ): Promise<SearchHit[]> {
    const needle = normalizeText(query);
    if (needle.length < 2) return [];

    const hits: SearchHit[] = [];
    const total = this.pageCount;

    for (let page = 0; page < total; page += 1) {
      if (options.signal?.aborted) break;
      const text = await this.getPageText(page);
      if (text) {
        const haystack = normalizeText(text);
        let from = 0;
        let perPage = 0;
        while (perPage < 3) {
          const index = haystack.indexOf(needle, from);
          if (index === -1) break;
          hits.push({
            page,
            snippet: makeSnippet(haystack, index, needle.length),
            start: index,
          });
          from = index + needle.length;
          perPage += 1;
          if (hits.length >= MAX_SEARCH_HITS) break;
        }
      }
      options.onProgress?.(page + 1, total);
      if (hits.length >= MAX_SEARCH_HITS) break;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    return hits;
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pageCache.clear();
    this.thumbCache.clear();
    this.textCache.clear();
    this.pending.clear();
    try {
      await this.doc.loadingTask.destroy();
    } catch {
      // Ignorar errores al cerrar.
    }
  }

  private enqueue(key: string, task: () => Promise<string>): Promise<string> {
    const existing = this.pending.get(key);
    if (existing) return existing;

    const run = this.queue
      .then(() => {
        if (this.destroyed) throw new Error("El libro se ha cerrado");
        return task();
      })
      .catch((error) => {
        this.options.onBackgroundError?.(error);
        throw error;
      });

    const promise = run.finally(() => {
      this.pending.delete(key);
    });
    this.queue = promise.catch(() => undefined);
    this.pending.set(key, promise);
    return promise;
  }

  private store(cache: Map<number, string>, page: number, url: string, limit: number) {
    cache.set(page, url);
    while (cache.size > limit) {
      const first = cache.keys().next().value;
      if (first === undefined) break;
      cache.delete(first);
    }
  }

  private touch(cache: Map<number, string>, page: number) {
    const value = cache.get(page);
    if (!value) return;
    cache.delete(page);
    cache.set(page, value);
  }
}

/* ------------------------------------------------------------------ */
/* Texto                                                               */
/* ------------------------------------------------------------------ */

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function makeSnippet(text: string, index: number, length: number): string {
  const before = 52;
  const after = 78;
  const start = Math.max(0, index - before);
  const end = Math.min(text.length, index + length + after);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${
    end < text.length ? "…" : ""
  }`;
}
