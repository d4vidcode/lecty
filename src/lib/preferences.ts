export type UiPreferences = {
  autoMetadata: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
};

export const UI_PREFS_KEY = "lecty:ui-prefs";

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  autoMetadata: true,
  highContrast: false,
  reduceMotion: false,
};

export function loadUiPreferences(): UiPreferences {
  if (typeof window === "undefined") return { ...DEFAULT_UI_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return { ...DEFAULT_UI_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<UiPreferences> | null;
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_UI_PREFERENCES };
    return {
      autoMetadata:
        typeof parsed.autoMetadata === "boolean"
          ? parsed.autoMetadata
          : DEFAULT_UI_PREFERENCES.autoMetadata,
      highContrast: parsed.highContrast === true,
      reduceMotion: parsed.reduceMotion === true,
    };
  } catch {
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

export function applyUiPreferences(prefs: UiPreferences): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.contrast = prefs.highContrast ? "high" : "normal";
  root.dataset.reduceMotion = prefs.reduceMotion ? "true" : "false";
}

export function saveUiPreferences(next: UiPreferences): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify(next));
    } catch {
      // Preferencias no persistentes.
    }
  }
  applyUiPreferences(next);
}

export function systemPrefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
