export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function pageRangeLabel(pages: number[]): string {
  if (pages.length === 0) return "—";
  if (pages.length === 1) return `${pages[0] + 1}`;
  return `${pages[0] + 1}–${pages[pages.length - 1] + 1}`;
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat("es-ES").format(value);
}

export function relativeDate(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "ahora mismo";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `hace ${days} d`;
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(timestamp);
}
