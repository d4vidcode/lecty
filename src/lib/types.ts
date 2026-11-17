export type BookCategory = "libros" | "comics" | "revistas" | "documentos";

export type BookStatus = "pendiente" | "leyendo" | "terminado" | "abandonado";

export type Book = {
  id: string;
  title: string;
  author: string;
  subtitle?: string;
  file?: string;
  pages: number;
  cover?: string;
  tags: string[];
  accent: string;
  addedAt: number;
  kind: "sample" | "upload" | "link";
  category?: BookCategory;
  status?: BookStatus;
  favorite?: boolean;
  url?: string;
  viaProxy?: boolean;
  size?: number;
  fileName?: string;
};

export type Progress = {
  page: number;
  updatedAt: number;
};

export type Bookmark = {
  id: string;
  page: number;
  label: string;
  snippet?: string;
  createdAt: number;
};

export type ReaderMode = "spread" | "single";
export type ReaderTheme = "night" | "sepia" | "slate";

export type ReaderSettings = {
  mode: ReaderMode;
  theme: ReaderTheme;
  sound: boolean;
  zoom: number;
};

export type OutlineNode = {
  title: string;
  page: number | null;
  children: OutlineNode[];
};

export type SearchHit = {
  page: number;
  snippet: string;
  start: number;
};

export const DEFAULT_SETTINGS: ReaderSettings = {
  mode: "spread",
  theme: "night",
  sound: false,
  zoom: 1,
};

export type BookMeta = {
  title?: string;
  author?: string;
  category?: BookCategory;
  tags?: string[];
  cover?: string | null;
  favorite?: boolean;
  status?: BookStatus;
  updatedAt?: number;
};

export type ReadingStats = {
  totalMs: number;
  totalPages: number;
  sessions: number;
  days: Record<string, { ms: number; pages: number }>;
};
