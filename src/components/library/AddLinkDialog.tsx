"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Book, BookCategory } from "@/lib/types";
import { CATEGORIES } from "@/lib/categories";
import { importPdfUrl } from "@/lib/books";
import { LinkIcon, XIcon } from "@/components/icons";

export default function AddLinkDialog({
  onClose,
  onAdded,
  initialCategory = "libros",
}: {
  onClose: () => void;
  onAdded: (book: Book) => void;
  initialCategory?: BookCategory;
}) {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<BookCategory>(initialCategory);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("Comprobando el enlace…");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [busy, onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    setStage("Comprobando el enlace…");
    try {
      const book = await importPdfUrl(url, {
        onStage: setStage,
        category,
      });
      onAdded(book);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos abrir el PDF desde ese enlace."
      );
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[96] grid place-items-center p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-link-title"
    >
      <div
        className="modal-backdrop"
        onClick={() => !busy && onClose()}
        aria-hidden="true"
      />
      <div className="modal-card w-full max-w-[448px] p-6">
        <div className="flex items-start justify-between gap-4">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-accent/10 text-accent">
            <LinkIcon className="h-5 w-5" />
          </span>
          <button
            type="button"
            className="icon-btn -mr-2 -mt-1"
            onClick={onClose}
            aria-label="Cerrar"
            disabled={busy}
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <h2
          id="add-link-title"
          className="display mt-4 text-[26px] leading-tight text-ink"
        >
          Añadir desde un enlace
        </h2>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Pega la dirección de un PDF publicado en internet. Lo abriremos en tu
          navegador y guardaremos el libro con su portada y su progreso.
        </p>

        <form className="mt-5" onSubmit={submit}>
          <label
            htmlFor="pdf-link"
            className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted"
          >
            Enlace del PDF
          </label>
          <input
            ref={inputRef}
            id="pdf-link"
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              if (error) setError(null);
            }}
            placeholder="https://ejemplo.com/libro.pdf"
            className="mt-2 w-full rounded-xl border border-line bg-paper px-3.5 py-3 text-[13px] text-ink outline-none transition placeholder:text-muted/55 focus:border-accent/60 focus:ring-2 focus:ring-accent/10"
            disabled={busy}
          />

          <p className="mt-2.5 text-[10.5px] leading-relaxed text-muted">
            Si el servidor no permite el acceso directo (CORS), intentaremos
            abrirlo mediante el servidor de Lecty. No guardamos el archivo. Si
            aun así falla, descarga el PDF y súbelo desde tu equipo.
          </p>

          <div className="mt-4">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
              Guardar en
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {CATEGORIES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="chip"
                  data-active={category === item.key}
                  onClick={() => setCategory(item.key)}
                  disabled={busy}
                >
                  {item.plural}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p
              className="mt-3 rounded-lg bg-[#b4332a]/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-[#9c2f25]"
              role="alert"
            >
              {error}
            </p>
          )}

          {busy && (
            <p
              className="mt-3 flex items-center gap-2.5 rounded-lg bg-paper px-3 py-2.5 text-[11.5px] text-ink-soft"
              role="status"
            >
              <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent" />
              {stage}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost !px-4 !py-2.5 text-[12px]"
              onClick={onClose}
              disabled={busy}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-primary !px-4 !py-2.5 text-[12px] disabled:opacity-60"
              disabled={busy || !url.trim()}
            >
              {busy ? "Abriendo…" : "Añadir enlace"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
