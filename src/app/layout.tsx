import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import PwaStatus from "@/components/PwaStatus";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Lecty — Tu biblioteca, en páginas",
  description:
    "Convierte tus PDF en libros con paso de hoja real. Biblioteca local, lector con índice, búsqueda, marcadores y progreso. Sin cuentas ni subidas.",
  applicationName: "Lecty",
  formatDetection: { telephone: false, email: false, address: false },
  icons: {
    icon: [
      {
        url: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Lecty",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3eee4" },
    { media: "(prefers-color-scheme: dark)", color: "#121110" },
  ],
  colorScheme: "light dark",
};

const themeScript = `(function(){try{var stored=localStorage.getItem("lecty-theme");var theme=stored==="dark"||stored==="light"?stored:(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=theme;var prefs={};try{prefs=JSON.parse(localStorage.getItem("lecty:ui-prefs")||"{}")||{};}catch(e){}document.documentElement.dataset.contrast=prefs.highContrast===true?"high":"normal";document.documentElement.dataset.reduceMotion=prefs.reduceMotion===true?"true":"false";}catch(e){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      data-theme="light"
      data-contrast="normal"
      data-reduce-motion="false"
      suppressHydrationWarning
      className={`${fraunces.variable} ${inter.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <PwaStatus />
        {children}
      </body>
    </html>
  );
}
