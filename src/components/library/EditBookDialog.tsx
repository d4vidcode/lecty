"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Book, BookCategory, BookStatus } from "@/lib/types";
import { CATEGORIES } from "@/lib/categories";
import { READING_STATUSES, saveBookMeta, applyBookMeta, statusMeta } from "@/lib/book-meta";
import { resizeImageToDataUrl } from "@/lib/image";
import { cn } from "@/lib/utils";
import { useBookCover } from "@/components/library/BookCover";
import {
  CheckIcon,
  HeartIcon,
  PencilIcon,
  TagIcon,
  UploadIcon,
  XIcon,
} from "@/components/icons";

type StatusChoice = "auto" | BookStatus;

export default function EditBookDialog({
  book,
  onClose,
  onSaved,
}: {
  book: Book;
  onClose: () => void;
  onSaved: (book: Book) => void;
}) {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [category, setCategory] = useState<BookCategory>(book.category ?? "libros");
  const [status, setStatus] = useState<StatusChoice>(book.status ?? "auto");
  const [favorite, setFavorite] = useState(book.favorite === true);
  const [tags, setTags] = useState(book.tags.join(", "));
  const [cover, setCover] = useState<string | null>(book.cover ?? null);
  const [coverDirty, setCoverDirty] = useState(false);
  const [readingCover, setReadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const titleRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const { cover: pdfCover } = useBookCover(book);
  const previewCover = coverDirty ? cover : cover ?? pdfCover;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    titleRef.current?.focus();
    titleRef.current?.select();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const pickCover = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setReadingCover(true);
    setError(null);
    try {
      const data = await resizeImageToDataUrl(file);
      setCover(data);
      setCoverDirty(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos leer la imagen.");
    } finally {
      setReadingCover(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    const nextTitle = title.trim();
    if (!nextTitle) {
      setError("El título no puede estar vacío.");
      titleRef.current?.focus();
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const patch = {
        title: nextTitle,
        author: author.trim() || "Anónimo",
        category,
        status: status === "auto" ? undefined : status,
        favorite,
        tags: tags
          .split(/[,\n;]+/)
          .map((tag) => tag.trim())
          .filter(Boolean),
        ...(coverDirty ? { cover } : {}),
      };

      saveBookMeta(book.id, patch);
      const saved = applyBookMeta(book);
      onSaved(saved);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos guardar los cambios en este navegador."
      );
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[97] grid place-items-center p-4 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-book-title"
    >
      <div className="modal-backdrop" onClick={onClose} aria-hidden="true" />
      <form
        className="modal-card max-h-[min(90vh,820px)] w-full max-w-[620px] overflow-y-auto p-5 sm:p-6"
        onSubmit={submit}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow flex items-center gap-2">
              <PencilIcon className="h-3.5 w-3.5" />
              Ficha del libro
            </p>
            <h2
              id="edit-book-title"
              className="display mt-2 text-[28px] leading-none tracking-[-0.03em] text-ink"
            >
              Editar libro
            </h2>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              Los cambios se guardan solo en este navegador y no modifican el PDF
              original.
            </p>
          </div>
          <button
            type="button"
            className="icon-btn -mr-2 -mt-1"
            onClick={onClose}
            aria-label="Cerrar la ficha del libro"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-[132px_1fr]">
          <div>
            <div className="edit-cover-frame">
              {previewCover ? (
                <img src={previewCover} alt="Portada del libro" />
              ) : (
                <span className="text-[10.5px] text-muted">Sin portada</span>
              )}
              {readingCover && (
                <span className="absolute inset-0 grid place-items-center bg-ink/55 text-[10px] text-cream">
                  Preparando…
                </span>
              )}
            </div>
            <div className="mt-2 grid gap-1.5">
              <button
                type="button"
                className="btn btn-ghost !px-2.5 !py-2 text-[10.5px]"
                onClick={() => coverInputRef.current?.click()}
                disabled={readingCover}
              >
                <UploadIcon className="h-3.5 w-3.5" />
                Cambiar portada
              </button>
              {(previewCover || coverDirty) && (
                <button
                  type="button"
                  className="text-[10.5px] text-muted underline-offset-2 transition hover:text-accent hover:underline"
                  onClick={() => {
                    setCover(null);
                    setCoverDirty(true);
                  }}
                >
                  Restaurar portada del PDF
                </button>
              )}
            </div>
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => void pickCover(event)}
            />
            {coverDirty && !cover && (
              <p className="mt-1.5 text-[9.5px] leading-relaxed text-muted">
                Se usará la primera página del PDF al guardar.
              </p>
            )}
          </div>

          <div className="grid gap-4">
            <label className="block">
              <span className="field-label">Título</span>
              <input
                ref={titleRef}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="field-input"
                maxLength={160}
                required
              />
            </label>

            <label className="block">
              <span className="field-label">Autoría</span>
              <input
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                className="field-input"
                maxLength={120}
                placeholder="Anónimo"
              />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="field-label">Categoría</span>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value as BookCategory)}
                  className="field-input cursor-pointer"
                >
                  {CATEGORIES.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.plural}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="field-label">Estado de lectura</span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as StatusChoice)}
                  className="field-input cursor-pointer"
                >
                  <option value="auto">Automático (progreso)</option>
                  {READING_STATUSES.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block">
              <span className="field-label flex items-center gap-1.5">
                <TagIcon className="h-3 w-3" />
                Etiquetas
              </span>
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                className="field-input"
                placeholder="Novela, Ciencia ficción, Vol. 1"
                maxLength={240}
              />
              <span className="mt-1.5 block text-[10px] text-muted">
                Sepáralas con comas. Se usan para filtrar la estantería.
              </span>
            </label>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-line/80 bg-paper/60 px-3 py-2.5">
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium transition",
              favorite
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-line bg-surface text-muted hover:border-ink/25 hover:text-ink"
            )}
            aria-pressed={favorite}
            onClick={() => setFavorite((value) => !value)}
          >
            <HeartIcon className="h-3.5 w-3.5" filled={favorite} />
            {favorite ? "En favoritos" : "Añadir a favoritos"}
          </button>
          <span className="text-[10.5px] text-muted">
            Estado actual:{" "}
            <strong className="font-medium text-ink-soft">
              {status === "auto" ? "Automático" : statusMeta(status).label}
            </strong>
          </span>
        </div>

        {error && (
          <p
            className="mt-4 rounded-lg border border-[#b4332a]/25 bg-[#b4332a]/10 px-3 py-2 text-[11px] text-[#8d2c23]"
            role="alert"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line/80 pt-4">
          <p className="text-[10px] text-muted">
            {book.fileName ?? "Libro de ejemplo"} · {book.pages} páginas
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost !px-4 !py-2.5 text-[12px]"
              onClick={onClose}
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary !px-4 !py-2.5 text-[12px] disabled:opacity-60"
              disabled={saving}
            >
              <CheckIcon className="h-4 w-4" />
              {saving ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </form>
    </div>,
    document.body
  );
}
