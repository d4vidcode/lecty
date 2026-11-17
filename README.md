# Lecty

Biblioteca personal de PDF con forma de estantería y un lector con paso de hoja en 3D.
Todo el contenido que subes se queda en tu navegador: no hay cuentas, ni servidor de
documentos, ni analítica.

## Qué incluye

### Biblioteca

- Estantería visual con portadas, lomo, progreso de lectura y orden configurable.
- Organización por **categorías** (libros, cómics, revistas y documentos) y filtros por
  género/etiqueta, con contadores y búsqueda por título, autor o archivo.
- **Ajustes**: la importación de contenido, el tema y la información de almacenamiento
  viven en un panel discreto, sin botones de subida sueltos por la interfaz.
- Subida de PDFs por arrastre o selector (hasta 120 MB), eligiendo la categoría de
  destino, y borrado con confirmación.
- **Importación de carpetas completas**: el selector de carpeta y el arrastre recorren
  todas las subcarpetas en busca de PDFs. Cada archivo hereda la categoría y las
  etiquetas de su ruta.
- **Detección automática de metadatos**: título y autoría reales del PDF, limpieza de
  nombres de archivo, volumen (Tomo/Vol.), etiquetas de género y categoría. Se puede
  desactivar en Ajustes.
- **Ficha editable**: título, autoría, categoría, etiquetas, portada propia, favorito y
  estado de lectura (pendiente, leyendo, terminado o abandonado).
- **Favoritos y estados**: filtros con contador para localizar lo que estás leyendo, lo
  que has terminado o tu lista de favoritos.
- **Estadísticas de lectura**: tiempo real con un libro abierto, páginas recorridas,
  sesiones, racha y gráfica de los últimos siete días.
- **Importación por enlace**: pega la URL de un PDF y Lecty genera la portada y lo abre
  desde su origen. El archivo no se copia a tu equipo.
- Tema claro / oscuro, **alto contraste**, **reducción de movimiento**, enlace para
  saltar a la estantería y atajos de teclado documentados.

### Lector

- Paso de hoja animado: la hoja gira con una transición suave y se **arquea** por tiras
  3D encadenadas, con sombra proyectada y luz sobre el papel.
- Modo doble página en escritorio y página única por debajo de 900 px.
- Arrastrar la esquina de la hoja para pasar página, con retorno elástico si no llega.
- Índice (TOC), miniaturas, buscador de texto en todo el documento y marcadores.
- Progreso guardado por libro y reanudación automática.
- Temas de lectura (día, noche, sepia), zoom, pantalla completa, sonido de página y
  atajos de teclado.

### Rendimiento

- pdf.js rasteriza cada página una sola vez y mantiene una caché en memoria.
- Las páginas de la hoja se precargan al empezar el giro.
- La hoja se anima en el compositor (transición CSS + Web Animations), no con `rAF`.

### PWA y lectura sin conexión

- **Instalable**: manifiesto web, iconos normales y `maskable`, modo `standalone` y
  pantalla de instalación en Chrome/Edge. La sugerencia de instalación se puede cerrar
  y no vuelve a aparecer.
- **App shell offline**: un service worker precarga la biblioteca, la página de aviso sin
  conexión, los recursos de pdf.js (~4,6 MB) y los PDF de ejemplo.
- **Tus libros**: los PDF subidos ya viven en IndexedDB, así que se abren sin red. La
  biblioteca avisa al service worker para cachear también el HTML del lector de cada
  libro (hasta 80 rutas).
- **Enlaces externos**: siguen necesitando conexión, porque el PDF no se copia al
  dispositivo. El service worker nunca cachea `/api/pdf`.
- Avisos discretos de «Sin conexión», «Nueva versión lista» e «Instala Lecty» en la
  biblioteca. Al volver a estar online, todo sigue funcionando con normalidad.

## Requisitos

- Node.js 20 o superior.
- Un navegador moderno con `IndexedDB`, `@property` y `ResizeObserver`.

