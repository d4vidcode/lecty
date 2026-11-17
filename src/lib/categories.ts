import type { Book, BookCategory } from "./types";

export type CategoryMeta = {
  key: BookCategory;
  singular: string;
  plural: string;
  blurb: string;
  accent: string;
};

export const CATEGORIES: CategoryMeta[] = [
  {
    key: "libros",
    singular: "Libro",
    plural: "Libros",
    blurb: "Novela, ensayo, poesía y clásicos",
    accent: "#7c3b32",
  },
  {
    key: "comics",
    singular: "Cómic",
    plural: "Cómics",
    blurb: "Novela gráfica, manga y tebeos",
    accent: "#33485c",
  },
  {
    key: "revistas",
    singular: "Revista",
    plural: "Revistas",
    blurb: "Publicaciones, fanzines y números",
    accent: "#2c5546",
  },
  {
    key: "documentos",
    singular: "Documento",
    plural: "Documentos",
    blurb: "Manuales, guías, informes y apuntes",
    accent: "#6b4a2f",
  },
];

const CATEGORY_KEYS = new Set<string>(CATEGORIES.map((category) => category.key));

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function isBookCategory(value: unknown): value is BookCategory {
  return typeof value === "string" && CATEGORY_KEYS.has(value);
}

export function detectCategoryFromText(value: string): BookCategory | null {
  const text = fold(value);

  if (
    /(comic|comics|manga|manhwa|manhua|tebeo|historieta|novela grafica|graphic novel)/.test(
      text
    )
  ) {
    return "comics";
  }
  if (
    /(revista|revistas|magazine|magazines|fanzine|zine|periodico|publicacion periodica)/.test(
      text
    )
  ) {
    return "revistas";
  }
  if (
    /(documento|documentos|document|docs|manual|manuales|guia|guias|informe|informes|apunte|apuntes|paper|tesis|instrucciones|contrato|factura|curriculum)/.test(
      text
    )
  ) {
    return "documentos";
  }
  if (
    /(libro|libros|book|books|ebook|novela|novelas|ensayo|poesia|poemas|teatro|cuento|cuentos|clasico|clasicos|literatura)/.test(
      text
    )
  ) {
    return "libros";
  }

  return null;
}

export function categoryOf(book: Book): BookCategory {
  if (isBookCategory(book.category)) return book.category;

  return (
    detectCategoryFromText(
      `${book.title} ${book.tags.join(" ")} ${book.fileName ?? ""}`
    ) ?? "libros"
  );
}

export function categoryMeta(key: BookCategory): CategoryMeta {
  return CATEGORIES.find((category) => category.key === key) ?? CATEGORIES[0];
}
