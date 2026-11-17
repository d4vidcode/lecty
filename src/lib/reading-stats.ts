import type { ReadingStats } from "./types";

export const READING_STATS_KEY = "lecty:reading-stats";

const EMPTY_STATS: ReadingStats = {
  totalMs: 0,
  totalPages: 0,
  sessions: 0,
  days: {},
};

export function dayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

export function loadReadingStats(): ReadingStats {
  if (typeof window === "undefined") return { ...EMPTY_STATS, days: {} };
  try {
    const raw = window.localStorage.getItem(READING_STATS_KEY);
    if (!raw) return { ...EMPTY_STATS, days: {} };
    const parsed = JSON.parse(raw) as Partial<ReadingStats> | null;
    if (!parsed || typeof parsed !== "object") {
      return { ...EMPTY_STATS, days: {} };
    }
    const days: ReadingStats["days"] = {};
    if (parsed.days && typeof parsed.days === "object") {
      for (const [key, value] of Object.entries(parsed.days)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !value) continue;
        days[key] = {
          ms: numberOrZero((value as { ms?: unknown }).ms),
          pages: numberOrZero((value as { pages?: unknown }).pages),
        };
      }
    }
    return {
      totalMs: numberOrZero(parsed.totalMs),
      totalPages: numberOrZero(parsed.totalPages),
      sessions: numberOrZero(parsed.sessions),
      days,
    };
  } catch {
    return { ...EMPTY_STATS, days: {} };
  }
}

function save(stats: ReadingStats): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(READING_STATS_KEY, JSON.stringify(stats));
  } catch {
    // Sin espacio: las estadísticas no se guardan.
  }
}

/** Suma una sesión de lectura (una apertura del lector). */
export function beginReadingSession(): void {
  const stats = loadReadingStats();
  stats.sessions += 1;
  save(stats);
}

/** Acumula tiempo y páginas. Se llama periódicamente y al salir. */
export function addReadingTime(ms: number, pages: number): void {
  const elapsed = Math.max(0, Math.min(ms, 4 * 60 * 60 * 1000));
  const readPages = Math.max(0, Math.round(pages));
  if (elapsed < 500 && readPages === 0) return;

  const stats = loadReadingStats();
  const key = dayKey();
  const today = stats.days[key] ?? { ms: 0, pages: 0 };

  stats.totalMs += elapsed;
  stats.totalPages += readPages;
  stats.days[key] = {
    ms: today.ms + elapsed,
    pages: today.pages + readPages,
  };

  // Conserva algo más de un año para que la estadística no crezca sin límite.
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 370);
  const limit = dayKey(cutoff);
  for (const day of Object.keys(stats.days)) {
    if (day < limit) delete stats.days[day];
  }

  save(stats);
}

export function formatReadingTime(ms: number): string {
  if (ms < 60_000) return ms > 0 ? "< 1 min" : "0 min";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days} d ${restHours} h` : `${days} d`;
}

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export type DayActivity = {
  key: string;
  label: string;
  ms: number;
  pages: number;
  today: boolean;
};

export function lastDays(stats: ReadingStats, count = 7): DayActivity[] {
  const result: DayActivity[] = [];
  const now = new Date();
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - offset);
    const key = dayKey(date);
    const activity = stats.days[key];
    result.push({
      key,
      label: offset === 0 ? "hoy" : WEEKDAYS[date.getDay()],
      ms: activity?.ms ?? 0,
      pages: activity?.pages ?? 0,
      today: offset === 0,
    });
  }
  return result;
}

export function readingStreak(stats: ReadingStats): number {
  let streak = 0;
  const cursor = new Date();
  // La racha sigue viva si ayer se leyó y hoy todavía no.
  if (!stats.days[dayKey(cursor)]?.ms) cursor.setDate(cursor.getDate() - 1);
  while (stats.days[dayKey(cursor)]?.ms) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