## Puesta en marcha

```bash
npm install
npm run dev
```

Abre <http://localhost:3000>. Para usar otro puerto:

```bash
npm run dev -- -p 3002
```

`postinstall` copia los recursos de pdf.js a `public/pdfjs` y genera la lista de precarga
del service worker. Si esa carpeta desaparece, vuelve a ejecutar `npm install` o
`node scripts/copy-pdf-assets.mjs && node scripts/make-precache.mjs`.

> El service worker solo se registra en la compilación de producción. Para probar la
> instalación y el modo sin conexión usa `npm run build && npm start`, no `npm run dev`.

### Scripts

| Script | Para qué sirve |
| --- | --- |
| `npm run dev` | Servidor de desarrollo (sin service worker) |
| `npm run build` | Compilación de producción; regenera la lista de precarga |
| `npm start` | Servir la compilación |
| `npm run lint` | ESLint |
| `npm run books` | Regenera los PDF de muestra de `public/books` |
| `npm run icons` | Regenera los iconos PWA de `public/icons` |
| `npm run precache` | Regenera `public/sw-precache.json` y su versión |

## Cómo se guardan los datos

| Dato | Dónde vive |
| --- | --- |
| PDFs subidos | IndexedDB `lecty` (base `lecty`, almacén `books`) |
| Portadas de enlaces | IndexedDB, como data URL |
| Metadatos de enlaces | IndexedDB (URL, título, autor, categoría, `viaProxy`) |
| Progreso, marcadores y ajustes | `localStorage` con prefijo `lecty:` |
| Fichas editadas, favoritos y estados | `localStorage` (`lecty:book-meta`) |
| Estadísticas de lectura | `localStorage` (`lecty:reading-stats`) |
| Preferencias de interfaz | `localStorage` (`lecty:ui-prefs`) |
| App shell, recursos y rutas del lector | Cache Storage del service worker (`lecty-*`) |

Cada libro guarda su categoría (`libros`, `comics`, `revistas`, `documentos`). Los libros
antiguos sin categoría se clasifican automáticamente a partir de su título y etiquetas.

Los libros de ejemplo de `public/books` se leen directamente del servidor. No se envía
ningún documento a un servicio externo.

## Añadir contenido

1. Abre **Ajustes** con el botón de la cabecera (junto al cambio de tema).
2. Elige la categoría de destino: libros, cómics, revistas o documentos.
3. Pulsa **Subir PDF** y selecciona uno o varios archivos, **Carpeta** para importar
   una carpeta completa, o **Enlace** para importar un PDF publicado en internet.

La **detección automática de metadatos** está activa por defecto. Usa el título y la
autoría que declara el PDF, limpia nombres como `scan_2024` o `Microsoft Word - …`, y
completa etiquetas y categoría con la ruta de la carpeta. Si un PDF no declara metadatos,
se usa el nombre del archivo. El interruptor de Ajustes permite desactivarla y conservar
el nombre tal cual.

### Editar la ficha de un libro

Pasa el cursor por una portada y pulsa el lápiz (o el corazón para favoritos). Desde la
ficha puedes cambiar título, autoría, categoría, etiquetas, portada, favorito y estado
de lectura. Los cambios se guardan aparte del PDF y se pueden deshacer volviendo a
**Restaurar portada del PDF** o eligiendo **Automático** como estado.

Los estados también se pueden deducir del progreso: sin abrir es *Pendiente*, con
páginas leídas es *Leyendo* y al llegar al final es *Terminado*. Un estado elegido a mano
tiene prioridad.

## Importar un PDF por enlace

1. Pulsa **Desde un enlace** en **Ajustes**.
2. Pega una URL `http(s)://…/documento.pdf` (también vale un dominio sin esquema).
3. Lecty intenta leerlo directamente con pdf.js. Si el servidor remoto no permite CORS,
   reintenta a través de `/api/pdf`, que descarga el archivo en el servidor y lo sirve
   desde tu propio origen.

