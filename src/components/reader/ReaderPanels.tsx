"use client";

import { useEffect, useRef, useState } from "react";
import type { Bookmark, OutlineNode, ReaderMode, ReaderTheme, ReaderSettings } from "@/lib/types";
import type { BookRenderer } from "@/lib/pdf";
import {
  BookmarkIcon,
  ChevronRightIcon,
  GridIcon,
  HelpIcon,
  ListIcon,
  SearchIcon,
  XIcon,
} from "@/components/icons";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Panel lateral                                                       */
/* ------------------------------------------------------------------ */

export type LeftTab = "toc" | "thumbs" | "marks";

type PanelProps = {
  open: boolean;
  onClose: () => void;
  tab: LeftTab;
  onTabChange: (tab: LeftTab) => void;
  title: string;
  outline: OutlineNode[];
  outlineLoading: boolean;
  renderer: BookRenderer | null;
  currentPage: number;
  pageCount: number;
  bookmarks: Bookmark[];
  onGoToPage: (page: number) => void;
  onRemoveBookmark: (id: string) => void;
  onToggleBookmark: () => void;
  isBookmarked: boolean;
};

export function LibraryDrawer({
  open,
  onClose,
  tab,
  onTabChange,
  title,
  outline,
  outlineLoading,
  renderer,
  currentPage,
  pageCount,
  bookmarks,
  onGoToPage,
  onRemoveBookmark,
  onToggleBookmark,
  isBookmarked,
}: PanelProps) {
  return (
    <>
      <div
        className="reader-backdrop"
        data-open={open}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className="reader-panel reader-panel--left"
        data-open={open}
        aria-hidden={!open}
        inert={!open}
        aria-label="Índice y páginas"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">Explorar</p>
            <h2 className="truncate font-display text-lg text-white/90">{title}</h2>
          </div>
          <button className="reader-btn -mr-2" onClick={onClose} aria-label="Cerrar panel">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-4 flex gap-1 rounded-[10px] bg-white/[0.04] p-1">
          <TabButton active={tab === "toc"} onClick={() => onTabChange("toc")} icon={<ListIcon className="h-3.5 w-3.5" />}>
            Índice
          </TabButton>
          <TabButton active={tab === "thumbs"} onClick={() => onTabChange("thumbs")} icon={<GridIcon className="h-3.5 w-3.5" />}>
            Páginas
          </TabButton>
          <TabButton
            active={tab === "marks"}
            onClick={() => onTabChange("marks")}
            icon={<BookmarkIcon className="h-3.5 w-3.5" />}
          >
            Marcadores
          </TabButton>
        </div>

        <div className="mt-3 flex-1 overflow-y-auto px-2 pb-6">
          {tab === "toc" && (
            <TocTab
              outline={outline}
              loading={outlineLoading}
              onGoToPage={onGoToPage}
            />
          )}
          {tab === "thumbs" && (
            <ThumbsTab
              renderer={renderer}
              pageCount={pageCount}
              currentPage={currentPage}
              onGoToPage={onGoToPage}
            />
          )}
          {tab === "marks" && (
            <MarksTab
              bookmarks={bookmarks}
              currentPage={currentPage}
              isBookmarked={isBookmarked}
              onToggleBookmark={onToggleBookmark}
              onRemoveBookmark={onRemoveBookmark}
              onGoToPage={onGoToPage}
            />
          )}
        </div>
      </aside>
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button className="panel-tab" data-active={active} onClick={onClick} type="button">
      {icon}
      {children}
    </button>
  );
}

