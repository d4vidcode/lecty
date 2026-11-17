"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Book, BookCategory } from "@/lib/types";
import { CATEGORIES } from "@/lib/categories";
import { formatBytes } from "@/lib/books";
import type { UiPreferences } from "@/lib/preferences";
import { cn } from "@/lib/utils";
import {
  AccessibilityIcon,
  BookOpenIcon,
  FolderIcon,
  LinkIcon,
  MoonIcon,
  ShieldIcon,
  SlidersIcon,
  SparkIcon,
  SunIcon,
  UploadIcon,
  XIcon,
} from "@/components/icons";

export default function SettingsPanel({
  open,
  onClose,
  books,
  theme,
  onToggleTheme,
  onPickFiles,
  onPickFolder,
  onAddLink,
  preferences,
  onChangePreferences,
  defaultCategory = "libros",
}: {
  open: boolean;
  onClose: () => void;
  books: Book[] | null;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onPickFiles: (category: BookCategory) => void;
  onPickFolder: (category: BookCategory) => void;
  onAddLink: (category: BookCategory) => void;
  preferences: UiPreferences;
  onChangePreferences: (patch: Partial<UiPreferences>) => void;
  defaultCategory?: BookCategory;
}) {
  const [category, setCategory] = useState<BookCategory>(defaultCategory);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setCategory(defaultCategory);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, defaultCategory]);

  if (!open) return null;

  const library = books ?? [];
  const uploads = library.filter((book) => book.kind === "upload");
  const links = library.filter((book) => book.kind === "link");
  const uploadedBytes = uploads.reduce((sum, book) => sum + (book.size ?? 0), 0);

  return createPortal(
    <div
      className="fixed inset-0 z-[97] grid place-items-center p-4 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal-card max-h-[min(90vh,820px)] w-full max-w-[600px] overflow-y-auto p-5 outline-none sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow flex items-center gap-2">
              <SlidersIcon className="h-3.5 w-3.5" />
              Tu biblioteca
            </p>
            <h2
              id="settings-title"
              className="display mt-2 text-[30px] leading-none tracking-[-0.03em] text-ink"
            >
              Ajustes
            </h2>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              Añade contenido, ajusta la lectura y consulta qué se guarda en este
              dispositivo.
            </p>
          </div>
          <button
            type="button"
            className="icon-btn -mr-2 -mt-1"
            onClick={onClose}
            aria-label="Cerrar ajustes"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <section className="mt-7">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent">
              <UploadIcon className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-[13.5px] font-semibold text-ink">
                Añadir contenido
              </h3>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                Elige la categoría de destino. Después podrás cambiar la ficha de
                cada libro desde la estantería.
              </p>
            </div>
          </div>

          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {CATEGORIES.map((item) => (
              <button
                key={item.key}
                type="button"
                className="chip"
                data-active={category === item.key}
                onClick={() => setCategory(item.key)}
              >
                {item.plural}
              </button>
            ))}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              className="btn btn-primary !py-2.5 text-[11.5px]"
              onClick={() => onPickFiles(category)}
            >
              <UploadIcon className="h-4 w-4" />
              Subir PDF
            </button>
            <button
              type="button"
              className="btn btn-ghost !py-2.5 text-[11.5px]"
              onClick={() => onPickFolder(category)}
            >
              <FolderIcon className="h-4 w-4" />
              Carpeta
            </button>
            <button
              type="button"
              className="btn btn-ghost !py-2.5 text-[11.5px]"
              onClick={() => onAddLink(category)}
            >
              <LinkIcon className="h-4 w-4" />
              Enlace
            </button>
          </div>

          <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
            Hasta 120 MB por archivo. Las carpetas se recorren completas: cada PDF
            hereda la categoría de su ruta si la detección está activa. Si un
            enlace bloquea la descarga, descarga el PDF y súbelo.
          </p>

          <div className="mt-3 rounded-xl border border-line/80 bg-paper/60 px-3 py-2.5">
            <SwitchRow
              title="Detección automática de metadatos"
              description="Título, autoría, categoría y etiquetas a partir del PDF y de la carpeta. Siempre podrás corregirlos."
              checked={preferences.autoMetadata}
              onChange={(value) => onChangePreferences({ autoMetadata: value })}
            />
          </div>
        </section>

        <section className="mt-6 border-t border-line/80 pt-5">
          <div className="flex items-center gap-2.5">
            <SunIcon className="h-4 w-4 text-accent" />
            <h3 className="text-[13.5px] font-semibold text-ink">Apariencia</h3>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(
              [
                { value: "light", label: "Claro", Icon: SunIcon },
                { value: "dark", label: "Oscuro", Icon: MoonIcon },
              ] as const
            ).map(({ value, label, Icon }) => {
              const active = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-[12px] font-medium transition",
                    active
                      ? "border-ink bg-ink text-paper shadow-[0_10px_24px_-16px_rgb(0_0_0_/_0.6)]"
                      : "border-line bg-paper/70 text-ink-soft hover:border-ink/25 hover:text-ink"
                  )}
                  onClick={() => {
                    if (!active) onToggleTheme();
                  }}
                  aria-pressed={active}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-6 border-t border-line/80 pt-5">
          <div className="flex items-center gap-2.5">
            <AccessibilityIcon className="h-4 w-4 text-accent" />
            <h3 className="text-[13.5px] font-semibold text-ink">Accesibilidad</h3>
          </div>
          <div className="mt-3 grid gap-2">
            <div className="rounded-xl border border-line/80 bg-paper/60 px-3 py-2.5">
              <SwitchRow
                title="Alto contraste"
                description="Refuerza el texto, los bordes y el foco del teclado en toda la biblioteca."
                checked={preferences.highContrast}
                onChange={(value) => onChangePreferences({ highContrast: value })}
              />
            </div>
            <div className="rounded-xl border border-line/80 bg-paper/60 px-3 py-2.5">
              <SwitchRow
                title="Reducir movimiento"
                description="Desactiva el giro 3D de las hojas y las animaciones decorativas."
                checked={preferences.reduceMotion}
                onChange={(value) => onChangePreferences({ reduceMotion: value })}
              />
            </div>
          </div>
          <p className="mt-2 flex items-start gap-2 text-[10.5px] leading-relaxed text-muted">
            <SparkIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            El lector admite teclado: flechas para pasar página, B para marcar, T
            para el índice, / para buscar y ? para ver todos los atajos.
          </p>
        </section>

        <section className="mt-6 border-t border-line/80 pt-5">
          <div className="flex items-center gap-2.5">
            <BookOpenIcon className="h-4 w-4 text-accent" />
            <h3 className="text-[13.5px] font-semibold text-ink">
              Almacenamiento
            </h3>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-line/80 bg-paper/60 px-3 py-2.5">
              <dd className="font-display text-[20px] leading-none text-ink">
                {books === null ? "—" : library.length}
              </dd>
              <dt className="mt-1.5 text-[9px] uppercase tracking-[0.14em] text-muted">
                Títulos
              </dt>
            </div>
            <div className="rounded-xl border border-line/80 bg-paper/60 px-3 py-2.5">
              <dd className="font-display text-[20px] leading-none text-ink">
                {books === null ? "—" : uploads.length}
              </dd>
              <dt className="mt-1.5 text-[9px] uppercase tracking-[0.14em] text-muted">
                Subidos
              </dt>
            </div>
            <div className="rounded-xl border border-line/80 bg-paper/60 px-3 py-2.5">
              <dd className="font-display text-[20px] leading-none text-ink">
                {books === null ? "—" : formatBytes(uploadedBytes)}
              </dd>
              <dt className="mt-1.5 text-[9px] uppercase tracking-[0.14em] text-muted">
                En disco
              </dt>
            </div>
          </dl>
          <p className="mt-2.5 flex items-start gap-2 text-[10.5px] leading-relaxed text-muted">
            <ShieldIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            Tus archivos se quedan en este navegador. Los enlaces no se
            descargan: solo guardamos su dirección
            {links.length > 0 ? ` (${links.length} enlace${links.length === 1 ? "" : "s"})` : ""}.
          </p>
        </section>

        <section className="mt-6 border-t border-line/80 pt-5">
          <h3 className="text-[13.5px] font-semibold text-ink">
            Lecty sin conexión
          </h3>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
            La biblioteca y los libros que ya has abierto funcionan sin red. Los
            PDF subidos viven en este dispositivo; los enlaces externos siguen
            necesitando conexión. Puedes instalar Lecty desde el menú del
            navegador para abrirla a pantalla completa.
          </p>
        </section>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="btn btn-ghost !px-4 !py-2.5 text-[12px]"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function SwitchRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="pref-row"
      onClick={() => onChange(!checked)}
    >
      <span className="min-w-0 text-left">
        <span className="block text-[12px] font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-[10.5px] leading-relaxed text-muted">
          {description}
        </span>
      </span>
      <span className="pref-switch" data-on={checked} aria-hidden="true">
        <span />
      </span>
    </button>
  );
}