Si el servidor de origen exige autenticación, cookies o bloquea las descargas, la
importación fallará: en ese caso descarga el PDF y súbelo. Un enlace guardado sigue
apuntando a su origen, así que si el archivo se mueve o se borra, el libro dejará de
abrirse (puedes borrarlo desde la biblioteca).

### Límites y seguridad del proxy

- Solo se aceptan URLs `http` y `https`; se rechazan las redirecciones a otros esquemas.
- Se bloquean hosts privados, de loopback, link-local y nombres sin dominio.
- Tamaño máximo de descarga: 80 MB (las subidas locales admiten 120 MB).
- Se comprueba que la respuesta empiece por `%PDF-` y se devuelven los códigos de error
  del origen (401, 403, 404…) para que el mensaje sea útil.
- El proxy no guarda nada en disco ni en caché.

## Estructura

```
src/
  app/
    page.tsx                 Biblioteca
    read/[id]/page.tsx       Ruta del lector
    offline/page.tsx         Aviso sin conexión
    manifest.ts              Manifiesto PWA
    api/pdf/route.ts         Proxy de PDFs con protección SSRF
  components/
    PwaStatus.tsx            Registro del SW, instalación y avisos
    library/                 Estantería, categorías, tarjetas y panel de ajustes
    reader/                  Lector, flipbook, paneles, búsqueda, ajustes
  lib/
    pdf.ts                   Apertura, rasterizado y cachés de pdf.js
    books.ts                 Subida, importación por enlace y borrado
    metadata.ts              Detección de título, autoría, etiquetas y categoría
    folder.ts                Recorrido de carpetas y arrastre de directorios
    book-meta.ts             Fichas, favoritos y estados de lectura
    reading-stats.ts         Tiempo, páginas, sesiones y rachas
    preferences.ts           Alto contraste y reducción de movimiento
    image.ts                 Redimensionado de portadas
    categories.ts            Categorías, validación e inferencia
    storage.ts               IndexedDB y preferencias
    types.ts                 Tipos compartidos
public/
  books/                     PDFs y manifiesto de ejemplo
  icons/                     Iconos PWA (generados)
  pdfjs/                     Worker y recursos de pdf.js (generados)
  sw.js                      Service worker
  sw-precache.json           Lista y versión de precarga (generada)
scripts/
  make-icons.mjs             Genera los iconos PWA
  make-precache.mjs          Genera la lista de precarga
```

## Problemas frecuentes

- **«No pudimos abrir el enlace»**: el origen no permite CORS y el proxy tampoco pudo
  descargarlo. Comprueba que la URL sea pública y directa al PDF.
- **La portada no aparece**: algunos PDFs no tienen primera página renderizable; el
  libro se abre igualmente.
- **El progreso no se guarda**: ocurre en navegación privada o si el navegador bloquea
  el almacenamiento del sitio.
- **La animación se ve brusca**: si el sistema tiene activada la reducción de movimiento o
  el interruptor **Reducir movimiento** está activo en Ajustes, Lecty desactiva el giro
  animado a propósito.
- **El modo sin conexión no aparece en desarrollo**: es intencionado. El service worker
  solo se registra con `npm run build && npm start` y en un contexto seguro (`localhost`
  o HTTPS).
- **Sigue viéndose una versión antigua**: pulsa «Actualizar» en el aviso de nueva versión
  o recarga con `Ctrl`/`Cmd` + `Shift` + `R`. Si hace falta, borra los datos del sitio.
- **Un libro de enlace no abre sin conexión**: su PDF está en otro servidor y no se copia
  al dispositivo. Descárgalo y súbelo si quieres leerlo offline.

## Créditos

PDFs de ejemplo de dominio público (Bécquer, Cervantes) generados con PDFKit.
Tipografía y estilos con Tailwind CSS v4; lectura con pdf.js.
