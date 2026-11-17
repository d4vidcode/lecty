"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { BookRenderer } from "@/lib/pdf";
import type { ReaderMode } from "@/lib/types";
import { clamp } from "@/lib/utils";
import { playPageSound } from "@/lib/sound";
import { cn } from "@/lib/utils";

export type Spread = { left: number | null; right: number | null };

export type FlipbookHandle = {
  next: () => void;
  prev: () => void;
  goToSpread: (index: number, options?: { animate?: boolean }) => void;
  goToPage: (page: number) => void;
};

export type FlipbookNavigate = (info: {
  page: number;
  spreadIndex: number;
  totalSpreads: number;
  spread: Spread;
}) => void;

type Props = {
  renderer: BookRenderer;
  mode: ReaderMode;
  initialPage: number;
  zoom?: number;
  sound?: boolean;
  reduceMotion?: boolean;
  onNavigate: FlipbookNavigate;
  onTapCenter?: () => void;
};

export function buildSpreads(pageCount: number, mode: ReaderMode): Spread[] {
  if (pageCount <= 0) return [{ left: null, right: null }];
  if (mode === "single") {
    return Array.from({ length: pageCount }, (_, index) => ({
      left: null,
      right: index,
    }));
  }
  const spreads: Spread[] = [{ left: null, right: 0 }];
  for (let page = 1; page < pageCount; page += 2) {
    spreads.push({
      left: page,
      right: page + 1 < pageCount ? page + 1 : null,
    });
  }
  return spreads;
}

export function spreadIndexForPage(page: number, mode: ReaderMode): number {
  if (mode === "single") return Math.max(0, page);
  if (page <= 0) return 0;
  return Math.ceil(page / 2);
}

function firstPageOf(spread: Spread): number {
  return spread.left ?? spread.right ?? 0;
}

function stripAngleAt(degrees: number, index: number): number {
  const curl = Math.sin(clamp(-degrees / 180, 0, 1) * Math.PI);
  const weight = 0.4 + (1.2 * index) / (CURL_STRIPS - 1);
  return curl * CURL_STRENGTH * weight;
}

const TURN_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const AUTO_TURN_MS = 640;
const SNAP_BACK_MS = 240;
const CURL_STRIPS = 12;
const CURL_STRENGTH = 4;

type Transition = { dir: "next" | "prev"; to: number };

type DragState = {
  dir: "next" | "prev";
  to: number;
  startX: number;
  startY: number;
  lastX: number;
  lastT: number;
  velocity: number;
  moved: boolean;
  pointerId: number;
  soundPlayed: boolean;
};

