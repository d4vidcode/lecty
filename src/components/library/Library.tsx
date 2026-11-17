"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Book, BookCategory, BookStatus, Progress, ReadingStats } from "@/lib/types";
import {
  formatBytes,
  importPdfFile,
  loadLibrary,
  readingPercent,
  removeBook,
} from "@/lib/books";
import { CATEGORIES, categoryOf } from "@/lib/categories";
import {
  READING_STATUSES,
  effectiveStatus,
  saveBookMeta,
} from "@/lib/book-meta";
import { getAllProgress, LAST_BOOK_KEY, THEME_KEY } from "@/lib/storage";
import {
  formatReadingTime,
  lastDays,
  loadReadingStats,
  readingStreak,
} from "@/lib/reading-stats";
import {
  DEFAULT_UI_PREFERENCES,
  applyUiPreferences,
  loadUiPreferences,
  saveUiPreferences,
  type UiPreferences,
} from "@/lib/preferences";
import {
  collectFromDataTransfer,
  collectFromFileList,
  isPdfPath,
  type ImportedFile,
} from "@/lib/folder";
import { cn, formatInteger } from "@/lib/utils";
import {
  BookmarkIcon,
  BookOpenIcon,
  BookIcon,
  ChartIcon,
  ChevronRightIcon,
  ClockIcon,
  FileTextIcon,
  GridIcon,
  HeartIcon,
  ListIcon,
  MoonIcon,
  SearchIcon,
  ShieldIcon,
  SlidersIcon,
  SparkIcon,
  SunIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from "@/components/icons";
import BookCard from "@/components/library/BookCard";
import AddLinkDialog from "@/components/library/AddLinkDialog";
import EditBookDialog from "@/components/library/EditBookDialog";
import SettingsPanel from "@/components/library/SettingsPanel";
import { CoverFallback, useBookCover } from "@/components/library/BookCover";

type Toast = { id: number; text: string; tone: "info" | "error" };
type SortKey = "recientes" | "titulo" | "paginas";
type CategoryFilter = "todas" | BookCategory;
type StatusFilter = "todos" | "favoritos" | BookStatus;

const ALL = "Todos";

const CATEGORY_ICONS = {
  libros: BookIcon,
  comics: GridIcon,
  revistas: ListIcon,
  documentos: FileTextIcon,
} as const;

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function folderOfPath(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 1) return "";
  parts.pop();
  return parts.join("/");
}