function TocTab({
  outline,
  loading,
  onGoToPage,
}: {
  outline: OutlineNode[];
  loading: boolean;
  onGoToPage: (page: number) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2 px-2 pt-3">
        {[0, 1, 2, 3, 4].map((item) => (
          <div
            key={item}
            className="h-8 animate-pulse rounded-md bg-white/[0.045]"
            style={{ width: `${88 - item * 7}%` }}
          />
        ))}
      </div>
    );
  }

  if (outline.length === 0) {
    return (
      <EmptyPanel
        icon={<ListIcon className="h-6 w-6" />}
        title="Este PDF no trae índice"
        text="Puedes moverte con la pestaña de páginas o con el buscador."
      />
    );
  }

  return (
    <ul className="mt-2 space-y-0.5">
      {outline.map((item, index) => (
        <OutlineRow key={`${item.title}-${index}`} item={item} depth={0} onGoToPage={onGoToPage} />
      ))}
    </ul>
  );
}

function OutlineRow({
  item,
  depth,
  onGoToPage,
}: {
  item: OutlineNode;
  depth: number;
  onGoToPage: (page: number) => void;
}) {
  return (
    <li>
      <button
        className="panel-item"
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => item.page != null && onGoToPage(item.page)}
        disabled={item.page == null}
        type="button"
      >
        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#c7a46d]/70" />
        <span className="min-w-0 flex-1 text-[12.5px] leading-snug">{item.title}</span>
        {item.page != null && (
          <span className="pt-0.5 text-[10.5px] tabular-nums text-white/35">{item.page + 1}</span>
        )}
      </button>
      {item.children.length > 0 && (
        <ul className="space-y-0.5">
          {item.children.map((child, index) => (
            <OutlineRow
              key={`${child.title}-${index}`}
              item={child}
              depth={depth + 1}
              onGoToPage={onGoToPage}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function ThumbsTab({
  renderer,
  pageCount,
  currentPage,
  onGoToPage,
}: {
  renderer: BookRenderer | null;
  pageCount: number;
  currentPage: number;
  onGoToPage: (page: number) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2.5 px-2 pt-3">
      {Array.from({ length: pageCount }, (_, page) => (
        <Thumb
          key={page}
          page={page}
          renderer={renderer}
          active={page === currentPage}
          onGoToPage={onGoToPage}
        />
      ))}
    </div>
  );
}

function Thumb({
  page,
  renderer,
  active,
  onGoToPage,
}: {
  page: number;
  renderer: BookRenderer | null;
  active: boolean;
  onGoToPage: (page: number) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "320px" }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !renderer) return;
    let alive = true;
    renderer
      .getThumb(page)
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [visible, page, renderer]);

  return (
    <button
      ref={ref}
      type="button"
      className="thumb-card group"
      data-active={active}
      onClick={() => onGoToPage(page)}
      aria-label={`Ir a la página ${page + 1}`}
      aria-current={active ? "page" : undefined}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" />
      ) : (
        <div className="page-loading h-full w-full opacity-70" />
      )}
      <span
        className={cn(
          "absolute bottom-1 right-1 rounded bg-black/65 px-1.5 py-0.5 text-[9.5px] tabular-nums",
          active ? "text-[#f3d7a8]" : "text-white/70"
        )}
      >
        {page + 1}
      </span>
      <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/0 transition group-hover:ring-white/20" />
    </button>
  );
}

function MarksTab({
  bookmarks,
  currentPage,
  isBookmarked,
  onToggleBookmark,
  onRemoveBookmark,
  onGoToPage,
}: {
  bookmarks: Bookmark[];
  currentPage: number;
  isBookmarked: boolean;
  onToggleBookmark: () => void;
  onRemoveBookmark: (id: string) => void;
  onGoToPage: (page: number) => void;
}) {
  return (
    <div className="px-1 pt-3">
      <button
        type="button"
        onClick={onToggleBookmark}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 px-3 py-2.5 text-[11.5px] text-white/65 transition hover:border-[#f3d7a8]/50 hover:text-[#f3d7a8]"
      >
        <BookmarkIcon className="h-3.5 w-3.5" filled={isBookmarked} />
        {isBookmarked ? "Quitar marcador de esta página" : `Marcar página ${currentPage + 1}`}
      </button>

      {bookmarks.length === 0 ? (
        <EmptyPanel
          icon={<BookmarkIcon className="h-6 w-6" />}
          title="Aún no hay marcadores"
          text="Guarda las páginas que quieras retomar con la tecla B o desde la barra superior."
        />
      ) : (
        <ul className="space-y-1">
          {bookmarks.map((bookmark) => (
            <li
              key={bookmark.id}
              className="group flex items-start gap-2 rounded-lg px-2 py-2 transition hover:bg-white/[0.05]"
            >
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => onGoToPage(bookmark.page)}
              >
                <span className="flex items-center gap-2">
                  <BookmarkIcon className="h-3.5 w-3.5 shrink-0 text-[#d6b57b]" filled />
                  <span className="text-[12px] text-white/80">{bookmark.label}</span>
                </span>
                {bookmark.snippet && (
                  <span className="mt-1 block line-clamp-2 pl-[22px] text-[11px] leading-relaxed text-white/40">
                    {bookmark.snippet}
                  </span>
                )}
              </button>
              <button
                type="button"
                className="mt-0.5 rounded p-1 text-white/25 opacity-0 transition hover:bg-white/10 hover:text-white/70 group-hover:opacity-100"
                onClick={() => onRemoveBookmark(bookmark.id)}
                aria-label={`Eliminar marcador de la página ${bookmark.page + 1}`}
              >
                <XIcon className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyPanel({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="mx-3 mt-6 flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-5 py-8 text-center">
      <span className="text-white/25">{icon}</span>
      <p className="text-[12.5px] text-white/70">{title}</p>
      <p className="text-[11.5px] leading-relaxed text-white/35">{text}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Buscador                                                            */
/* ------------------------------------------------------------------ */

type SearchProps = {
  open: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
  searching: boolean;
  searched: boolean;
  progress: { done: number; total: number };
  results: Array<{ page: number; snippet: string }>;
  onGoToPage: (page: number) => void;
  onCancel: () => void;
};

export function SearchDrawer({
  open,
  onClose,
  query,
  onQueryChange,
  onSubmit,
  searching,
  searched,
  progress,
  results,
  onGoToPage,
  onCancel,
}: SearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 220);
    return () => window.clearTimeout(timer);
  }, [open]);

  return (
    <>
      <div className="reader-backdrop" data-open={open} onClick={onClose} aria-hidden="true" />
      <aside
        className="reader-panel reader-panel--right"
        data-open={open}
        aria-hidden={!open}
        inert={!open}
        aria-label="Buscar en el documento"
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/35">En el documento</p>
            <h2 className="font-display text-lg text-white/90">Buscar</h2>
          </div>
          <button className="reader-btn -mr-2" onClick={onClose} aria-label="Cerrar buscador">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <form
          className="mx-4 mt-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <SearchIcon className="h-4 w-4 shrink-0 text-white/35" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Una palabra, una frase…"
            className="h-11 min-w-0 flex-1 bg-transparent text-[13px] text-white/90 outline-none placeholder:text-white/30"
            aria-label="Texto a buscar"
          />
          {searching ? (
            <button
              type="button"
              onClick={onCancel}
              className="shrink-0 text-[11px] text-white/50 hover:text-white"
            >
              Cancelar
            </button>
          ) : (
            query.trim().length > 1 && (
              <button
                type="submit"
                className="shrink-0 rounded-md bg-white/10 px-2.5 py-1 text-[11px] text-white/80 hover:bg-white/15"
              >
                Buscar
              </button>
            )
          )}
        </form>

        {searching && (
          <div className="mt-3 px-5">
            <div className="h-1 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#d6b57b] transition-all"
                style={{
                  width: `${progress.total ? Math.max(4, (progress.done / progress.total) * 100) : 4}%`,
                }}
              />
            </div>
            <p className="mt-2 text-[10.5px] tabular-nums text-white/35">
              Buscando… {progress.done} / {progress.total} páginas
            </p>
          </div>
        )}

        <div className="mt-3 flex-1 overflow-y-auto">
          {!searching && searched && results.length === 0 && (
            <EmptyPanel
              icon={<SearchIcon className="h-6 w-6" />}
              title="Sin coincidencias"
              text="Prueba con otra palabra o con una parte de la frase."
            />
          )}

          {!searched && !searching && (
            <div className="mx-4 mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 text-[11.5px] leading-relaxed text-white/40">
              La búsqueda recorre el texto de todas las páginas en tu dispositivo. No se envía
              nada a ningún servidor.
            </div>
          )}

          {results.length > 0 && (
            <>
              <p className="px-4 pb-1 pt-2 text-[10.5px] uppercase tracking-[0.16em] text-white/30">
                {results.length} {results.length === 1 ? "resultado" : "resultados"}
              </p>
              {results.map((hit, index) => (
                <button
                  key={`${hit.page}-${index}`}
                  type="button"
                  className="search-hit"
                  onClick={() => onGoToPage(hit.page)}
                >
                  <span className="mb-1 flex items-center gap-2">
                    <span className="rounded bg-[#d6b57b]/15 px-1.5 py-0.5 text-[10px] font-medium text-[#e3c48d]">
                      Pág. {hit.page + 1}
                    </span>
                    <ChevronRightIcon className="ml-auto h-3.5 w-3.5 text-white/25" />
                  </span>
                  <span className="line-clamp-3 text-[11.5px] leading-relaxed text-white/55">
                    {hit.snippet}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Ajustes                                                             */
/* ------------------------------------------------------------------ */

type SettingsProps = {
  open: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onChange: (patch: Partial<ReaderSettings>) => void;
  narrow: boolean;
  onOpenHelp: () => void;
};

const THEMES: Array<{ id: ReaderTheme; label: string; className: string }> = [
  { id: "night", label: "Noche", className: "bg-[#111216]" },
  { id: "sepia", label: "Sepia", className: "bg-[#2a1d13]" },
  { id: "slate", label: "Pizarra", className: "bg-[#0f1d22]" },
];

export function SettingsPopover({
  open,
  onClose,
  settings,
  onChange,
  narrow,
  onOpenHelp,
}: SettingsProps) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-[54]" onClick={onClose} aria-hidden="true" />
      <div
        className="settings-pop"
        style={{ top: 70, right: "max(12px, 2.5vw)" }}
        role="dialog"
        aria-label="Ajustes de lectura"
      >
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/40">
            Ajustes de lectura
          </p>
          <button className="reader-btn h-7 w-7" onClick={onClose} aria-label="Cerrar ajustes">
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="settings-row">
          <span className="settings-label">Fondo</span>
          <div className="flex items-center gap-2">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={cn("theme-swatch", theme.className)}
                data-active={settings.theme === theme.id}
                title={theme.label}
                aria-label={`Fondo ${theme.label}`}
                onClick={() => onChange({ theme: theme.id })}
              >
                <span className="absolute inset-1.5 rounded-full border border-white/10" />
              </button>
            ))}
          </div>
        </div>

        <div className="settings-row">
          <span className="settings-label">Páginas</span>
          <div className="segmented">
            <button
              type="button"
              data-active={settings.mode === "spread"}
              disabled={narrow}
              title={narrow ? "Disponible en pantallas anchas" : undefined}
              onClick={() => onChange({ mode: "spread" as ReaderMode })}
            >
              Doble
            </button>
            <button
              type="button"
              data-active={settings.mode === "single" || narrow}
              onClick={() => onChange({ mode: "single" as ReaderMode })}
            >
              Simple
            </button>
          </div>
        </div>

        {narrow && (
          <p className="pb-1 text-[10px] leading-relaxed text-white/30">
            En pantallas estrechas siempre se muestra una página.
          </p>
        )}

        <div className="settings-row">
          <span className="settings-label">Sonido de hoja</span>
          <button
            type="button"
            role="switch"
            aria-checked={settings.sound}
            onClick={() => onChange({ sound: !settings.sound })}
            className={cn(
              "relative h-6 w-11 rounded-full border transition",
              settings.sound
                ? "border-[#d6b57b]/60 bg-[#d6b57b]/25"
                : "border-white/15 bg-white/[0.06]"
            )}
          >
            <span
              className={cn(
                "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all",
                settings.sound ? "left-6 bg-[#f3d7a8]" : "left-1 bg-white/50"
              )}
            />
          </button>
        </div>

        <div className="settings-row">
          <span className="settings-label">Zoom</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="reader-btn h-7 w-7"
              onClick={() => onChange({ zoom: Math.max(1, Math.round((settings.zoom - 0.25) * 100) / 100) })}
              aria-label="Reducir zoom"
            >
              <span className="text-lg leading-none">−</span>
            </button>
            <span className="w-11 text-center text-[11px] tabular-nums text-white/65">
              {Math.round(settings.zoom * 100)}%
            </span>
            <button
              type="button"
              className="reader-btn h-7 w-7"
              onClick={() => onChange({ zoom: Math.min(2.5, Math.round((settings.zoom + 0.25) * 100) / 100) })}
              aria-label="Ampliar zoom"
            >
              <span className="text-lg leading-none">+</span>
            </button>
          </div>
        </div>

        <button
          type="button"
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.08] py-2 text-[11px] text-white/50 transition hover:bg-white/[0.05] hover:text-white/80"
          onClick={() => {
            onClose();
            onOpenHelp();
          }}
        >
          <HelpIcon className="h-3.5 w-3.5" />
          Atajos y ayuda
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Ayuda                                                               */
/* ------------------------------------------------------------------ */

const SHORTCUTS: Array<[string, string]> = [
  ["→ · Espacio", "Página siguiente"],
  ["← · Retroceso", "Página anterior"],
  ["Inicio · Fin", "Primera o última página"],
  ["B", "Marcar la página actual"],
  ["T", "Abrir el índice"],
  ["M", "Ver todas las páginas"],
  ["F", "Pantalla completa"],
  ["H", "Ocultar o mostrar los controles"],
  ["/", "Buscar en el documento"],
  ["+ · −", "Zoom"],
  ["Esc", "Cerrar paneles"],
  ["?", "Esta ayuda"],
];

export function HelpDialog({
  open,
  onClose,
  title,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="modal-card w-full max-w-lg overflow-hidden bg-[#17161a] text-[#f3ede2]"
        role="dialog"
        aria-modal="true"
        aria-label="Atajos y ayuda"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#d6b57b]/70">Lecty</p>
            <h2 className="font-display text-xl">Leer sin soltar el libro</h2>
            <p className="mt-1 text-[11.5px] text-white/40">{title}</p>
          </div>
          <button className="reader-btn -mr-2" onClick={onClose} aria-label="Cerrar ayuda">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-x-8 gap-y-2 px-6 py-5 sm:grid-cols-2">
          {SHORTCUTS.map(([keys, description]) => (
            <div key={keys} className="flex items-center justify-between gap-3 border-b border-white/[0.04] py-1.5">
              <span className="text-[11.5px] text-white/55">{description}</span>
              <span className="kbd whitespace-nowrap">{keys}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-white/[0.07] bg-white/[0.02] px-6 py-4 text-[11px] leading-relaxed text-white/35">
          En pantalla táctil: toca los lados para pasar de página, arrastra la hoja o toca el
          centro para ocultar los controles.
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Avisos                                                              */
/* ------------------------------------------------------------------ */

export function ReaderToasts({ messages }: { messages: Array<{ id: number; text: string }> }) {
  if (messages.length === 0) return null;
  return (
    <div className="reader-toast-wrap" aria-live="polite">
      {messages.map((message) => (
        <div key={message.id} className="reader-toast">
          {message.text}
        </div>
      ))}
    </div>
  );
}
