"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpenIcon, SparkIcon, XIcon } from "@/components/icons";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const SW_REVISION = "1";
const SW_VERSION_KEY = "lecty:sw-version";
const INSTALL_DISMISSED_KEY = "lecty:install-dismissed";

/**
 * Registra el service worker y muestra avisos discretos de instalación,
 * conexión y actualización. Se oculta dentro del lector para no tapar sus
 * controles; sus listeners siguen activos.
 */
export default function PwaStatus() {
  const pathname = usePathname();
  const isReader = pathname?.startsWith("/read/") ?? false;

  const [offline, setOffline] = useState(false);
  const [install, setInstall] = useState<InstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(true);
  const [updateReady, setUpdateReady] = useState(false);

  const registration = useRef<ServiceWorkerRegistration | null>(null);
  const pendingUpdate = useRef(false);
  const reloaded = useRef(false);

  const reload = useCallback(() => {
    if (reloaded.current) return;
    reloaded.current = true;
    window.location.reload();
  }, []);

  /* ---------------------------------------------------------------- */
  /* Service worker                                                    */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    let cancelled = false;

    const boot = async () => {
      try {
        let version: string | null = null;
        try {
          const response = await fetch("/sw-precache.json", {
            cache: "no-store",
          });
          if (response.ok) {
            const data = (await response.json()) as { version?: unknown };
            if (typeof data.version === "string") version = data.version;
          }
        } catch {
          // Sin conexión: reutilizamos la versión ya conocida.
        }

        if (!version) {
          try {
            version = window.localStorage.getItem(SW_VERSION_KEY);
          } catch {
            version = null;
          }
        }

        if (!version) {
          // Si ya hay un service worker, no registramos otra versión desde
          // cero solo porque el manifiesto de precarga no esté disponible.
          const existing = await navigator.serviceWorker.getRegistration();
          if (existing) return;
          version = "dev";
        }

        try {
          window.localStorage.setItem(SW_VERSION_KEY, version);
        } catch {
          // Ignorar.
        }

        const registered = await navigator.serviceWorker.register(
          `/sw.js?v=${encodeURIComponent(version)}-${SW_REVISION}`,
          { scope: "/", updateViaCache: "none" }
        );
        if (cancelled) return;

        registration.current = registered;

        if (registered.waiting && navigator.serviceWorker.controller) {
          setUpdateReady(true);
        }

        registered.addEventListener("updatefound", () => {
          const worker = registered.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setUpdateReady(true);
            }
          });
        });
      } catch {
        // La app funciona igual sin service worker (por ejemplo, sin HTTPS).
      }
    };

    if (document.readyState === "complete") {
      void boot();
    } else {
      window.addEventListener("load", boot, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener("load", boot);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onControllerChange = () => {
      if (pendingUpdate.current) reload();
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange
    );
    return () =>
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
  }, [reload]);

  const applyUpdate = useCallback(async () => {
    pendingUpdate.current = true;
    setUpdateReady(false);
    const registered =
      registration.current ?? (await navigator.serviceWorker.getRegistration());
    registered?.waiting?.postMessage({ type: "SKIP_WAITING" });
    // Si el navegador no emite controllerchange, recargamos igualmente.
    window.setTimeout(reload, 1400);
  }, [reload]);

  /* ---------------------------------------------------------------- */
  /* Conexión e instalación                                            */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    try {
      setInstallDismissed(
        window.localStorage.getItem(INSTALL_DISMISSED_KEY) === "1"
      );
    } catch {
      setInstallDismissed(false);
    }
  }, []);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstall(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!install) return;
    await install.prompt();
    await install.userChoice;
    setInstall(null);
  }, [install]);

  const dismissInstall = useCallback(() => {
    setInstallDismissed(true);
    try {
      window.localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {
      // Ignorar.
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /* Navegación completa sin conexión                                  */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (navigator.onLine) return;
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      const here = window.location;
      if (url.pathname === here.pathname && url.search === here.search) {
        return; // Enlaces a un ancla de la misma página.
      }

      // Sin red, el router de Next no puede pedir el payload RSC. Una
      // navegación completa sí puede servirse desde el HTML precacheado.
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(url.href);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  if (isReader) return null;
  const showUpdate = updateReady && !offline;
  if (!offline && !showUpdate && (!install || installDismissed)) return null;
  return (
    <div className="pointer-events-none fixed bottom-4 left-4 z-[94] flex w-[min(340px,calc(100vw-2rem))] flex-col gap-2">
      {showUpdate && (
        <div
          className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-[0_20px_45px_-24px_rgb(0_0_0_/_0.55)] backdrop-blur-xl"
          role="status"
          aria-live="polite"
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line bg-paper text-accent">
            <SparkIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-semibold text-ink">
              Nueva versión lista
            </p>
            <p className="mt-0.5 text-[10.5px] leading-snug text-muted">
              Actualiza para ver los últimos cambios.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary !px-3 !py-1.5 text-[11px]"
            onClick={() => void applyUpdate()}
          >
            Actualizar
          </button>
        </div>
      )}

      {offline && (
        <div
          className="pointer-events-none flex items-center gap-2 self-start rounded-full bg-[#1d1915]/90 px-3.5 py-2 text-[11px] text-[#f5efe3] shadow-[0_18px_35px_-20px_rgb(0_0_0_/_0.65)] backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
          <span>Sin conexión · tu biblioteca guardada sigue disponible</span>
        </div>
      )}

      {install && !installDismissed && !offline && !updateReady && (
        <div className="pointer-events-auto flex items-start gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-[0_20px_45px_-24px_rgb(0_0_0_/_0.55)] backdrop-blur-xl">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-paper">
            <BookOpenIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-semibold text-ink">Instala Lecty</p>
            <p className="mt-0.5 text-[10.5px] leading-snug text-muted">
              Acceso directo, a pantalla completa y con tus libros sin conexión.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="btn btn-primary !px-3 !py-1.5 text-[11px]"
                onClick={() => void promptInstall()}
              >
                Instalar
              </button>
              <button
                type="button"
                className="text-[10.5px] text-muted underline-offset-2 hover:text-ink hover:underline"
                onClick={dismissInstall}
              >
                Ahora no
              </button>
            </div>
          </div>
          <button
            type="button"
            className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted transition hover:bg-ink/5 hover:text-ink"
            onClick={dismissInstall}
            aria-label="Ocultar sugerencia de instalación"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
