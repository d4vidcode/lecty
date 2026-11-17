import type { Book, BookMeta, BookStatus, Progress } from "./types";

export const BOOK_META_KEY = "lecty:book-meta";

export const READING_STATUSES: Array<{
  key: BookStatus;
  label: string;
  short: string;
  accent: string;
  description: string;
}> = [
  {
    key: "pendiente",
    label: "Pendiente",
    short: "Por leer",
    accent: "#8a7c68",
    description: "Aún no lo has empezado",
  },
  {
    key: "leyendo",
    label: "Leyendo",
    short: "Leyendo",
    accent: "#af8b54",
    description: "Lo tienes entre manos",
  },
  {
    key: "terminado",
    label: "Terminado",
    short: "Terminado",
    accent: "#2c5546",
    description: "Lo has leído entero",
  },
  {
    key: "abandonado",
    label: "Abandonado",
    short: "Abandonado",
    accent: "#8c4a3a",
    description: "Lo dejaste a medias",
  },
];

export function isBookStatus(value: unknown): value is BookStatus {
  return READING_STATUSES.some((status) => status.key === value);
}

export function statusMeta(status: BookStatus) {
  return READING_STATUSES.find((item) => item.key === status) ?? READING_STATUSES[0];
}

type MetaMap = Record<string, BookMeta>;

function readAll(): MetaMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(BOOK_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as MetaMap;
  } catch {
    return {};
  }
}

function writeAll(value: MetaMap): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(BOOK_META_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function getAllBookMeta(): MetaMap {
  return readAll();
}

export function getBookMeta(id: string): BookMeta {
  return readAll()[id] ?? {};
}

function compact(meta: BookMeta): BookMeta {
  const next: BookMeta = { ...meta, updatedAt: Date.now() };
  if (next.title !== undefined) next.title = next.title.trim();
  if (next.author !== undefined) next.author = next.author.trim();
  if (next.tags !== undefined) {
    next.tags = next.tags
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter((tag, index, list) => list.indexOf(tag) === index)
      .slice(0, 12);
  }
  return next;
}

export function saveBookMeta(id: string, patch: BookMeta): BookMeta {
  const all = readAll();
  const next = compact({ ...(all[id] ?? {}), ...patch });
  all[id] = next;
  if (!writeAll(all)) {
    throw new Error(
      "No hay espacio en este navegador para guardar la ficha. Prueba con una portada más ligera."
    );
  }
  return next;
}

export function removeBookMeta(id: string): void {
  const all = readAll();
  if (!(id in all)) return;
  delete all[id];
  writeAll(all);
}

/** Aplica los cambios guardados (ficha, portada, favorito y estado). */
export function applyBookMeta(book: Book): Book {
  const meta = getBookMeta(book.id);
  if (!meta || Object.keys(meta).length === 0) return book;

  const next: Book = {
    ...book,
    title: meta.title?.trim() || book.title,
    author: meta.author?.trim() || book.author,
    category: meta.category ?? book.category,
    tags: meta.tags ?? book.tags,
    favorite: meta.favorite ?? book.favorite,
    status: meta.status,
  };

  if (meta.cover !== undefined) {
    next.cover = meta.cover ?? undefined;
  }

  return next;
}

/** Estado efectivo: el elegido a mano o el deducido del progreso. */
export function effectiveStatus(
  book: Book,
  progress?: Progress | null
): BookStatus {
  if (book.status) return book.status;
  if (!progress || book.pages <= 0) return "pendiente";
  if (progress.page >= Math.max(1, book.pages - 1)) return "terminado";
  if (progress.page > 0) return "leyendo";
  return "pendiente";
}
