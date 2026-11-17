import type { Book, Bookmark, Progress } from "./types";

const DB_NAME = "lecty";
const DB_VERSION = 1;
const STORE_BOOKS = "books";
const STORE_FILES = "files";
const STORE_COVERS = "covers";

type StoredFile = { id: string; blob: Blob };
type StoredCover = { id: string; dataUrl: string };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB no está disponible"));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_BOOKS)) {
        db.createObjectStore(STORE_BOOKS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_COVERS)) {
        db.createObjectStore(STORE_COVERS, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir IndexedDB"));
  });

  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("Transacción cancelada"));
  });
}

export async function listLocalBooks(): Promise<Book[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_BOOKS, "readonly");
    const request = tx.objectStore(STORE_BOOKS).getAll() as IDBRequest<Book[]>;
    const books = await requestToPromise(request);
    return books
      .filter((book) => book.kind === "upload" || book.kind === "link")
      .sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return [];
  }
}

export async function getLocalBook(id: string): Promise<Book | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_BOOKS, "readonly");
    const book = await requestToPromise(
      tx.objectStore(STORE_BOOKS).get(id) as IDBRequest<Book | undefined>
    );
    return book ?? null;
  } catch {
    return null;
  }
}

export async function saveUploadedBook(book: Book, blob: Blob): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([STORE_BOOKS, STORE_FILES], "readwrite");
  tx.objectStore(STORE_BOOKS).put(book);
  tx.objectStore(STORE_FILES).put({ id: book.id, blob } satisfies StoredFile);
  await txDone(tx);
}

export async function saveLinkedBook(book: Book): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_BOOKS, "readwrite");
  tx.objectStore(STORE_BOOKS).put(book);
  await txDone(tx);
}

export async function getUploadedFile(id: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_FILES, "readonly");
    const file = await requestToPromise(
      tx.objectStore(STORE_FILES).get(id) as IDBRequest<StoredFile | undefined>
    );
    return file?.blob ?? null;
  } catch {
    return null;
  }
}

export async function deleteLocalBook(id: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction([STORE_BOOKS, STORE_FILES, STORE_COVERS], "readwrite");
    tx.objectStore(STORE_BOOKS).delete(id);
    tx.objectStore(STORE_FILES).delete(id);
    tx.objectStore(STORE_COVERS).delete(id);
    await txDone(tx);
  } catch {
    // Ignorar: el libro puede no existir.
  }
}

export async function getCachedCover(id: string): Promise<string | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_COVERS, "readonly");
    const cover = await requestToPromise(
      tx.objectStore(STORE_COVERS).get(id) as IDBRequest<StoredCover | undefined>
    );
    return cover?.dataUrl ?? null;
  } catch {
    return null;
  }
}

export async function setCachedCover(id: string, dataUrl: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE_COVERS, "readwrite");
    tx.objectStore(STORE_COVERS).put({ id, dataUrl } satisfies StoredCover);
    await txDone(tx);
  } catch {
    // Sin caché: se volverá a generar.
  }
}

/* ------------------------------------------------------------------ */
/* Local storage: progreso, marcadores y ajustes                       */
/* ------------------------------------------------------------------ */

const PROGRESS_PREFIX = "lecty:progress:";
const BOOKMARK_PREFIX = "lecty:bookmarks:";
export const SETTINGS_KEY = "lecty:reader-settings";
export const THEME_KEY = "lecty-theme";
export const LAST_BOOK_KEY = "lecty:last-book";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Almacenamiento lleno o bloqueado.
  }
}

export function getProgress(bookId: string): Progress | null {
  return readJson<Progress | null>(`${PROGRESS_PREFIX}${bookId}`, null);
}

export function setProgress(bookId: string, page: number): void {
  writeJson(`${PROGRESS_PREFIX}${bookId}`, { page, updatedAt: Date.now() });
}

export function getAllProgress(): Record<string, Progress> {
  if (typeof window === "undefined") return {};
  const result: Record<string, Progress> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(PROGRESS_PREFIX)) continue;
      const value = readJson<Progress | null>(key, null);
      if (value && typeof value.page === "number") {
        result[key.slice(PROGRESS_PREFIX.length)] = value;
      }
    }
  } catch {
    // Ignorar.
  }
  return result;
}

export function getBookmarks(bookId: string): Bookmark[] {
  const list = readJson<Bookmark[]>(`${BOOKMARK_PREFIX}${bookId}`, []);
  return Array.isArray(list) ? list.sort((a, b) => a.page - b.page) : [];
}

export function saveBookmarks(bookId: string, bookmarks: Bookmark[]): void {
  writeJson(`${BOOKMARK_PREFIX}${bookId}`, bookmarks);
}

export function toggleBookmark(
  bookId: string,
  page: number,
  snippet?: string
): { bookmarks: Bookmark[]; added: boolean } {
  const bookmarks = getBookmarks(bookId);
  const existing = bookmarks.find((bookmark) => bookmark.page === page);
  if (existing) {
    const next = bookmarks.filter((bookmark) => bookmark.id !== existing.id);
    saveBookmarks(bookId, next);
    return { bookmarks: next, added: false };
  }
  const bookmark: Bookmark = {
    id: `bm-${page}-${Date.now()}`,
    page,
    label: `Página ${page + 1}`,
    snippet,
    createdAt: Date.now(),
  };
  const next = [...bookmarks, bookmark].sort((a, b) => a.page - b.page);
  saveBookmarks(bookId, next);
  return { bookmarks: next, added: true };
}

export function removeBookmark(bookId: string, bookmarkId: string): Bookmark[] {
  const next = getBookmarks(bookId).filter((bookmark) => bookmark.id !== bookmarkId);
  saveBookmarks(bookId, next);
  return next;
}

export function forgetBook(bookId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${PROGRESS_PREFIX}${bookId}`);
    window.localStorage.removeItem(`${BOOKMARK_PREFIX}${bookId}`);
    if (window.localStorage.getItem(LAST_BOOK_KEY) === bookId) {
      window.localStorage.removeItem(LAST_BOOK_KEY);
    }
  } catch {
    // Ignorar.
  }
}

export function readSettings<T>(fallback: T): T {
  return readJson<T>(SETTINGS_KEY, fallback);
}

export function writeSettings(value: unknown): void {
  writeJson(SETTINGS_KEY, value);
}
