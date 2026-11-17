"use client";

import Link from "next/link";
import type { Book, Progress } from "@/lib/types";
import { readingPercent } from "@/lib/books";
import { categoryMeta, categoryOf } from "@/lib/categories";
import { effectiveStatus, statusMeta } from "@/lib/book-meta";
import { cn } from "@/lib/utils";
import { HeartIcon, PencilIcon, TrashIcon } from "@/components/icons";
import { BookCover } from "@/components/library/BookCover";

export default function BookCard({
  book,
  progress,
  index,
  onDelete,
  onEdit,
  onToggleFavorite,
  showCategory = false,
}: {
  book: Book;
  progress?: Progress;
  index: number;
  onDelete?: (book: Book) => void;
  onEdit?: (book: Book) => void;
  onToggleFavorite?: (book: Book) => void;
  showCategory?: boolean;
}) {
  const started = Boolean(progress && progress.page > 0);
  const percent = progress ? readingPercent(progress.page, book.pages) : 0;
  const href = `/read/${book.id}`;
  const category = showCategory ? categoryMeta(categoryOf(book)) : null;
  const status = effectiveStatus(book, progress);
  const statusInfo = statusMeta(status);
  const showStatus = status !== "pendiente" || book.favorite;

  return (
    <article
      className="book-card group animate-card-in relative"
      style={{ animationDelay: `${Math.min(index, 9) * 45}ms` }}
    >
      <div className="relative">
        <Link
          href={href}
          className="block rounded-[3px] outline-offset-4"
          aria-label={`Leer «${book.title}» de ${book.author}`}
        >
          <div className="book-card-cover">
            <BookCover book={book} />
            <div className="book-card-gloss" />
            {started && <span className="progress-badge">{percent}%</span>}
            {showStatus && (
              <span className="book-status-chip" title={statusInfo.description}>
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: statusInfo.accent }}
                  aria-hidden="true"
                />
                {statusInfo.short}
              </span>
            )}
            {book.favorite && (
              <span className="book-favorite-mark" aria-label="Favorito">
                <HeartIcon className="h-3 w-3" filled />
              </span>
            )}
            {started && (
              <div className="cover-progress-track" aria-hidden="true">
                <div
                  className="cover-progress-bar"
                  style={{ width: `${percent}%` }}
                />
              </div>
            )}
          </div>
        </Link>

        <div className="book-actions">
          {onToggleFavorite && (
            <button
              type="button"
              className="book-action"
              data-active={book.favorite === true}
              data-favorite={book.favorite === true}
              onClick={() => onToggleFavorite(book)}
              aria-label={
                book.favorite
                  ? `Quitar «${book.title}» de favoritos`
                  : `Añadir «${book.title}» a favoritos`
              }
              aria-pressed={book.favorite === true}
              title={book.favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
            >
              <HeartIcon className="h-3.5 w-3.5" filled={book.favorite} />
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              className="book-action"
              onClick={() => onEdit(book)}
              aria-label={`Editar la ficha de «${book.title}»`}
              title="Editar ficha"
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
          )}
          {book.kind !== "sample" && onDelete && (
            <button
              type="button"
              className="book-action"
              data-danger="true"
              onClick={() => onDelete(book)}
              aria-label={`Eliminar «${book.title}» de la biblioteca`}
              title="Eliminar de la biblioteca"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-4">
        <Link href={href} className="block">
          <h3
            className={cn(
              "font-display text-[17px] leading-[1.15] tracking-[-0.02em] text-ink",
              "transition-colors duration-200 group-hover:text-accent"
            )}
          >
            {book.title}
          </h3>
        </Link>
        <p className="mt-1 truncate text-[11.5px] text-muted">{book.author}</p>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-muted">
          {category && (
            <span className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: category.accent }}
                aria-hidden="true"
              />
              {category.singular}
            </span>
          )}
          <span>{book.pages} págs.</span>
          {book.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="flex items-center gap-2.5">
              <span className="h-0.5 w-0.5 rounded-full bg-muted/70" />
              {tag}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}
