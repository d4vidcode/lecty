/* Lecty service worker · offline app shell, PDF.js assets and sample books. */
/* eslint-disable no-restricted-globals */

const VERSION =
  new URL(self.location.href).searchParams.get("v") || "dev";

const PRECACHE = `lecty-precache-${VERSION}`;
const PAGES = `lecty-pages-${VERSION}`;
const RUNTIME = `lecty-runtime-${VERSION}`;
const CURRENT = new Set([PRECACHE, PAGES, RUNTIME]);

const OFFLINE_URL = "/offline";
const MANIFEST_URL = "/books/books.json";
const PRECACHE_LIST = "/sw-precache.json";
const APP_SHELL = ["/", OFFLINE_URL, "/manifest.webmanifest"];

const MAX_ROUTES = 80;

function isCacheable(response) {
  return response && response.status === 200 && response.type === "basic";
}

async function matchCached(cache, request) {
  return (
    (await cache.match(request, { ignoreSearch: true })) ||
    (await cache.match(
      typeof request === "string" ? request : request.url,
      { ignoreSearch: true }
    )) ||
    null
  );
}

async function mapLimit(items, limit, task) {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await task(items[index]);
      }
    }
  );
  await Promise.all(workers);
}

async function precache() {
  const cache = await caches.open(PRECACHE);
  const urls = new Set(APP_SHELL);

  try {
    const response = await fetch(PRECACHE_LIST, { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.urls)) {
        for (const url of data.urls) {
          if (typeof url === "string" && url.startsWith("/")) urls.add(url);
        }
      }
    }
  } catch {
    // Sin lista generada: al menos cacheamos el shell.
  }

  await mapLimit([...urls], 6, async (url) => {
    try {
      const response = await fetch(new Request(url, { cache: "reload" }));
      if (isCacheable(response)) await cache.put(url, response);
    } catch {
      // Un recurso que falla no debe impedir la instalación del resto.
    }
  });
}

async function cacheRoutes(urls) {
  const cache = await caches.open(PAGES);
  const list = [
    ...new Set(
      urls.filter(
        (url) =>
          typeof url === "string" &&
          /^\/read\/[^/?#]+$/.test(url) &&
          url.length < 512
      )
    ),
  ].slice(0, MAX_ROUTES);

  await mapLimit(list, 3, async (url) => {
    if (await cache.match(url, { ignoreSearch: true })) return;
    try {
      const response = await fetch(new Request(url, { cache: "reload" }));
      if (
        isCacheable(response) &&
        response.headers.get("content-type")?.includes("text/html")
      ) {
        await cache.put(url, response);
      }
    } catch {
      // Probablemente sin conexión: lo intentaremos en la próxima visita.
    }
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("lecty-") && !CURRENT.has(key))
          .map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
    return;
  }
  if (data.type === "CACHE_ROUTES" && Array.isArray(data.urls)) {
    event.waitUntil(cacheRoutes(data.urls));
  }
});

async function handleNavigation(request) {
  const cache = await caches.open(PAGES);
  const key = new URL(request.url).pathname;

  try {
    const response = await fetch(request);
    if (
      isCacheable(response) &&
      response.headers.get("content-type")?.includes("text/html")
    ) {
      await cache.put(key, response.clone());
    }
    return response;
  } catch {
    const page = await matchCached(cache, request);
    if (page) return page;

    const shellCache = await caches.open(PRECACHE);
    const offline = await matchCached(shellCache, OFFLINE_URL);
    if (offline) return offline;

    const shell = await matchCached(shellCache, "/");
    if (shell) return shell;

    return new Response(
      '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión — Lecty</title><body style="margin:0;display:grid;min-height:100vh;place-items:center;background:#f3eee4;color:#1d1915;font-family:Georgia,serif;text-align:center;padding:2rem"><div><h1 style="font-size:2rem;margin:0 0 .5rem">Sin conexión</h1><p style="margin:0;color:#4b4339">Abre Lecty de nuevo cuando recuperes la conexión.</p></div></body></html>',
      { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  let cached = await matchCached(cache, request);
  if (!cached) {
    // Un recurso puede haberse cacheado en otra versión o en otra caché.
    cached = await caches.match(request, { ignoreSearch: true });
  }
  if (cached) return cached;

  const response = await fetch(request);
  if (isCacheable(response)) await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (isCacheable(response)) await cache.put(request, response.clone());
    return response;
  } catch (cause) {
    const cached = await matchCached(cache, request);
    if (cached) return cached;
    throw cause;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // El proxy de lectura nunca se cachea: sirve PDF remotos y aplica seguridad.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (url.pathname === MANIFEST_URL) {
    event.respondWith(networkFirst(request, RUNTIME));
    return;
  }

  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(cacheFirst(request, PRECACHE));
    return;
  }

  if (url.pathname.startsWith("/books/")) {
    event.respondWith(cacheFirst(request, PRECACHE));
    return;
  }

  if (
    url.pathname.startsWith("/pdfjs/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:mjs|js|css|woff2?|png|svg|ico|wasm|bcmap|pfb|ttf|icc)$/.test(
      url.pathname
    )
  ) {
    const precached =
      url.pathname.startsWith("/pdfjs/") ||
      url.pathname.startsWith("/icons/") ||
      /\.(?:bcmap|pfb|ttf|icc|wasm)$/.test(url.pathname);
    event.respondWith(cacheFirst(request, precached ? PRECACHE : RUNTIME));
  }
});
