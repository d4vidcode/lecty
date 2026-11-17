import type { BookCategory } from "./types";
import { detectCategoryFromText } from "./categories";

const NOISE_BRACKETS =
  /[\s._-]*[\[(](?:pdf|epub|mobi|azw3|djvu|scan(?:ned)?|ocr|descargar|download|español|espanol|spanish|castellano|libro electrónico|ebook)[\])]/gi;

const GENERIC_TITLES =
  /^(untitled|sin t[ií]tulo|documento|document|documento escaneado|presentaci[oó]n|presentation|microsoft (word|powerpoint)\b|powerpoint presentation\b|adobe acrobat\b|scan(?:ned)?\b)/i;

const GENERIC_AUTHORS =
  /^(administrador|administrator|admin|user|usuario|unknown|desconocido|owner|propietario|author|autor|microsoft|adobe|equipo|lecty|pc|windows)$/i;

const NAME_PARTICLES = new Set([
  "de",
  "del",
  "la",
  "las",
  "los",
  "y",
  "e",
  "van",
  "von",
  "da",
  "dos",
  "di",
  "san",
  "santa",
  "dr",
  "dra",
]);

const MEDIA_WORDS =
  /(revista|magazine|comic|c[oó]mic|manga|tebeo|manual|gu[ií]a|libro|novela|tomo|volumen|vol|edici[oó]n|colecci[oó]n|n[uú]mero|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i;

const FOLDER_NOISE = new Set([
  "pdf",
  "pdfs",
  "descargas",
  "downloads",
  "biblioteca",
  "library",
  "ebooks",
  "e-books",
  "lecty",
  "mi biblioteca",
]);

const GENRE_TAGS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bciencia ficci[oó]n\b/i, label: "Ciencia ficción" },
  { pattern: /\bficci[oó]n\b/i, label: "Ficción" },
  { pattern: /\bfantas[ií]a\b/i, label: "Fantasía" },
  { pattern: /\bnovela negra\b/i, label: "Novela negra" },
  { pattern: /\bthriller\b/i, label: "Thriller" },
  { pattern: /\bmisterio\b/i, label: "Misterio" },
  { pattern: /\bterror\b/i, label: "Terror" },
  { pattern: /\bromance\b/i, label: "Romance" },
  { pattern: /\bhistoria\b/i, label: "Historia" },
  { pattern: /\bfilosof[ií]a\b/i, label: "Filosofía" },
  { pattern: /\bpoes[ií]a\b/i, label: "Poesía" },
  { pattern: /\bteatro\b/i, label: "Teatro" },
  { pattern: /\bensayo\b/i, label: "Ensayo" },
  { pattern: /\bnovela\b/i, label: "Novela" },
  { pattern: /\bmanga\b/i, label: "Manga" },
  { pattern: /\bc[oó]mic\b/i, label: "Cómic" },
  { pattern: /\brevista\b/i, label: "Revista" },
  { pattern: /\bmanual\b/i, label: "Manual" },
  { pattern: /\bgu[ií]a\b/i, label: "Guía" },
  { pattern: /\barte\b/i, label: "Arte" },
  { pattern: /\bciencia\b/i, label: "Ciencia" },
  { pattern: /\btecnolog[ií]a\b/i, label: "Tecnología" },
];

export type DetectedMetadata = {
  title: string;
  author?: string;
  tags: string[];
  category: BookCategory | null;
  volume?: number;
};

function cleanSegment(value: string): string {
  return value
    .replace(/\.(pdf|epub|mobi|azw3|djvu)$/i, "")
    .replace(NOISE_BRACKETS, " ")
    .replace(/[_]+/g, " ")
    .replace(/\s*[–—]\s*/g, " - ")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—._]+|[\s\-–—._]+$/g, "")
    .trim();
}

