"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Book, Bookmark, OutlineNode, ReaderMode, ReaderSettings, SearchHit } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { findBook, resolveBookSource } from "@/lib/books";
import { BookRenderer } from "@/lib/pdf";
import {
  getBookmarks,
  getProgress,
  LAST_BOOK_KEY,
  removeBookmark,
  setProgress,
  readSettings,
  writeSettings,
  toggleBookmark,
  THEME_KEY,
} from "@/lib/storage";
import { clamp, cn, pageRangeLabel } from "@/lib/utils";
import { addReadingTime, beginReadingSession } from "@/lib/reading-stats";
import {
  loadUiPreferences,
  systemPrefersReducedMotion,
} from "@/lib/preferences";
import Flipbook, {
  type FlipbookHandle,
  type FlipbookNavigate,
} from "@/components/reader/Flipbook";
import {
  HelpDialog,
  LibraryDrawer,
  ReaderToasts,
  SearchDrawer,
  SettingsPopover,
  type LeftTab,
} from "@/components/reader/ReaderPanels";
import {
  ArrowLeftIcon,
  BookmarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GridIcon,
  ListIcon,
  MaximizeIcon,
  MinimizeIcon,
  SearchIcon,
  SlidersIcon,
} from "@/components/icons";

type Status = "loading" | "ready" | "error";

type Position = {
  page: number;
  spreadIndex: number;
  totalSpreads: number;
  spread: { left: number | null; right: number | null };
};

const ZOOM_STEPS = [1, 1.25, 1.5, 1.75, 2, 2.5];

