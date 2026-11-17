"use client";

import { useEffect, useState } from "react";
import type { Book } from "@/lib/types";
import { getBookCover } from "@/lib/books";
import { cn } from "@/lib/utils";

/**
 * Resuelve la portada de un libro. Los PDF subidos ya traen la primera
 * página renderizada; los de ejemplo la generan (y cachean) al vuelo.
 */
export function useBookCover(book: Book | null): {
  cover: string | null;
  loading: boolean;
} {
  const [cover, setCover] = useState<string | null>(book?.cover ?? null);
  const [loading, setLoading] = useState(Boolean(book && !book.cover));

  useEffect(() => {
    let alive = true;
    if (!book) {
      setCover(null);
      setLoading(false);
      return;
    }
    if (book.cover) {
      setCover(book.cover);
      setLoading(false);
      return;
    }

    setCover(null);
    setLoading(true);
    getBookCover(book)
      .then((url) => {
        if (alive) setCover(url);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [book]);

  return { cover, loading };
}

export function CoverFallback({
  book,
  compact = false,
}: {
  book: Book;
  compact?: boolean;
}) {
  return (
    <span
      className="cover-fallback"
      style={{ "--cover-accent": book.accent } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="cover-fallback-top">
        <span className="cover-fallback-mark">L</span>
        <span className="cover-fallback-rule" />
      </span>
      <span className={cn("cover-fallback-title", compact && "text-[12px]")}>
        {book.title}
      </span>
      <span className="cover-fallback-author">{book.author}</span>
    </span>
  );
}

export function BookCover({
  book,
  className,
  alt,
}: {
  book: Book;
  className?: string;
  alt?: string;
}) {
  const { cover, loading } = useBookCover(book);

  if (cover) {
    return (
      <img
        src={cover}
        alt={alt ?? `Portada de ${book.title}`}
        className={className}
        draggable={false}
        loading="lazy"
      />
    );
  }

  if (loading) {
    return <span className="cover-skeleton" aria-hidden="true" />;
  }

  return <CoverFallback book={book} />;
}