const Flipbook = forwardRef<FlipbookHandle, Props>(function Flipbook(
  {
    renderer,
    mode,
    initialPage,
    zoom = 1,
    sound = false,
    reduceMotion = false,
    onNavigate,
    onTapCenter,
  },
  ref
) {
  const spreads = useMemo(
    () => buildSpreads(renderer.pageCount, mode),
    [renderer.pageCount, mode]
  );

  const [current, setCurrent] = useState(() =>
    clamp(spreadIndexForPage(initialPage, mode), 0, spreads.length - 1)
  );
  const [transition, setTransition] = useState<Transition | null>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });

  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<HTMLDivElement>(null);
  const leafRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef(0);
  const settleRef = useRef<(() => void) | null>(null);
  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
  const stripAnimationsRef = useRef<Animation[]>([]);
  const angleRef = useRef(0);
  const autoRef = useRef(false);
  const transitionRef = useRef<Transition | null>(null);
  const currentRef = useRef(current);
  const dragRef = useRef<DragState | null>(null);
  const centerTapRef = useRef<{ x: number; y: number; moved: boolean; pointerId: number } | null>(
    null
  );

  currentRef.current = current;
  transitionRef.current = transition;

  const prefersReducedMotion = useCallback(
    () =>
      reduceMotion ||
      (typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    [reduceMotion]
  );

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setArea({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const applyStripAngles = useCallback((degrees: number) => {
    stripRefs.current.forEach((element, index) => {
      if (!element) return;
      element.style.transform = `rotateY(${stripAngleAt(degrees, index).toFixed(2)}deg)`;
    });
  }, []);

  const applyAngle = useCallback(
    (degrees: number) => {
      angleRef.current = degrees;
      const progress = clamp(-degrees / 180, 0, 1);
      if (leafRef.current) {
        leafRef.current.style.transform = `rotateY(${degrees}deg)`;
        leafRef.current.style.setProperty("--p", String(progress));
      }
      if (stageRef.current) {
        stageRef.current.style.setProperty("--p", String(progress));
      }
      applyStripAngles(degrees);
    },
    [applyStripAngles]
  );

  const prepareAngle = useCallback(
    (degrees: number) => {
      const leaf = leafRef.current;
      const stage = stageRef.current;
      window.clearTimeout(timerRef.current);
      settleRef.current = null;
      stripAnimationsRef.current.forEach((animation) => animation.cancel());
      stripAnimationsRef.current = [];
      if (leaf) leaf.style.transition = "none";
      if (stage) stage.style.transition = "none";
      applyAngle(degrees);
      // Commit the starting angle before handing the animation to CSS, so the
      // browser never interpolates from a stale position.
      void leaf?.offsetWidth;
    },
    [applyAngle]
  );

  /**
   * Deja que el compositor interpole `transform` y el sombreado (`--p`). Es
   * mucho más fluido que escribir el ángulo en cada frame desde JavaScript.
   */
  const runTurn = useCallback(
    (target: number, duration: number, done?: () => void) => {
      const leaf = leafRef.current;
      const stage = stageRef.current;
      window.clearTimeout(timerRef.current);
      settleRef.current = null;
      stripAnimationsRef.current.forEach((animation) => animation.cancel());
      stripAnimationsRef.current = [];
      const fromAngle = angleRef.current;

      if (!leaf || duration <= 0) {
        applyAngle(target);
        done?.();
        return;
      }

      const finish = () => {
        if (settleRef.current !== finish) return;
        settleRef.current = null;
        window.clearTimeout(timerRef.current);
        leaf.style.transition = "none";
        if (stage) stage.style.transition = "none";
        stripAnimationsRef.current.forEach((animation) => animation.cancel());
        stripAnimationsRef.current = [];
        applyStripAngles(target);
        done?.();
      };
      settleRef.current = finish;

      const timing = `${duration}ms ${TURN_EASE}`;
      leaf.style.transition = `transform ${timing}, --p ${timing}`;
      if (stage) stage.style.transition = `--p ${timing}`;
      applyAngle(target);

      // La base gira con una transición CSS (compositor) y cada tira se curva
      // con una animación propia: el papel se arquea y se aplana al terminar.
      const midAngle = (fromAngle + target) / 2;
      stripRefs.current.forEach((element, index) => {
        if (!element) return;
        const from = stripAngleAt(fromAngle, index);
        const mid = stripAngleAt(midAngle, index);
        const to = stripAngleAt(target, index);
        if (Math.abs(from - to) < 0.05 && Math.abs(mid) < 0.05) return;
        stripAnimationsRef.current.push(
          element.animate(
            [
              { transform: `rotateY(${from.toFixed(2)}deg)` },
              { transform: `rotateY(${mid.toFixed(2)}deg)`, offset: 0.5 },
              { transform: `rotateY(${to.toFixed(2)}deg)` },
            ],
            { duration, easing: TURN_EASE, fill: "both" }
          )
        );
      });

      // transitionend can be skipped if the tab is hidden or the element is
      // unmounted mid-turn; the timer guarantees the state always settles.
      timerRef.current = window.setTimeout(finish, duration + 140);
    },
    [applyAngle, applyStripAngles]
  );

  useEffect(() => {
    const leaf = leafRef.current;
    if (!leaf) return;
    const handleEnd = (event: TransitionEvent) => {
      if (event.propertyName === "transform") settleRef.current?.();
    };
    leaf.addEventListener("transitionend", handleEnd);
    return () => leaf.removeEventListener("transitionend", handleEnd);
  }, []);

  const finishTransition = useCallback((next: Transition) => {
    setCurrent(next.to);
    setTransition(null);
  }, []);

  const cancelTransition = useCallback(() => {
    const active = transitionRef.current;
    if (!active) return;
    const target = active.dir === "next" ? 0 : -180;
    runTurn(target, SNAP_BACK_MS, () => setTransition(null));
  }, [runTurn]);

  const beginTransition = useCallback(
    (dir: "next" | "prev", to: number, auto: boolean) => {
      if (transitionRef.current || to < 0 || to >= spreads.length) return false;
      const target = spreads[to];
      if (target) {
        const pages = [target.left, target.right].filter(
          (page): page is number => page != null
        );
        if (pages.length) renderer.preload(pages);
      }
      if (sound && auto) playPageSound();
      autoRef.current = auto;
      setTransition({ dir, to });
      return true;
    },
    [renderer, sound, spreads]
  );

  const turn = useCallback(
    (direction: 1 | -1) => {
      if (transitionRef.current) return;
      const from = currentRef.current;
      const to = from + direction;
      if (to < 0 || to >= spreads.length) return;
      beginTransition(direction === 1 ? "next" : "prev", to, true);
    },
    [beginTransition, spreads.length]
  );

  const jumpTo = useCallback(
    (index: number, options?: { animate?: boolean }) => {
      if (transitionRef.current) return;
      const target = clamp(index, 0, spreads.length - 1);
      if (target === currentRef.current) return;
      const delta = target - currentRef.current;
      if (Math.abs(delta) === 1 && options?.animate !== false) {
        beginTransition(delta > 0 ? "next" : "prev", target, true);
        return;
      }
      prepareAngle(0);
      setCurrent(target);
    },
    [beginTransition, prepareAngle, spreads.length]
  );

  useImperativeHandle(
    ref,
    () => ({
      next: () => turn(1),
      prev: () => turn(-1),
      goToSpread: (index, options) => jumpTo(index, options),
      goToPage: (page) =>
        jumpTo(spreadIndexForPage(clamp(page, 0, renderer.pageCount - 1), mode)),
    }),
    [jumpTo, mode, renderer.pageCount, turn]
  );

  const registerStrip = useCallback(
    (index: number, element: HTMLDivElement | null) => {
      stripRefs.current[index] = element;
      if (element) {
        element.style.transform = `rotateY(${stripAngleAt(angleRef.current, index).toFixed(2)}deg)`;
      }
    },
    []
  );

  useLayoutEffect(() => {
    if (!transition) {
      window.clearTimeout(timerRef.current);
      settleRef.current = null;
      if (leafRef.current) leafRef.current.style.transition = "none";
      if (stageRef.current) stageRef.current.style.transition = "none";
      applyAngle(0);
      return;
    }
    prepareAngle(transition.dir === "next" ? 0 : -180);
    if (autoRef.current) {
      autoRef.current = false;
      const reduced = prefersReducedMotion();
      runTurn(transition.dir === "next" ? -180 : 0, reduced ? 0 : AUTO_TURN_MS, () =>
        finishTransition(transition)
      );
    }
  }, [transition, applyAngle, prepareAngle, runTurn, finishTransition, prefersReducedMotion]);

  useEffect(() => {
    return () => {
      window.clearTimeout(timerRef.current);
      settleRef.current = null;
      stripAnimationsRef.current.forEach((animation) => animation.cancel());
      stripAnimationsRef.current = [];
    };
  }, []);

  const navRef = useRef(onNavigate);
  navRef.current = onNavigate;
  useEffect(() => {
    const spread = spreads[current];
    if (!spread) return;
    navRef.current({
      page: firstPageOf(spread),
      spreadIndex: current,
      totalSpreads: spreads.length,
      spread,
    });
  }, [current, spreads]);

  useEffect(() => {
    const pages = new Set<number>();
    for (let index = current - 1; index <= current + 2; index += 1) {
      const spread = spreads[index];
      if (!spread) continue;
      if (spread.left != null) pages.add(spread.left);
      if (spread.right != null) pages.add(spread.right);
    }
    const timer = window.setTimeout(() => renderer.preload([...pages]), 120);
    return () => window.clearTimeout(timer);
  }, [current, spreads, renderer]);

  const aspect = renderer.pageAspect || 0.75;
  const padding = mode === "spread" ? 18 : 30;
  const availableWidth = Math.max(0, area.width - padding * 2);
  const availableHeight = Math.max(0, area.height - padding * 2);
  const fitHeight =
    mode === "spread"
      ? Math.min(availableHeight, availableWidth / (2 * aspect))
      : Math.min(availableHeight, availableWidth / aspect);
  const pageHeight = Math.max(0, Math.floor(fitHeight * zoom));
  const pageWidth = Math.max(0, Math.round(pageHeight * aspect));
  const bookWidth = mode === "spread" ? pageWidth * 2 : pageWidth;

  const from = spreads[current] ?? { left: null, right: null };
  const to = transition ? spreads[transition.to] : null;

  let leftPage: number | null;
  let rightPage: number | null;
  let frontPage: number | null;
  let backPage: number | null;

  if (!to) {
    leftPage = from.left;
    rightPage = from.right;
    frontPage = from.right;
    backPage = from.left;
  } else if (mode === "single") {
    if (transition?.dir === "next") {
      rightPage = to.right;
      frontPage = from.right;
      backPage = to.right;
    } else {
      rightPage = from.right;
      frontPage = to.right;
      backPage = from.right;
    }
    leftPage = null;
  } else if (transition?.dir === "next") {
    leftPage = from.left;
    rightPage = to.right;
    frontPage = from.right;
    backPage = to.left;
  } else {
    leftPage = to.left;
    rightPage = from.right;
    frontPage = to.right;
    backPage = from.left;
  }

  const canDrag = zoom <= 1.001 && !reduceMotion;

  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select")) return;
    if (transitionRef.current) return;
    const book = bookRef.current;
    if (!book) return;

    const rect = book.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const centerZone = mode === "spread" ? 0.12 : 0.18;

    if (ratio > 0.5 - centerZone && ratio < 0.5 + centerZone) {
      centerTapRef.current = {
        x: event.clientX,
        y: event.clientY,
        moved: false,
        pointerId: event.pointerId,
      };
      return;
    }

    if (!canDrag) {
      if (ratio >= 0.5) turn(1);
      else turn(-1);
      return;
    }

    const dir: "next" | "prev" = ratio > 0.5 ? "next" : "prev";
    const toIndex = currentRef.current + (dir === "next" ? 1 : -1);
    if (toIndex < 0 || toIndex >= spreads.length) return;
    if (!beginTransition(dir, toIndex, false)) return;
    if (leafRef.current) leafRef.current.style.transition = "none";
    if (stageRef.current) stageRef.current.style.transition = "none";

    dragRef.current = {
      dir,
      to: toIndex,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastT: performance.now(),
      velocity: 0,
      moved: false,
      pointerId: event.pointerId,
      soundPlayed: false,
    };
    book.setPointerCapture(event.pointerId);
  };

  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const centerTap = centerTapRef.current;
    if (centerTap && centerTap.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - centerTap.x, event.clientY - centerTap.y) > 8) {
        centerTap.moved = true;
      }
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const book = bookRef.current;
    if (!book) return;
    const rect = book.getBoundingClientRect();
    const pageWidthPx = mode === "spread" ? rect.width / 2 : rect.width;
    if (pageWidthPx <= 0) return;

    const dx = event.clientX - drag.startX;
    if (Math.abs(dx) > 4 || Math.abs(event.clientY - drag.startY) > 4) {
      drag.moved = true;
    }

    const progress =
      drag.dir === "next"
        ? clamp(-dx / pageWidthPx, 0, 1)
        : clamp(dx / pageWidthPx, 0, 1);
    applyAngle(drag.dir === "next" ? -180 * progress : -180 + 180 * progress);

    const now = performance.now();
    const elapsed = now - drag.lastT;
    if (elapsed > 0) {
      const delta = event.clientX - drag.lastX;
      drag.velocity = delta / elapsed;
      drag.lastX = event.clientX;
      drag.lastT = now;
    }

    if (!drag.soundPlayed && sound && progress > 0.12) {
      drag.soundPlayed = true;
      playPageSound();
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const centerTap = centerTapRef.current;
    if (centerTap && centerTap.pointerId === event.pointerId) {
      centerTapRef.current = null;
      if (!centerTap.moved && !cancelled) onTapCenter?.();
      return;
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    const book = bookRef.current;
    if (book?.hasPointerCapture(event.pointerId)) {
      book.releasePointerCapture(event.pointerId);
    }

    if (cancelled) {
      cancelTransition();
      return;
    }

    const progress =
      drag.dir === "next"
        ? clamp(-angleRef.current / 180, 0, 1)
        : clamp(1 + angleRef.current / 180, 0, 1);
    const flick =
      drag.dir === "next" ? drag.velocity < -0.5 : drag.velocity > 0.5;
    const shouldComplete = !drag.moved || progress > 0.32 || flick;

    if (shouldComplete) {
      const target = drag.dir === "next" ? -180 : 0;
      const reduced = prefersReducedMotion();
      const remaining = Math.abs(target - angleRef.current) / 180;
      if (sound && !drag.soundPlayed) playPageSound();
      runTurn(target, reduced ? 0 : SNAP_BACK_MS + 320 * remaining, () =>
        finishTransition({ dir: drag.dir, to: drag.to })
      );
    } else {
      cancelTransition();
    }
  };

  return (
    <div ref={viewportRef} className="flip-viewport">
      <div
        ref={stageRef}
        className="flip-stage"
        style={{ width: bookWidth || undefined, height: pageHeight || undefined }}
      >
        <div
          ref={bookRef}
          className={cn("flip-book", canDrag && "touch-none")}
          data-mode={mode}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={(event) => endPointer(event)}
          onPointerCancel={(event) => endPointer(event, true)}
          role="group"
          aria-roledescription="libro"
          aria-label="Libro abierto"
        >
          {mode === "spread" && (
            <div className="flip-page flip-page--left">
              <PageFace
                key={`left-${leftPage ?? "blank"}`}
                renderer={renderer}
                page={leftPage}
              />
            </div>
          )}
          <div className="flip-page flip-page--right">
            <PageFace
              key={`right-${rightPage ?? "blank"}`}
              renderer={renderer}
              page={rightPage}
            />
          </div>

          <div className="flip-cast" />
          <div
            ref={leafRef}
            className={cn("flip-leaf", canDrag && "flip-leaf-drag")}
            style={{ transform: "rotateY(0deg)" }}
          >
            <LeafSheet
              renderer={renderer}
              frontPage={frontPage}
              backPage={backPage}
              pageWidth={pageWidth}
              registerStrip={registerStrip}
            />
            <div className="leaf-wash leaf-wash--front" aria-hidden />
            <div className="leaf-wash leaf-wash--back" aria-hidden />
          </div>
        </div>
      </div>
    </div>
  );
});