function fold(value: string): string {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function titleCase(value: string): string {
  const letters = value.replace(/[^\p{L}]/gu, "");
  if (!letters) return value;
  const upper = letters === letters.toUpperCase() && letters !== letters.toLowerCase();
  if (!upper) return value;
  return value
    .toLocaleLowerCase("es")
    .replace(/(^|[\s\-–—/(])(\p{L})/gu, (_, prefix: string, letter: string) => {
      return `${prefix}${letter.toLocaleUpperCase("es")}`;
    });
}

export function cleanDetectedTitle(value: string): string {
  const clean = cleanSegment(value)
    .replace(/^\d{1,3}\s*[-.)]\s+(?=\S)/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean || GENERIC_TITLES.test(clean)) return "";
  return clean;
}

const TITLE_ARTICLES = /^(el|la|los|las|un|una|unos|unas|lo|mi|mis|tu|tus|nuestro|nuestra)\b/i;
const VOLUME_ONLY =
  /^(tomo|vol(?:umen)?|libro|book|n[°ºo]|#|parte|part)\s*\.?\s*\d{1,3}$/i;

function isTitleLike(value: string): boolean {
  const clean = cleanSegment(value);
  if (!clean) return false;
  if (TITLE_ARTICLES.test(clean)) return true;
  return !isPersonLike(clean);
}

function tokensOf(value: string): string[] {
  return cleanSegment(value).split(/\s+/).filter(Boolean);
}

function isPersonLike(value: string): boolean {
  const clean = cleanSegment(value);
  if (!clean || clean.length > 60 || /\d/.test(clean)) return false;
  if (MEDIA_WORDS.test(clean)) return false;
  const tokens = tokensOf(clean);
  if (tokens.length < 2 || tokens.length > 5) return false;

  const valid = tokens.every((token) => {
    if (NAME_PARTICLES.has(token.toLocaleLowerCase("es"))) return true;
    return token.length >= 2 && /^[\p{L}.'’\-]+$/u.test(token);
  });
  if (!valid) return false;

  // Si el nombre viene capitalizado, las palabras con contenido deben ir en
  // mayúscula: «Cien años de soledad» no es una persona, «Gabriel García
  // Márquez» sí. Así evitamos confundir títulos con autores.
  const capitalized = tokens.some((token) => /^\p{Lu}/u.test(token));
  if (capitalized) {
    return tokens.every(
      (token) =>
        NAME_PARTICLES.has(token.toLocaleLowerCase("es")) || /^\p{Lu}/u.test(token)
    );
  }

  return true;
}

function splitFileName(value: string): { title: string; author?: string } {
  const clean = cleanDetectedTitle(value);
  if (!clean) return { title: "" };

  const parts = clean.split(/\s+[-–—]\s+/).filter(Boolean);
  if (parts.length !== 2) return { title: clean };

  const [left, right] = parts;

  // «One Piece - Tomo 01»: el segundo lado es un número de volumen, no autor.
  if (VOLUME_ONLY.test(right)) {
    return { title: cleanDetectedTitle(left) };
  }
  if (VOLUME_ONLY.test(left)) {
    return { title: cleanDetectedTitle(right) };
  }

  const leftName = isPersonLike(left);
  const rightName = isPersonLike(right);
  const leftTitle = isTitleLike(left);
  const rightTitle = isTitleLike(right);

  if (leftTitle && !rightTitle) {
    return { title: cleanDetectedTitle(left), author: right };
  }
  if (rightTitle && !leftTitle) {
    return { title: cleanDetectedTitle(right), author: left };
  }

  if (leftName && rightName) {
    // Ambos lados parecen nombres: el más corto suele ser el autor.
    return tokensOf(left).length < tokensOf(right).length
      ? { title: cleanDetectedTitle(right), author: left }
      : { title: cleanDetectedTitle(left), author: right };
  }

  return { title: clean };
}

function volumeFromText(value: string): number | undefined {
  const match = value.match(
    /(?:^|[\s._-])(?:vol(?:umen)?|tomo|book|libro|n[°ºo]|#)\s*\.?\s*(\d{1,3})(?:\b|$)/i
  );
  if (!match) return undefined;
  const volume = Number(match[1]);
  return Number.isFinite(volume) && volume > 0 ? volume : undefined;
}

function addTag(tags: string[], value: string) {
  const clean = cleanSegment(value);
  if (!clean || clean.length < 2 || clean.length > 36) return;
  if (/^\d+$/.test(clean)) return;
  const folded = fold(clean);
  if (tags.some((tag) => fold(tag) === folded)) return;
  tags.push(titleCase(clean));
}

const CATEGORY_FOLDER = /^(libros?|books?|comics?|c[oó]mics?|revistas?|magazines?|documentos?|documents?|docs?)$/i;

function tagsFromPath(path: string): string[] {
  const rawSegments = path.split(/[\\/]+/).filter(Boolean);
  // El último segmento suele ser el archivo, no una carpeta.
  if (rawSegments.length > 0 && /\.pdf$/i.test(rawSegments[rawSegments.length - 1])) {
    rawSegments.pop();
  }

  const tags: string[] = [];
  for (const segment of rawSegments) {
    const clean = cleanSegment(segment);
    if (!clean || FOLDER_NOISE.has(fold(clean)) || CATEGORY_FOLDER.test(clean)) continue;
    addTag(tags, clean);
    if (tags.length >= 4) break;
  }
  return tags;
}

function tagsFromText(text: string): string[] {
  const tags: string[] = [];
  for (const { pattern, label } of GENRE_TAGS) {
    if (pattern.test(text)) addTag(tags, label);
    if (tags.length >= 5) break;
  }
  return tags;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Elimina etiquetas que ya están contenidas en otra más específica
 * («Ciencia» y «Ficción» dentro de «Ciencia ficción»).
 */
function pruneTags(tags: string[]): string[] {
  return tags.filter((tag, index, list) => {
    const folded = fold(tag);
    const matcher = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(folded)}(?:$|[^\\p{L}\\p{N}])`,
      "u"
    );
    return !list.some((other, otherIndex) => {
      if (otherIndex === index) return false;
      const otherFolded = fold(other);
      return otherFolded.length > folded.length && matcher.test(otherFolded);
    });
  });
}

function detectAuthorFromFileName(fileName: string): string | undefined {
  const { author } = splitFileName(fileName);
  return author && !GENERIC_AUTHORS.test(author) ? author : undefined;
}

export function detectBookMetadata(input: {
  fileName: string;
  folderPath?: string;
  pdfTitle?: string;
  pdfAuthor?: string;
  fallbackCategory?: BookCategory;
}): DetectedMetadata {
  const fileName = input.fileName || "";
  const folderPath = input.folderPath ?? "";
  const rawTitle = input.pdfTitle?.trim() ?? "";
  const detectedTitle = cleanDetectedTitle(rawTitle);
  const fromFile = splitFileName(fileName);

  const title =
    detectedTitle ||
    fromFile.title ||
    cleanDetectedTitle(fileName) ||
    "Documento sin título";

  const pdfAuthor = input.pdfAuthor?.trim() ?? "";
  const author =
    (pdfAuthor && !GENERIC_AUTHORS.test(pdfAuthor) ? pdfAuthor : undefined) ??
    fromFile.author ??
    detectAuthorFromFileName(fileName);

  const tags: string[] = [];
  for (const tag of tagsFromPath(folderPath)) addTag(tags, tag);
  for (const tag of tagsFromText(`${title} ${fileName} ${folderPath}`)) addTag(tags, tag);

  const volume = volumeFromText(`${title} ${fileName}`);
  if (volume) addTag(tags, `Vol. ${volume}`);

  const category =
    detectCategoryFromText(`${folderPath} ${fileName}`) ??
    input.fallbackCategory ??
    null;

  return {
    title,
    author,
    tags: pruneTags(tags).slice(0, 5),
    category,
    volume,
  };
}