export default function ReaderClient({ id }: { id: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState("Buscando el libro…");
  const [book, setBook] = useState<Book | null>(null);
  const [renderer, setRenderer] = useState<BookRenderer | null>(null);
  const [initialPage, setInitialPage] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);

  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [narrow, setNarrow] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);

  const [leftPanel, setLeftPanel] = useState<LeftTab | null>(null);
  const [leftTab, setLeftTab] = useState<LeftTab>("toc");
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const [outline, setOutline] = useState<OutlineNode[]>([]);
  const [outlineLoading, setOutlineLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchProgress, setSearchProgress] = useState({ done: 0, total: 0 });

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [toasts, setToasts] = useState<Array<{ id: number; text: string }>>([]);

  const flipRef = useRef<FlipbookHandle>(null);
  const bookRef = useRef<Book | null>(null);
  const toastId = useRef(0);
  const searchController = useRef<AbortController | null>(null);
  const pendingPages = useRef(0);
  const lastPageRef = useRef(0);

  const pushToast = useCallback((text: string) => {
    const toast = { id: (toastId.current += 1), text };
    setToasts((previous) => [...previous, toast]);
    window.setTimeout(() => {
      setToasts((previous) => previous.filter((item) => item.id !== toast.id));
    }, 2600);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Ajustes y tamaño                                                  */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);

    const stored = readSettings<Partial<ReaderSettings>>({});
    setSettings({ ...DEFAULT_SETTINGS, ...stored });
    setReduceMotion(
      loadUiPreferences().reduceMotion || systemPrefersReducedMotion()
    );

    const handleFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreen);

    return () => {
      media.removeEventListener("change", update);
      document.removeEventListener("fullscreenchange", handleFullscreen);
    };
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    if (!book) return;
    const previous = document.title;
    document.title = `${book.title} — Lecty`;
    return () => {
      document.title = previous;
    };
  }, [book]);

  const updateSettings = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...patch };
      writeSettings(next);
      return next;
    });
    if (patch.theme) {
      try {
        window.localStorage.setItem(THEME_KEY, patch.theme === "night" ? "dark" : "light");
      } catch {
        // Ignorar.
      }
    }
  }, []);

  const effectiveMode: ReaderMode = narrow ? "single" : settings.mode;

  /* ---------------------------------------------------------------- */
  /* Carga del libro                                                   */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    let cancelled = false;
    let created: BookRenderer | null = null;
    let revoke: (() => void) | null = null;

    setStatus("loading");
    setError(null);
    setBook(null);
    setRenderer(null);
    setStep("Buscando el libro…");

    (async () => {
      const found = await findBook(id);
      if (!found) throw new Error("Este libro ya no está en tu biblioteca.");
      if (cancelled) return;
      setBook(found);
      bookRef.current = found;
      try {
        window.localStorage.setItem(LAST_BOOK_KEY, found.id);
      } catch {
        // Ignorar.
      }
      setStep("Abriendo el documento…");

      const source = await resolveBookSource(found);
      revoke = source.revoke;
      const targetHeight = Math.min(
        2000,
        Math.max(1200, Math.round(window.innerHeight * 1.8))
      );
      const loaded = await BookRenderer.open(source.url, { targetHeight });
      created = loaded;
      if (cancelled) return;

      const saved = getProgress(found.id);
      const startPage = clamp(saved?.page ?? 0, 0, loaded.pageCount - 1);
      setInitialPage(startPage);
      lastPageRef.current = startPage;
      setBookmarks(getBookmarks(found.id));

      setStep("Componiendo las páginas…");
      const qualityPages = Array.from(
        new Set(
          [startPage - 1, startPage, startPage + 1, 0, 1].filter(
            (page) => page >= 0 && page < loaded.pageCount
          )
        )
      );
      await Promise.all(
        qualityPages.map((page) => loaded.getPage(page).catch(() => null))
      );
      if (cancelled) return;

      setRenderer(loaded);
      setStatus("ready");
    })().catch((cause: unknown) => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause.message : "No pudimos abrir este documento.");
      setStatus("error");
    });

    return () => {
      cancelled = true;
      if (created) void created.destroy();
      revoke?.();
      bookRef.current = null;
    };
  }, [id]);

  useEffect(() => {
    if (!renderer) return;
    let alive = true;
    setOutlineLoading(true);
    renderer
      .getOutline()
      .then((items) => {
        if (alive) setOutline(items);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setOutlineLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [renderer]);

  useEffect(() => {
    return () => {
      searchController.current?.abort();
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* Navegación                                                        */
  /* ---------------------------------------------------------------- */

  const handleNavigate = useCallback<FlipbookNavigate>((info) => {
    const previous = lastPageRef.current;
    if (info.page !== previous) {
      pendingPages.current += Math.min(Math.abs(info.page - previous), 20);
      lastPageRef.current = info.page;
    }
    setPosition(info);
    if (bookRef.current) {
      setProgress(bookRef.current.id, info.page);
    }
  }, []);

  // Tiempo de lectura: se acumula cada 20 s y al ocultar o cerrar el lector.
  useEffect(() => {
    if (!book || !renderer) return;
    beginReadingSession();
    let last = Date.now();
    pendingPages.current = 0;

    const flush = () => {
      const now = Date.now();
      const elapsed = now - last;
      last = now;
      const pages = pendingPages.current;
      pendingPages.current = 0;
      addReadingTime(elapsed, pages);
    };

    const timer = window.setInterval(flush, 20_000);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      flush();
    };
  }, [book, renderer]);

  const goToPage = useCallback(
    (page: number) => {
      flipRef.current?.goToPage(page);
      if (window.innerWidth < 1024) {
        setLeftPanel(null);
        setSearchOpen(false);
      }
    },
    []
  );

  const next = useCallback(() => flipRef.current?.next(), []);
  const prev = useCallback(() => flipRef.current?.prev(), []);

  const closeAll = useCallback(() => {
    setLeftPanel(null);
    setSearchOpen(false);
    setSettingsOpen(false);
  }, []);

  const currentPage = position?.page ?? initialPage;
  const currentPages = position
    ? [position.spread.left, position.spread.right].filter(
        (page): page is number => page != null
      )
    : [initialPage];
  const pageLabel = pageRangeLabel(currentPages);
  const pageCount = renderer?.pageCount ?? book?.pages ?? 0;
  const isBookmarked = bookmarks.some((bookmark) => bookmark.page === currentPage);
  const atStart = (position?.spreadIndex ?? 0) === 0;
  const atEnd = position
    ? position.spreadIndex >= position.totalSpreads - 1
    : false;
  const progressPercent =
    position && position.totalSpreads > 1
      ? (position.spreadIndex / (position.totalSpreads - 1)) * 100
      : 0;

  const toggleBookmarkForPage = useCallback(async () => {
    if (!book || !renderer) return;
    const page = currentPage;
    const snippet = await renderer.getSnippet(page, 90);
    const result = toggleBookmark(book.id, page, snippet);
    setBookmarks(result.bookmarks);
    pushToast(
      result.added ? `Marcador en la página ${page + 1}` : "Marcador eliminado"
    );
  }, [book, currentPage, pushToast, renderer]);

  const removeBookmarkById = useCallback(
    (bookmarkId: string) => {
      if (!book) return;
      setBookmarks(removeBookmark(book.id, bookmarkId));
      pushToast("Marcador eliminado");
    },
    [book, pushToast]
  );

  /* ---------------------------------------------------------------- */
  /* Búsqueda                                                          */
  /* ---------------------------------------------------------------- */

  const runSearch = useCallback(async () => {
    const term = query.trim();
    if (!renderer || term.length < 2) return;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setSearching(true);
    setSearched(false);
    setResults([]);
    setSearchProgress({ done: 0, total: renderer.pageCount });
    try {
      const hits = await renderer.search(term, {
        signal: controller.signal,
        onProgress: (done, total) => setSearchProgress({ done, total }),
      });
      if (!controller.signal.aborted) {
        setResults(hits);
        setSearched(true);
      }
    } catch {
      if (!controller.signal.aborted) {
        setResults([]);
        setSearched(true);
        pushToast("No pudimos completar la búsqueda");
      }
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }, [pushToast, query, renderer]);

  const cancelSearch = useCallback(() => {
    searchController.current?.abort();
    setSearching(false);
  }, []);

  /* ---------------------------------------------------------------- */
  /* Pantalla completa, zoom, teclado                                  */
  /* ---------------------------------------------------------------- */

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      pushToast("La pantalla completa no está disponible");
    }
  }, [pushToast]);

  const zoomBy = useCallback(
    (direction: 1 | -1) => {
      const current = settings.zoom;
      const index = ZOOM_STEPS.findIndex((stepValue) => stepValue >= current - 0.001);
      let targetIndex = index === -1 ? ZOOM_STEPS.length - 1 : index;
      targetIndex = clamp(targetIndex + direction, 0, ZOOM_STEPS.length - 1);
      updateSettings({ zoom: ZOOM_STEPS[targetIndex] });
    },
    [settings.zoom, updateSettings]
  );

  const openLeftPanel = useCallback(
    (tab: LeftTab) => {
      setSearchOpen(false);
      setSettingsOpen(false);
      setLeftTab(tab);
      setLeftPanel(tab);
    },
    []
  );

  const openSearch = useCallback(() => {
    setLeftPanel(null);
    setSettingsOpen(false);
    setSearchOpen(true);
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        if (event.key === "Escape") target.blur();
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.key) {
        case "ArrowRight":
        case "PageDown":
          event.preventDefault();
          next();
          break;
        case "ArrowLeft":
        case "PageUp":
          event.preventDefault();
          prev();
          break;
        case " ":
          event.preventDefault();
          if (event.shiftKey) prev();
          else next();
          break;
        case "Home":
          event.preventDefault();
          flipRef.current?.goToSpread(0);
          break;
        case "End":
          event.preventDefault();
          if (position) flipRef.current?.goToSpread(position.totalSpreads - 1);
          break;
        case "b":
        case "B":
          void toggleBookmarkForPage();
          break;
        case "t":
        case "T":
          openLeftPanel("toc");
          break;
        case "m":
        case "M":
          openLeftPanel("thumbs");
          break;
        case "f":
        case "F":
          void toggleFullscreen();
          break;
        case "h":
        case "H":
          setChromeVisible((value) => !value);
          break;
        case "/":
          event.preventDefault();
          openSearch();
          break;
        case "+":
        case "=":
          zoomBy(1);
          break;
        case "-":
          zoomBy(-1);
          break;
        case "0":
          updateSettings({ zoom: 1 });
          break;
        case "?":
          setHelpOpen(true);
          break;
        case "Escape":
          closeAll();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    closeAll,
    next,
    openLeftPanel,
    openSearch,
    position,
    prev,
    toggleBookmarkForPage,
    toggleFullscreen,
    updateSettings,
    zoomBy,
  ]);

  /* ---------------------------------------------------------------- */
  /* Vistas                                                            */
  /* ---------------------------------------------------------------- */

  if (status === "loading") {
    return (
      <div className="reader" data-reader-theme={settings.theme}>
        <div className="reader-desk flex-1">
          <div className="relative z-[2] m-auto flex flex-col items-center gap-7 px-6 py-10 text-center">
            <div className="relative h-[228px] w-[164px] [perspective:900px]">
              <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-r-md bg-[#d9cdb8]/85" />
              <div className="absolute inset-0 rounded-r-md bg-gradient-to-br from-[#28493b] to-[#132820] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8)]">
                <div className="absolute inset-4 rounded-sm border border-[#c7a46d]/40" />
                <div className="absolute inset-x-7 top-12 space-y-2">
                  <div className="h-2.5 w-3/4 rounded bg-[#e7d3ab]/70" />
                  <div className="h-2.5 w-1/2 rounded bg-[#e7d3ab]/40" />
                </div>
                <div className="absolute bottom-8 left-1/2 h-px w-10 -translate-x-1/2 bg-[#c7a46d]/60" />
              </div>
              <div className="absolute inset-y-0 left-0 w-2 rounded-l-md bg-black/35" />
              <div className="absolute -inset-8 -z-10 animate-pulse rounded-full bg-[#c7a46d]/10 blur-2xl" />
            </div>
            <div>
              <p className="font-display text-xl text-white/85">
                {book ? `Abriendo «${book.title}»` : "Preparando tu libro"}
              </p>
              <p className="mt-2 text-[11.5px] text-white/35">{step}</p>
            </div>
            <div className="h-0.5 w-44 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-[#d6b57b]" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="reader" data-reader-theme={settings.theme}>
        <div className="reader-desk flex-1">
          <div className="relative z-[2] m-auto flex max-w-md flex-col items-center gap-5 px-6 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-[#e3c48d]">
              <BookmarkIcon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl text-white/90">No pudimos abrir el libro</h1>
              <p className="mt-2 text-[12.5px] leading-relaxed text-white/45">{error}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link
                href="/"
                className="rounded-full bg-white/10 px-5 py-2.5 text-[12px] text-white/85 transition hover:bg-white/15"
              >
                Volver a la biblioteca
              </Link>
              <button
                type="button"
                className="rounded-full border border-white/10 px-5 py-2.5 text-[12px] text-white/55 transition hover:text-white/85"
                onClick={() => window.location.reload()}
              >
                Reintentar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("reader", !chromeVisible && "chrome-hidden")}
      data-reader-theme={settings.theme}
    >
      <header className="reader-topbar">
        <Link
          href="/"
          className="reader-btn"
          aria-label="Volver a la biblioteca"
          title="Volver a la biblioteca"
        >
          <ArrowLeftIcon className="h-[18px] w-[18px]" />
        </Link>

        <div className="mx-1 hidden h-8 w-6 shrink-0 overflow-hidden rounded-[2px] shadow sm:block" style={{ backgroundColor: book?.accent ?? "#2c5546" }}>
          <div className="h-full w-1 bg-black/30" />
          <div className="mt-1 h-px w-full bg-[#c7a46d]/50" />
        </div>

        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium leading-tight text-white/85">
            {book?.title}
          </p>
          <p className="truncate text-[10.5px] leading-tight text-white/35">
            {book?.author}
            {pageCount > 0 && <span className="hidden sm:inline"> · {pageCount} páginas</span>}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            className="reader-btn"
            onClick={openSearch}
            data-active={searchOpen}
            aria-label="Buscar en el documento"
            title="Buscar (/)"
          >
            <SearchIcon className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            className="reader-btn"
            onClick={() => openLeftPanel("toc")}
            data-active={leftPanel === "toc"}
            aria-label="Abrir el índice"
            title="Índice (T)"
          >
            <ListIcon className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            className="reader-btn hidden sm:grid"
            onClick={() => openLeftPanel("thumbs")}
            data-active={leftPanel === "thumbs"}
            aria-label="Ver todas las páginas"
            title="Páginas (M)"
          >
            <GridIcon className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            className="reader-btn"
            onClick={() => void toggleBookmarkForPage()}
            data-active={isBookmarked}
            aria-label={isBookmarked ? "Quitar marcador" : "Añadir marcador"}
            title="Marcador (B)"
          >
            <BookmarkIcon className="h-[18px] w-[18px]" filled={isBookmarked} />
          </button>
          <button
            type="button"
            className="reader-btn"
            onClick={() => setSettingsOpen((value) => !value)}
            data-active={settingsOpen}
            aria-label="Ajustes de lectura"
            title="Ajustes"
          >
            <SlidersIcon className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            className="reader-btn hidden sm:grid"
            onClick={() => void toggleFullscreen()}
            aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            title="Pantalla completa (F)"
          >
            {isFullscreen ? (
              <MinimizeIcon className="h-[18px] w-[18px]" />
            ) : (
              <MaximizeIcon className="h-[18px] w-[18px]" />
            )}
          </button>
          <button
            type="button"
            className="reader-btn hidden lg:grid"
            onClick={() => setHelpOpen(true)}
            aria-label="Ayuda y atajos"
            title="Ayuda (?)"
          >
            <span className="text-[15px] leading-none">?</span>
          </button>
        </div>
      </header>

      <div className="reader-desk">
        {renderer && (
          <Flipbook
            key={`${effectiveMode}-${initialPage}`}
            ref={flipRef}
            renderer={renderer}
            mode={effectiveMode}
            initialPage={position?.page ?? initialPage}
            zoom={settings.zoom}
            sound={settings.sound}
            reduceMotion={reduceMotion}
            onNavigate={handleNavigate}
            onTapCenter={() => setChromeVisible((value) => !value)}
          />
        )}

        <button
          type="button"
          className="page-edge-btn left-3 hidden lg:grid"
          style={{ opacity: atStart ? 0 : undefined }}
          onClick={prev}
          disabled={atStart}
          aria-label="Página anterior"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          className="page-edge-btn right-3 hidden lg:grid"
          style={{ opacity: atEnd ? 0 : undefined }}
          onClick={next}
          disabled={atEnd}
          aria-label="Página siguiente"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>

        {settings.zoom > 1 && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-[46] -translate-x-1/2">
            <span className="reader-pill bg-black/40 tabular-nums">
              {Math.round(settings.zoom * 100)}%
            </span>
          </div>
        )}
      </div>

      <footer className="reader-bottombar">
        <button
          type="button"
          className="reader-btn"
          onClick={prev}
          disabled={atStart}
          aria-label="Página anterior"
          title="Página anterior (←)"
        >
          <ChevronLeftIcon className="h-[19px] w-[19px]" />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-4">
          <p className="reader-page-label hidden w-24 shrink-0 sm:block" aria-live="polite">
            {pageLabel} / {pageCount || "—"}
          </p>
          <input
            type="range"
            min={0}
            max={Math.max(0, (position?.totalSpreads ?? 1) - 1)}
            step={1}
            value={position?.spreadIndex ?? 0}
            onChange={(event) => flipRef.current?.goToSpread(Number(event.target.value))}
            className="reader-range min-w-0 flex-1"
            style={{ "--progress": `${progressPercent}%` } as React.CSSProperties}
            aria-label="Progreso de lectura"
          />
          <p className="reader-page-label w-16 shrink-0 text-right sm:hidden" aria-live="polite">
            {pageLabel}
          </p>
        </div>

        <button
          type="button"
          className="reader-btn"
          onClick={next}
          disabled={atEnd}
          aria-label="Página siguiente"
          title="Página siguiente (→)"
        >
          <ChevronRightIcon className="h-[19px] w-[19px]" />
        </button>
      </footer>

      {book && renderer && (
        <>
          <LibraryDrawer
            open={leftPanel !== null}
            onClose={() => setLeftPanel(null)}
            tab={leftTab}
            onTabChange={(tab) => {
              setLeftTab(tab);
              setLeftPanel(tab);
            }}
            title={book.title}
            outline={outline}
            outlineLoading={outlineLoading}
            renderer={renderer}
            currentPage={currentPage}
            pageCount={pageCount}
            bookmarks={bookmarks}
            onGoToPage={goToPage}
            onRemoveBookmark={removeBookmarkById}
            onToggleBookmark={() => void toggleBookmarkForPage()}
            isBookmarked={isBookmarked}
          />

          <SearchDrawer
            open={searchOpen}
            onClose={() => {
              cancelSearch();
              setSearchOpen(false);
            }}
            query={query}
            onQueryChange={setQuery}
            onSubmit={() => void runSearch()}
            searching={searching}
            searched={searched}
            progress={searchProgress}
            results={results}
            onGoToPage={(page) => {
              flipRef.current?.goToPage(page);
              setSearchOpen(false);
            }}
            onCancel={cancelSearch}
          />

          <SettingsPopover
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            settings={settings}
            onChange={updateSettings}
            narrow={narrow}
            onOpenHelp={() => setHelpOpen(true)}
          />
        </>
      )}

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} title={book?.title ?? "Lecty"} />
      <ReaderToasts messages={toasts} />
    </div>
  );
}