function usePageImage(
  renderer: BookRenderer,
  page: number | null
): string | null {
  const [src, setSrc] = useState<string | null>(() =>
    page != null ? renderer.peek(page) : null
  );

  useEffect(() => {
    let alive = true;
    if (page == null) {
      setSrc(null);
      return () => {
        alive = false;
      };
    }
    const cached = renderer.peek(page);
    if (cached) {
      setSrc(cached);
      return () => {
        alive = false;
      };
    }
    setSrc(null);
    renderer
      .getPage(page)
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [page, renderer]);

  return src;
}

function sheetsStyle(
  src: string | null,
  slice: number,
  pageWidth: number,
  stripWidth: number
): CSSProperties {
  const overlap = 1;
  return {
    backgroundColor: "#fdfaf3",
    backgroundImage: src ? `url("${src}")` : "none",
    backgroundSize: src ? `${pageWidth}px 100%` : "100% 100%",
    backgroundPosition: src
      ? `${overlap - slice * stripWidth}px 0`
      : "0 0",
    backgroundRepeat: "no-repeat",
  };
}

function LeafStrip({
  index,
  frontSrc,
  backSrc,
  stripWidth,
  pageWidth,
  registerStrip,
}: {
  index: number;
  frontSrc: string;
  backSrc: string | null;
  stripWidth: number;
  pageWidth: number;
  registerStrip: (index: number, element: HTMLDivElement | null) => void;
}) {
  return (
    <div
      className="leaf-strip"
      style={{ width: stripWidth }}
      ref={(element) => registerStrip(index, element)}
    >
      <div
        className="leaf-strip-face"
        style={sheetsStyle(frontSrc, index, pageWidth, stripWidth)}
      />
      <div
        className="leaf-strip-face leaf-strip-face--back"
        style={sheetsStyle(
          backSrc,
          CURL_STRIPS - 1 - index,
          pageWidth,
          stripWidth
        )}
      />
      {index + 1 < CURL_STRIPS && (
        <LeafStrip
          index={index + 1}
          frontSrc={frontSrc}
          backSrc={backSrc}
          stripWidth={stripWidth}
          pageWidth={pageWidth}
          registerStrip={registerStrip}
        />
      )}
    </div>
  );
}

/**
 * La hoja está dividida en tiras encadenadas: cada una gira un poco más que
 * la anterior y, al ir montadas una dentro de otra, el conjunto se arquea como
 * papel en vez de girar como una tarjeta rígida.
 */
function LeafSheet({
  renderer,
  frontPage,
  backPage,
  pageWidth,
  registerStrip,
}: {
  renderer: BookRenderer;
  frontPage: number | null;
  backPage: number | null;
  pageWidth: number;
  registerStrip: (index: number, element: HTMLDivElement | null) => void;
}) {
  const frontSrc = usePageImage(renderer, frontPage);
  const backSrc = usePageImage(renderer, backPage);
  const backBlank = backPage == null;
  const stripWidth = Math.max(1, pageWidth / CURL_STRIPS);

  if (frontSrc && (backSrc || backBlank)) {
    return (
      <div className="leaf-sheet">
        <LeafStrip
          index={0}
          frontSrc={frontSrc}
          backSrc={backSrc}
          stripWidth={stripWidth}
          pageWidth={pageWidth}
          registerStrip={registerStrip}
        />
      </div>
    );
  }

  return (
    <>
      <div className="flip-face flip-face--front">
        <PageFace renderer={renderer} page={frontPage} />
      </div>
      <div className="flip-face flip-face--back">
        <PageFace renderer={renderer} page={backPage} blank />
      </div>
    </>
  );
}

function PageFace({
  renderer,
  page,
  blank = false,
}: {
  renderer: BookRenderer;
  page: number | null;
  blank?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(() =>
    page != null ? renderer.peek(page) : null
  );

  useEffect(() => {
    let alive = true;
    if (page == null) {
      setSrc(null);
      return () => {
        alive = false;
      };
    }
    const cached = renderer.peek(page);
    if (cached) {
      setSrc(cached);
      return () => {
        alive = false;
      };
    }
    setSrc(null);
    renderer
      .getPage(page)
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [page, renderer]);

  if (page == null) {
    return <div className="page-blank" aria-hidden="true" />;
  }

  if (!src) {
    return <div className="page-loading" aria-label={`Cargando página ${page + 1}`} />;
  }

  return (
    <img
      src={src}
      alt={`Página ${page + 1}`}
      className={cn("page-img", blank && "opacity-95")}
      draggable={false}
    />
  );
}

export default Flipbook;