export default function Library() {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [lastBookId, setLastBookId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("todas");
  const [tag, setTag] = useState(ALL);
  const [sort, setSort] = useState<SortKey>("recientes");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");

  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState<{
    name: string;
    stage: string;
    index: number;
    total: number;
  } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pendingDelete, setPendingDelete] = useState<Book | null>(null);
  const [editing, setEditing] = useState<Book | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [importCategory, setImportCategory] = useState<BookCategory>("libros");
  const [linkCategory, setLinkCategory] = useState<BookCategory>("libros");
  const [preferences, setPreferences] = useState<UiPreferences>(
    DEFAULT_UI_PREFERENCES
  );
  const [stats, setStats] = useState<ReadingStats | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const toastId = useRef(0);
  const dragDepth = useRef(0);

  const pushToast = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const toast: Toast = { id: (toastId.current += 1), text, tone };
    setToasts((previous) => [...previous, toast]);
    window.setTimeout(() => {
      setToasts((previous) => previous.filter((item) => item.id !== toast.id));
    }, 3800);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Carga inicial                                                     */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let alive = true;
    (async () => {
      const library = await loadLibrary();
      if (!alive) return;
      setBooks(library);
      setProgress(getAllProgress());
      setStats(loadReadingStats());
      try {
        setLastBookId(window.localStorage.getItem(LAST_BOOK_KEY));
      } catch {
        // Ignorar.
      }
    })();

    const stored = loadUiPreferences();
    setPreferences(stored);
    applyUiPreferences(stored);

    return () => {
      alive = false;
    };
  }, []);

  // Las estadísticas se actualizan al volver del lector (bfcache).
  useEffect(() => {
    const refresh = () => {
      setStats(loadReadingStats());
      setProgress(getAllProgress());
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    const current =
      document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    setTheme(current);
  }, []);

  useEffect(() => {
    if (!books || books.length === 0) return;
    if (!("serviceWorker" in navigator)) return;

    const urls = books
      .slice(0, 90)
      .map((book) => `/read/${encodeURIComponent(book.id)}`);

    navigator.serviceWorker.ready
      .then((registration) => {
        registration.active?.postMessage({ type: "CACHE_ROUTES", urls });
      })
      .catch(() => {
        // Sin service worker (desarrollo o navegador sin soporte).
      });
  }, [books]);

  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Ignorar.
    }
  }, [theme]);

  /* ---------------------------------------------------------------- */
  /* Importación                                                       */
  /* ---------------------------------------------------------------- */

  const handlePickFiles = useCallback((target: BookCategory) => {
    setImportCategory(target);
    setSettingsOpen(false);
    window.setTimeout(() => fileInputRef.current?.click(), 40);
  }, []);

  const handlePickFolder = useCallback((target: BookCategory) => {
    setImportCategory(target);
    setSettingsOpen(false);
    window.setTimeout(() => folderInputRef.current?.click(), 40);
  }, []);

  const handleAddLink = useCallback((target: BookCategory) => {
    setLinkCategory(target);
    setSettingsOpen(false);
    setLinkOpen(true);
  }, []);

  const updatePreferences = useCallback((patch: Partial<UiPreferences>) => {
    setPreferences((previous) => {
      const next = { ...previous, ...patch };
      saveUiPreferences(next);
      return next;
    });
  }, []);

  const importFiles = useCallback(
    async (items: ImportedFile[], targetCategory: BookCategory) => {
      const pdfs = items.filter(
        (item) =>
          item.file.name.toLowerCase().endsWith(".pdf") ||
          item.file.type === "application/pdf" ||
          isPdfPath(item.path)
      );
      if (pdfs.length === 0) {
        pushToast("No encontramos archivos PDF en lo que has soltado", "error");
        return;
      }

      let added = 0;
      let failed = 0;

      for (let index = 0; index < pdfs.length; index += 1) {
        const item = pdfs[index];
        setImporting({
          name: item.file.name,
          stage: "Leyendo el documento…",
          index: index + 1,
          total: pdfs.length,
        });
        try {
          const book = await importPdfFile(item.file, {
            onStage: (stage) =>
              setImporting((previous) =>
                previous ? { ...previous, stage } : previous
              ),
            category: targetCategory,
            folderPath: folderOfPath(item.path),
            autoMetadata: preferences.autoMetadata,
          });
          setBooks((previous) => [book, ...(previous ?? [])]);
          added += 1;
          if (pdfs.length === 1) {
            pushToast(`«${book.title}» ya está en tu estantería`);
          }
        } catch (cause) {
          failed += 1;
          pushToast(
            cause instanceof Error ? cause.message : "No pudimos importar el PDF",
            "error"
          );
        }
      }

      if (pdfs.length > 1) {
        if (added > 0) {
          pushToast(
            `${added} ${added === 1 ? "PDF añadido" : "PDF añadidos"} a la biblioteca${
              failed > 0 ? ` · ${failed} con error` : ""
            }`
          );
        } else if (failed === 0) {
          pushToast("No se pudo añadir ningún PDF", "error");
        }
      }

      setImporting(null);
    },
    [preferences.autoMetadata, pushToast]
  );

  const addLinkedBook = useCallback(
    (book: Book) => {
      setBooks((previous) => [book, ...(previous ?? [])]);
      pushToast(`«${book.title}» ya está en tu estantería`);
    },
    [pushToast]
  );

  useEffect(() => {
    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const handleEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    };
    const handleOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const handleLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const handleDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const transfer = event.dataTransfer;
      const target = category === "todas" ? "libros" : category;
      void collectFromDataTransfer(transfer).then((items) => {
        if (items.length > 0) void importFiles(items, target);
      });
    };

    window.addEventListener("dragenter", handleEnter);
    window.addEventListener("dragover", handleOver);
    window.addEventListener("dragleave", handleLeave);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleEnter);
      window.removeEventListener("dragover", handleOver);
      window.removeEventListener("dragleave", handleLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, [importFiles, category]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const items = collectFromFileList(event.target.files);
    event.target.value = "";
    if (items.length > 0) void importFiles(items, importCategory);
  };

  /* ---------------------------------------------------------------- */
  /* Eliminación                                                       */
  /* ---------------------------------------------------------------- */

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await removeBook(pendingDelete);
      setBooks((previous) =>
        previous ? previous.filter((book) => book.id !== pendingDelete.id) : previous
      );
      pushToast(`«${pendingDelete.title}» se ha eliminado`);
      setPendingDelete(null);
    } catch {
      pushToast("No pudimos eliminar el libro", "error");
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, pushToast]);

  const toggleFavorite = useCallback(
    (book: Book) => {
      const favorite = book.favorite !== true;
      try {
        saveBookMeta(book.id, { favorite });
      } catch {
        pushToast("No pudimos guardar el favorito en este navegador", "error");
        return;
      }
      setBooks((previous) =>
        previous
          ? previous.map((item) =>
              item.id === book.id ? { ...item, favorite } : item
            )
          : previous
      );
      pushToast(
        favorite
          ? `«${book.title}» está en favoritos`
          : `«${book.title}» ya no está en favoritos`
      );
    },
    [pushToast]
  );

  const handleEdited = useCallback(
    (saved: Book) => {
      setBooks((previous) =>
        previous
          ? previous.map((item) => (item.id === saved.id ? saved : item))
          : previous
      );
      pushToast("Ficha actualizada");
    },
    [pushToast]
  );

  /* ---------------------------------------------------------------- */
  /* Derivados                                                         */
  /* ---------------------------------------------------------------- */

  const categoryCounts = useMemo(() => {
    const counts = new Map<BookCategory, number>();
    for (const book of books ?? []) {
      const key = categoryOf(book);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [books]);

  const scopedBooks = useMemo(
    () =>
      category === "todas"
        ? books ?? []
        : (books ?? []).filter((book) => categoryOf(book) === category),
    [books, category]
  );

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const book of scopedBooks) {
      for (const item of book.tags) {
        counts.set(item, (counts.get(item) ?? 0) + 1);
      }
    }
    return counts;
  }, [scopedBooks]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      todos: scopedBooks.length,
      favoritos: 0,
      pendiente: 0,
      leyendo: 0,
      terminado: 0,
      abandonado: 0,
    };
    for (const book of scopedBooks) {
      if (book.favorite) counts.favoritos += 1;
      counts[effectiveStatus(book, progress[book.id])] += 1;
    }
    return counts;
  }, [scopedBooks, progress]);

  const tags = useMemo(
    () =>
      [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
        .map(([name]) => name),
    [tagCounts]
  );

  const visible = useMemo(() => {
    const needle = fold(query);
    const list = scopedBooks.filter((book) => {
      if (tag !== ALL && !book.tags.includes(tag)) return false;
      if (statusFilter === "favoritos" && !book.favorite) return false;
      if (
        statusFilter !== "todos" &&
        statusFilter !== "favoritos" &&
        effectiveStatus(book, progress[book.id]) !== statusFilter
      ) {
        return false;
      }
      if (!needle) return true;
      const haystack = fold(
        `${book.title} ${book.author} ${book.tags.join(" ")} ${book.fileName ?? ""}`
      );
      return haystack.includes(needle);
    });

    if (sort === "titulo") {
      return [...list].sort((a, b) => a.title.localeCompare(b.title, "es"));
    }
    if (sort === "paginas") {
      return [...list].sort((a, b) => b.pages - a.pages);
    }
    return [...list].sort((a, b) => b.addedAt - a.addedAt);
  }, [scopedBooks, query, sort, tag, statusFilter, progress]);

  const chooseCategory = useCallback((next: CategoryFilter, scroll = false) => {
    setCategory(next);
    setTag(ALL);
    setStatusFilter("todos");
    if (scroll) {
      window.requestAnimationFrame(() => {
        document
          .getElementById("estanteria")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }, []);

  const activeCategory =
    category === "todas"
      ? null
      : CATEGORIES.find((item) => item.key === category) ?? null;

  const lastRead = useMemo(() => {
    if (!books || books.length === 0) return null;
    const remembered = lastBookId
      ? books.find((book) => book.id === lastBookId)
      : undefined;
    if (remembered) return remembered;
    const started = books
      .filter((book) => (progress[book.id]?.page ?? 0) > 0)
      .sort(
        (a, b) =>
          (progress[b.id]?.updatedAt ?? 0) - (progress[a.id]?.updatedAt ?? 0)
      );
    return started[0] ?? books[0];
  }, [books, lastBookId, progress]);

  const lastReadProgress = lastRead ? progress[lastRead.id] : undefined;
  const lastReadPercent =
    lastRead && lastReadProgress
      ? readingPercent(lastReadProgress.page, lastRead.pages)
      : 0;
  const totalPages = (books ?? []).reduce((sum, book) => sum + book.pages, 0);
  const favoriteCount = (books ?? []).filter((book) => book.favorite).length;
  const startedBooks = Object.values(progress).filter(
    (item) => item.page > 0
  ).length;
  const emptyCategory = category !== "todas" && scopedBooks.length === 0;
  const week = stats ? lastDays(stats, 7) : [];
  const weekMax = Math.max(1, ...week.map((day) => day.ms));
  const weekTotal = week.reduce((sum, day) => sum + day.ms, 0);
  const streak = stats ? readingStreak(stats) : 0;

  return (
    <main className="grain min-h-screen overflow-x-hidden bg-paper">
      <a href="#estanteria" className="skip-link">
        Saltar a la estantería
      </a>
      <div className="relative z-[1]">
        <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur-xl">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-5">
            <Link href="/" className="flex items-center gap-2.5" aria-label="Lecty, inicio">
              <span className="grid h-8 w-8 place-items-center rounded-[8px] bg-ink text-paper shadow-[0_6px_14px_-8px_rgb(0_0_0_/_0.6)]">
                <BookOpenIcon className="h-[17px] w-[17px]" />
              </span>
              <span className="font-display text-[22px] leading-none tracking-[-0.04em] text-ink">
                Lecty
              </span>
            </Link>

            <nav className="ml-5 hidden items-center gap-6 text-[12px] font-medium text-muted sm:flex">
              <a className="transition hover:text-ink" href="#categorias">
                Categorías
              </a>
              <a className="transition hover:text-ink" href="#estanteria">
                Estantería
              </a>
              <a className="transition hover:text-ink" href="#estadisticas">
                Estadísticas
              </a>
              <a className="transition hover:text-ink" href="#como-funciona">
                Cómo funciona
              </a>
            </nav>

            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                className="icon-btn"
                onClick={toggleTheme}
                aria-label={
                  theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"
                }
                title={theme === "dark" ? "Tema claro" : "Tema oscuro"}
              >
                {theme === "dark" ? (
                  <SunIcon className="h-[18px] w-[18px]" />
                ) : (
                  <MoonIcon className="h-[18px] w-[18px]" />
                )}
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setSettingsOpen(true)}
                aria-label="Abrir ajustes de la biblioteca"
                title="Ajustes"
              >
                <SlidersIcon className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>
        </header>

        <div className="library-hero">
          <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-16 pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:pb-24 lg:pt-20">
            <div className="relative z-10">
              <div className="flex items-center gap-3">
                <span className="h-px w-9 bg-gold/80" />
                <p className="eyebrow">Biblioteca personal · sin cuentas ni nube</p>
              </div>

              <h1 className="display mt-5 text-[clamp(2.8rem,6.4vw,4.7rem)] leading-[0.93] text-balance text-ink">
                Tu biblioteca,
                <br />
                <em className="italic text-accent">en páginas.</em>
              </h1>

              <p className="mt-6 max-w-[30rem] text-pretty text-[14.5px] leading-relaxed text-ink-soft">
                Abre cualquier PDF como un libro de verdad: paso de hoja, índice,
                búsqueda, marcadores y tu progreso guardado. Todo ocurre en tu
                navegador, sin subir nada a ningún sitio.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-2.5">
                {lastRead ? (
                  <Link
                    href={`/read/${lastRead.id}`}
                    className="btn btn-primary"
                  >
                    <BookOpenIcon className="h-[17px] w-[17px]" />
                    {lastReadPercent > 0 ? "Continuar leyendo" : "Empezar a leer"}
                  </Link>
                ) : (
                  <a href="#categorias" className="btn btn-primary">
                    <BookOpenIcon className="h-[17px] w-[17px]" />
                    Explorar la biblioteca
                  </a>
                )}
                <a href="#categorias" className="btn btn-ghost">
                  <GridIcon className="h-4 w-4" />
                  Ver categorías
                </a>
              </div>

              <dl className="mt-9 flex max-w-md flex-wrap items-start gap-x-9 gap-y-4 border-t border-line/80 pt-5">
                <Stat
                  value={books === null ? "—" : formatInteger(books.length)}
                  label={books?.length === 1 ? "título" : "títulos"}
                />
                <Stat
                  value={books === null ? "—" : formatInteger(totalPages)}
                  label="páginas"
                />
                <Stat
                  value={books === null ? "—" : formatInteger(startedBooks)}
                  label="en curso"
                />
              </dl>
            </div>

            <HeroBook book={lastRead} progress={lastReadProgress} />
          </section>
        </div>

        <section
          id="categorias"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 pb-14"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Organiza tu lectura</p>
              <h2 className="section-title mt-2">Categorías</h2>
              <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-muted">
                Libros, cómics, revistas y documentos. Elige una categoría y
                afina por género desde la estantería.
              </p>
            </div>
            <button
              type="button"
              className="chip"
              data-active={category === "todas"}
              onClick={() => chooseCategory("todas", true)}
            >
              Toda la biblioteca
              <span className="text-[10px] opacity-55">
                {books === null ? "—" : books.length}
              </span>
            </button>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {CATEGORIES.map((item) => {
              const Icon = CATEGORY_ICONS[item.key];
              const count = categoryCounts.get(item.key) ?? 0;
              const active = category === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => chooseCategory(item.key, true)}
                  className={cn(
                    "group relative overflow-hidden rounded-2xl border p-4 text-left transition duration-200",
                    active
                      ? "border-accent/55 bg-surface shadow-[0_18px_35px_-26px_rgb(0_0_0_/_0.55)]"
                      : "border-line bg-surface/50 hover:-translate-y-0.5 hover:border-ink/25 hover:bg-surface/80"
                  )}
                  aria-pressed={active}
                >
                  <span
                    className="absolute inset-x-0 top-0 h-0.5 opacity-75"
                    style={{ backgroundColor: item.accent }}
                    aria-hidden="true"
                  />
                  <span className="flex items-start justify-between gap-3">
                    <span
                      className="grid h-10 w-10 place-items-center rounded-full border border-line bg-paper"
                      style={{ color: item.accent }}
                    >
                      <Icon className="h-[18px] w-[18px]" />
                    </span>
                    <span className="font-display text-[26px] leading-none tracking-[-0.03em] text-ink">
                      {books === null ? "—" : count}
                    </span>
                  </span>
                  <span className="mt-4 block font-display text-[18px] leading-none text-ink">
                    {item.plural}
                  </span>
                  <span className="mt-1.5 block text-[10.5px] leading-relaxed text-muted">
                    {item.blurb}
                  </span>
                  <span className="mt-3 inline-flex items-center gap-1 text-[10px] text-muted transition group-hover:text-accent">
                    Ver categoría
                    <ChevronRightIcon className="h-3 w-3 transition group-hover:translate-x-0.5" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section
          id="estanteria"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 pb-20"
        >
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="eyebrow">
                {activeCategory ? "Categoría" : "Estantería"}
              </p>
              <h2 className="section-title mt-2">
                {activeCategory ? activeCategory.plural : "Todos tus libros"}
              </h2>
              <p className="mt-1.5 text-[11.5px] text-muted">
                {books === null
                  ? "Cargando tu biblioteca…"
                  : `${scopedBooks.length} ${
                      scopedBooks.length === 1 ? "título" : "títulos"
                    } en ${
                      activeCategory
                        ? activeCategory.plural.toLowerCase()
                        : "la biblioteca"
                    }`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="search-shell w-[196px]">
                <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar título o autor…"
                  aria-label="Buscar en la biblioteca"
                  type="search"
                />
                {query && (
                  <button
                    type="button"
                    className="text-muted transition hover:text-ink"
                    onClick={() => setQuery("")}
                    aria-label="Borrar búsqueda"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </label>

              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                aria-label="Ordenar la biblioteca"
                className="h-9 cursor-pointer rounded-full border border-line bg-surface/60 px-3 text-[12px] text-ink-soft outline-none transition hover:border-ink/30 focus:border-accent/60"
              >
                <option value="recientes">Más recientes</option>
                <option value="titulo">Título A–Z</option>
                <option value="paginas">Más páginas</option>
              </select>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[9px] uppercase tracking-[0.16em] text-muted">
              Etiquetas
            </span>
            <button
              type="button"
              className="chip"
              data-active={tag === ALL}
              onClick={() => setTag(ALL)}
            >
              Todas
              <span className="text-[10px] opacity-55">
                {scopedBooks.length}
              </span>
            </button>
            {tags.map((item) => (
              <button
                key={item}
                type="button"
                className="chip"
                data-active={tag === item}
                onClick={() => setTag(item)}
              >
                {item}
                <span className="text-[10px] opacity-55">{tagCounts.get(item)}</span>
              </button>
            ))}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[9px] uppercase tracking-[0.16em] text-muted">
              Estado
            </span>
            <button
              type="button"
              className="chip"
              data-active={statusFilter === "todos"}
              onClick={() => setStatusFilter("todos")}
            >
              Cualquiera
            </button>
            <button
              type="button"
              className="chip"
              data-active={statusFilter === "favoritos"}
              onClick={() => setStatusFilter("favoritos")}
            >
              <HeartIcon className="h-3 w-3" filled={statusFilter === "favoritos"} />
              Favoritos
              <span className="text-[10px] opacity-55">{statusCounts.favoritos}</span>
            </button>
            {READING_STATUSES.map((item) => (
              <button
                key={item.key}
                type="button"
                className="chip"
                data-active={statusFilter === item.key}
                onClick={() => setStatusFilter(item.key)}
              >
                {item.label}
                <span className="text-[10px] opacity-55">
                  {statusCounts[item.key]}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {books === null &&
              Array.from({ length: 5 }).map((_, index) => (
                <div key={index} aria-hidden="true">
                  <div className="book-card-cover">
                    <span className="cover-skeleton" />
                  </div>
                  <div className="mt-4 h-4 w-3/4 animate-pulse rounded bg-line/70" />
                  <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-line/50" />
                </div>
              ))}

            {books !== null &&
              visible.map((book, index) => (
                <BookCard
                  key={book.id}
                  book={book}
                  progress={progress[book.id]}
                  index={index}
                  showCategory={category === "todas"}
                  onDelete={(target) => setPendingDelete(target)}
                  onEdit={(target) => setEditing(target)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
          </div>

          {books !== null && visible.length === 0 && (
            <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface/40 px-6 py-16 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full border border-line bg-paper text-muted">
                {emptyCategory ? (
                  <BookIcon className="h-5 w-5" />
                ) : (
                  <SearchIcon className="h-5 w-5" />
                )}
              </span>
              <p className="display mt-4 text-2xl text-ink">
                {emptyCategory
                  ? `Aún no hay ${activeCategory?.plural.toLowerCase()}`
                  : "Nada por aquí"}
              </p>
              <p className="mt-2 max-w-sm text-[12.5px] leading-relaxed text-muted">
                {emptyCategory
                  ? `Añade un PDF desde Ajustes y guárdalo en ${activeCategory?.plural.toLowerCase()} para verlo aquí.`
                  : `No hay libros que coincidan con estos filtros. Prueba otra búsqueda, etiqueta o estado de lectura.`}
              </p>
              <button
                type="button"
                className="btn btn-ghost mt-5"
                onClick={() => {
                  if (emptyCategory) {
                    setSettingsOpen(true);
                    return;
                  }
                  setQuery("");
                  setTag(ALL);
                  setStatusFilter("todos");
                }}
              >
                {emptyCategory ? (
                  <>
                    <SlidersIcon className="h-4 w-4" />
                    Abrir ajustes
                  </>
                ) : (
                  "Ver todos los libros"
                )}
              </button>
            </div>
          )}
        </section>

        <section
          id="estadisticas"
          className="mx-auto w-full max-w-6xl scroll-mt-20 px-5 py-14 lg:py-16"
        >
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Tu ritmo</p>
              <h2 className="section-title mt-2">Estadísticas de lectura</h2>
              <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-muted">
                Tiempo real con un libro abierto, páginas recorridas y racha.
                Se guarda en este dispositivo y no sale de aquí.
              </p>
            </div>
            <span className="chip cursor-default">
              <HeartIcon className="h-3 w-3" filled={favoriteCount > 0} />
              {favoriteCount} {favoriteCount === 1 ? "favorito" : "favoritos"}
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              icon={ClockIcon}
              label="Tiempo leído"
              value={stats ? formatReadingTime(stats.totalMs) : "—"}
              hint="Con un libro abierto"
            />
            <MetricCard
              icon={BookOpenIcon}
              label="Páginas"
              value={stats ? formatInteger(stats.totalPages) : "—"}
              hint="Páginas recorridas"
            />
            <MetricCard
              icon={ChartIcon}
              label="Sesiones"
              value={stats ? formatInteger(stats.sessions) : "—"}
              hint="Aperturas del lector"
            />
            <MetricCard
              icon={SparkIcon}
              label="Racha"
              value={
                stats
                  ? `${formatInteger(streak)} ${streak === 1 ? "día" : "días"}`
                  : "—"
              }
              hint="Días seguidos leyendo"
            />
          </div>

          <div className="mt-4 rounded-2xl border border-line/80 bg-surface/60 p-5">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[12.5px] font-semibold text-ink">
                  Últimos 7 días
                </p>
                <p className="mt-0.5 text-[10.5px] text-muted">
                  {stats && weekTotal > 0
                    ? `${formatReadingTime(weekTotal)} esta semana`
                    : "Abre un libro y empieza a llenar la gráfica"}
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-[0.16em] text-muted">
                Tiempo por día
              </span>
            </div>

            <div
              className="stats-bars mt-5"
              role="img"
              aria-label="Tiempo de lectura de los últimos siete días"
            >
              {week.map((day) => (
                <div
                  key={day.key}
                  className="stats-bar-col"
                  title={`${day.label}: ${formatReadingTime(day.ms)}${
                    day.pages > 0 ? ` · ${day.pages} págs.` : ""
                  }`}
                >
                  <span className="stats-bar-value">
                    {day.ms > 0 ? formatReadingTime(day.ms) : ""}
                  </span>
                  <div className="stats-bar-track">
                    <div
                      className="stats-bar-fill"
                      data-empty={day.ms === 0}
                      style={{
                        height:
                          day.ms > 0
                            ? `${Math.max(8, Math.round((day.ms / weekMax) * 100))}%`
                            : "3%",
                      }}
                    />
                  </div>
                  <span
                    className={cn(
                      "stats-bar-label",
                      day.today && "text-accent"
                    )}
                  >
                    {day.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="como-funciona"
          className="scroll-mt-20 border-y border-line/70 bg-surface/40"
        >
          <div className="mx-auto w-full max-w-6xl px-5 py-16 lg:py-20">
            <div className="max-w-2xl">
              <p className="eyebrow">Hecho para leer</p>
              <h2 className="section-title mt-2 text-balance">
                La sensación de un libro, con la comodidad de una pantalla.
              </h2>
            </div>

            <div className="mt-10 grid gap-x-8 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="relative">
                    <div className="flex items-center justify-between">
                      <span className="grid h-10 w-10 place-items-center rounded-full border border-line bg-paper text-accent">
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="font-display text-[12px] italic text-muted/60">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="mt-4 text-[15px] font-semibold tracking-[-0.01em] text-ink">
                      {feature.title}
                    </h3>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                      {feature.text}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-line/80 bg-paper/70 px-5 py-4">
              <span className="flex items-center gap-2 text-[11.5px] text-ink-soft">
                <CheckDot /> Importa hasta 120 MB por PDF
              </span>
              <span className="flex items-center gap-2 text-[11.5px] text-ink-soft">
                <CheckDot /> Funciona sin conexión una vez cargado
              </span>
              <span className="flex items-center gap-2 text-[11.5px] text-ink-soft">
                <CheckDot /> Tus archivos nunca salen de este navegador
              </span>
            </div>
          </div>
        </section>

        <footer className="mx-auto w-full max-w-6xl px-5 py-10">
          <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2.5">
              <span className="grid h-7 w-7 place-items-center rounded-[7px] bg-ink text-paper">
                <BookIcon className="h-4 w-4" />
              </span>
              <div>
                <p className="font-display text-[16px] leading-none text-ink">Lecty</p>
                <p className="mt-1 text-[10.5px] text-muted">
                  Tu biblioteca, en páginas.
                </p>
              </div>
            </div>
            <p className="text-[10.5px] leading-relaxed text-muted">
              Hecho para lectores · PDF renderizados con pdf.js · Sin cuentas, sin
              seguimiento.
            </p>
          </div>
        </footer>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        onChange={handleInputChange}
        tabIndex={-1}
      />

      <input
        ref={(node) => {
          folderInputRef.current = node;
          node?.setAttribute("webkitdirectory", "");
        }}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        onChange={handleInputChange}
        tabIndex={-1}
      />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[90] grid place-items-center bg-ink/45 p-6 backdrop-blur-[3px]">
          <div className="rounded-2xl border-2 border-dashed border-cream/50 bg-surface/95 px-10 py-14 text-center shadow-2xl sm:px-16">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent/10 text-accent">
              <UploadIcon className="h-6 w-6" />
            </span>
            <p className="display mt-5 text-3xl text-ink">Suelta tus PDF aquí</p>
            <p className="mt-2 max-w-xs text-[12.5px] leading-relaxed text-muted">
              Archivos o carpetas completas. Se añadirán a tu biblioteca local y
              nada sale de este navegador.
            </p>
          </div>
        </div>
      )}

      {importing && (
        <div
          className="fixed bottom-5 right-5 z-[92] w-[min(320px,calc(100vw-2.5rem))] rounded-2xl border border-line bg-surface p-4 shadow-2xl"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent" />
            <div className="min-w-0 flex-1">
              <p className="text-[9.5px] uppercase tracking-[0.18em] text-muted">
                Importando {importing.index} de {importing.total}
              </p>
              <p className="mt-1 truncate text-[12.5px] font-medium text-ink">
                {importing.name}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted">
                {importing.stage}
              </p>
            </div>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-line">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-accent" />
          </div>
        </div>
      )}

      <div
        className="pointer-events-none fixed bottom-5 left-1/2 z-[95] flex -translate-x-1/2 flex-col items-center gap-2 px-4"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn("toast", toast.tone === "error" && "!bg-[#6f2a22]")}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                toast.tone === "error" ? "bg-[#ffb9a8]" : "bg-[#d6b57b]"
              )}
            />
            <span className="max-w-[70vw] truncate">{toast.text}</span>
          </div>
        ))}
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        books={books}
        theme={theme}
        onToggleTheme={toggleTheme}
        onPickFiles={handlePickFiles}
        onPickFolder={handlePickFolder}
        onAddLink={handleAddLink}
        preferences={preferences}
        onChangePreferences={updatePreferences}
        defaultCategory={category === "todas" ? "libros" : category}
      />

      {linkOpen && (
        <AddLinkDialog
          initialCategory={linkCategory}
          onClose={() => setLinkOpen(false)}
          onAdded={addLinkedBook}
        />
      )}

      {editing && (
        <EditBookDialog
          book={editing}
          onClose={() => setEditing(null)}
          onSaved={handleEdited}
        />
      )}

      {pendingDelete &&
        createPortal(
          <div
            className="fixed inset-0 z-[96] grid place-items-center p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-book-title"
          >
            <div
              className="modal-backdrop"
              onClick={() => !deleting && setPendingDelete(null)}
              aria-hidden="true"
            />
            <div className="modal-card w-full max-w-[404px] p-6">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#b4332a]/10 text-[#b4332a]">
                <TrashIcon className="h-5 w-5" />
              </span>
              <h2
                id="delete-book-title"
                className="display mt-4 text-[26px] leading-tight text-ink"
              >
                ¿Eliminar este libro?
              </h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                «{pendingDelete.title}» se quitará de tu biblioteca junto con su
                progreso y sus marcadores.
                {pendingDelete.kind === "upload" &&
                  " El PDF solo existe en este navegador, así que también se borrará el archivo."}
                {pendingDelete.kind === "link" &&
                  " El PDF seguirá disponible en su dirección original."}
              </p>
              {pendingDelete.kind === "upload" && (
                <p className="mt-3 truncate rounded-lg bg-paper px-3 py-2 text-[10.5px] text-muted">
                  {pendingDelete.fileName}
                  {pendingDelete.size
                    ? ` · ${formatBytes(pendingDelete.size)}`
                    : null}
                </p>
              )}
              {pendingDelete.kind === "link" && pendingDelete.url && (
                <p className="mt-3 truncate rounded-lg bg-paper px-3 py-2 text-[10.5px] text-muted">
                  {pendingDelete.url}
                </p>
              )}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost !px-4 !py-2.5 text-[12px]"
                  onClick={() => setPendingDelete(null)}
                  disabled={deleting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn !bg-[#a3362b] !px-4 !py-2.5 text-[12px] !text-[#fff6f2] hover:!bg-[#8d2c23] disabled:opacity-60"
                  onClick={() => void confirmDelete()}
                  disabled={deleting}
                >
                  {deleting ? "Eliminando…" : "Eliminar"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </main>
  );
}

/* ------------------------------------------------------------------ */
/* Piezas                                                              */
/* ------------------------------------------------------------------ */

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dd className="font-display text-[24px] leading-none tracking-[-0.03em] text-ink">
        {value}
      </dd>
      <dt className="mt-1.5 text-[10px] uppercase tracking-[0.16em] text-muted">
        {label}
      </dt>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof ClockIcon;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-line/80 bg-surface/60 p-4">
      <div className="flex items-center gap-2 text-muted">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-accent/10 text-accent">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[9.5px] uppercase tracking-[0.16em]">{label}</span>
      </div>
      <p className="mt-3 font-display text-[26px] leading-none tracking-[-0.03em] text-ink">
        {value}
      </p>
      <p className="mt-1.5 text-[10px] text-muted">{hint}</p>
    </div>
  );
}

function CheckDot() {
  return (
    <span className="grid h-4 w-4 place-items-center rounded-full bg-accent/10 text-accent">
      <SparkIcon className="h-2.5 w-2.5" />
    </span>
  );
}

function HeroBook({
  book,
  progress,
}: {
  book: Book | null;
  progress?: Progress;
}) {
  const { cover, loading } = useBookCover(book);

  if (!book) {
    return (
      <div className="relative mx-auto w-full max-w-[380px]">
        <div className="hero-book-scene h-[400px]">
          <div className="hero-glow" />
          <div className="h-[352px] w-[252px] animate-pulse rounded-[3px_9px_9px_3px] bg-surface shadow-2xl" />
        </div>
      </div>
    );
  }

  const percent = progress ? readingPercent(progress.page, book.pages) : 0;
  const href = `/read/${book.id}`;

  return (
    <div className="relative mx-auto w-full max-w-[380px]">
      <div className="hero-book-scene h-[400px]">
        <div className="hero-glow" />
        <Link
          href={href}
          className="hero-book block"
          aria-label={`Abrir «${book.title}»`}
        >
          <div className="hero-book-pages" />
          <div className="hero-book-spine" />
          <div className="hero-book-cover">
            {cover ? (
              <>
                <img
                  src={cover}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  draggable={false}
                />
                <span className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/10" />
              </>
            ) : loading ? (
              <span className="absolute inset-4 animate-pulse rounded-sm bg-white/10" />
            ) : (
              <CoverFallback book={book} />
            )}
          </div>
        </Link>
        <div className="hero-book-shadow" />
      </div>

      <Link
        href={href}
        className="group mx-auto mt-2 flex w-full max-w-[318px] items-center gap-3 rounded-xl border border-line/80 bg-surface/75 p-3 shadow-[0_12px_30px_-22px_rgb(0_0_0_/_0.45)] backdrop-blur transition hover:-translate-y-0.5 hover:border-accent/35 hover:shadow-[0_18px_34px_-20px_rgb(0_0_0_/_0.35)]"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line/80 bg-paper text-accent">
          {percent > 0 ? (
            <ClockIcon className="h-[17px] w-[17px]" />
          ) : (
            <BookOpenIcon className="h-[17px] w-[17px]" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] uppercase tracking-[0.19em] text-muted">
            {percent > 0 ? "Continuar leyendo" : "Empezar a leer"}
          </span>
          <span className="mt-0.5 block truncate font-display text-[14px] leading-tight text-ink">
            {book.title}
          </span>
          <span className="mt-1.5 flex items-center gap-2">
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-line">
              <span
                className="block h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${Math.max(percent, 3)}%` }}
              />
            </span>
            <span className="shrink-0 text-[9.5px] tabular-nums text-muted">
              {percent > 0 ? `${percent}%` : `${book.pages} págs.`}
            </span>
          </span>
        </span>
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent" />
      </Link>
    </div>
  );
}

const FEATURES = [
  {
    icon: SparkIcon,
    title: "Paso de hoja real",
    text: "Hojas que giran en 3D, con sombra y sonido opcional. Tan natural que apetece pasar la siguiente.",
  },
  {
    icon: SearchIcon,
    title: "Índice y búsqueda",
    text: "Salta a cualquier capítulo del PDF o encuentra una frase en todo el documento en segundos.",
  },
  {
    icon: BookmarkIcon,
    title: "Marcadores y progreso",
    text: "Cada libro recuerda dónde lo dejaste y guarda tus páginas favoritas, incluso al cerrar el navegador.",
  },
  {
    icon: ShieldIcon,
    title: "Privado por diseño",
    text: "Tus PDF se quedan en este dispositivo. Sin cuentas, sin servidores, sin esperas ni seguimiento.",
  },
];
