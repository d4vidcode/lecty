import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Sin conexión — Lecty",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="grain grid min-h-screen place-items-center bg-paper px-5 py-16">
      <div className="relative z-[1] w-full max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-ink text-paper shadow-[0_18px_35px_-24px_rgb(0_0_0_/_0.8)]">
          <BookOpenIcon className="h-6 w-6" />
        </span>
        <p className="eyebrow mt-8">Sin conexión</p>
        <h1 className="display mt-2 text-4xl leading-[1.05] text-ink text-balance">
          Tu biblioteca sigue aquí.
        </h1>
        <p className="mt-4 text-[13px] leading-relaxed text-muted">
          No pudimos cargar esta página desde la red. Los libros que ya has
          abierto y los PDF guardados en este dispositivo siguen disponibles
          sin conexión.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
          <Link href="/" className="btn btn-primary">
            <BookOpenIcon className="h-[17px] w-[17px]" />
            Volver a la biblioteca
          </Link>
        </div>
        <p className="mt-8 text-[10.5px] leading-relaxed text-muted">
          Lecty guarda tus archivos en el navegador. Nada se sube a ningún
          servidor.
        </p>
      </div>
    </main>
  );
}
