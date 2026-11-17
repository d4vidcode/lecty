import dns from "node:dns/promises";
import net from "node:net";

const MAX_BYTES = 80 * 1024 * 1024;
const MAX_REDIRECTS = 4;

function fail(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

function blockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function blockedIpv6(ip: string): boolean {
  const value = ip.toLowerCase();
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("::ffff:")) {
    const mapped = value.slice(7);
    if (net.isIP(mapped) === 4) return blockedIpv4(mapped);
  }
  return (
    /^f[cd]/.test(value) ||
    /^fe[89ab]/.test(value) ||
    value.startsWith("ff")
  );
}

function blockedIp(ip: string): boolean {
  const kind = net.isIP(ip);
  if (kind === 4) return blockedIpv4(ip);
  if (kind === 6) return blockedIpv6(ip);
  return true;
}

async function assertPublicUrl(url: URL): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !host ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("Ese enlace apunta a una dirección privada.");
  }
  if (net.isIP(host)) {
    if (blockedIp(host)) {
      throw new Error("Ese enlace apunta a una dirección privada.");
    }
    return;
  }
  const addresses = await dns.lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error("No pudimos resolver el dominio del enlace.");
  }
  if (addresses.some((entry) => blockedIp(entry.address))) {
    throw new Error("Ese enlace apunta a una red privada.");
  }
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("url");
  if (!raw) return fail("Falta el enlace del PDF.", 400);

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return fail("El enlace no es válido.", 400);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return fail("Solo podemos descargar enlaces http o https.", 400);
  }
  if (target.username || target.password) {
    return fail("El enlace no puede incluir credenciales.", 400);
  }

  let current = target;
  let upstream: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    try {
      await assertPublicUrl(current);
    } catch (cause) {
      return fail(
        cause instanceof Error ? cause.message : "El enlace no es accesible.",
        403
      );
    }

    try {
      upstream = await fetch(current, {
        redirect: "manual",
        cache: "no-store",
        headers: {
          accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.5",
          "user-agent": "Lecty/1.0",
        },
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      return fail("No pudimos conectar con el servidor del PDF.", 502);
    }

    if ([301, 302, 303, 307, 308].includes(upstream.status)) {
      const location = upstream.headers.get("location");
      if (!location) return fail("El enlace redirige a una dirección no válida.", 502);
      try {
        current = new URL(location, current);
      } catch {
        return fail("El enlace redirige a una dirección no válida.", 502);
      }
      if (current.protocol !== "http:" && current.protocol !== "https:") {
        return fail("El enlace redirige a un protocolo no permitido.", 502);
      }
      continue;
    }
    break;
  }

  if (!upstream) return fail("No pudimos descargar el PDF.", 502);
  if (!upstream.ok) {
    return fail(
      `El servidor del PDF respondió ${upstream.status}.`,
      upstream.status === 404 ? 404 : 502
    );
  }
  if (!upstream.body) return fail("El servidor no devolvió el PDF.", 502);

  const type = (upstream.headers.get("content-type") ?? "").toLowerCase();
  if (type.includes("text/html")) {
    return fail("El enlace devuelve una página web, no un PDF.", 415);
  }

  const reader = upstream.body.getReader();
  let header = new Uint8Array(0);
  let received = 0;
  while (header.length < 5) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    received += value.length;
    const merged = new Uint8Array(header.length + value.length);
    merged.set(header);
    merged.set(value, header.length);
    header = merged;
  }
  if (received > MAX_BYTES) {
    await reader.cancel();
    return fail("El PDF supera los 80 MB.", 413);
  }
  if (new TextDecoder("latin1").decode(header.slice(0, 5)) !== "%PDF-") {
    await reader.cancel();
    return fail("El enlace no apunta a un PDF válido.", 415);
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(header);
      const pump = async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              return;
            }
            received += value.length;
            if (received > MAX_BYTES) {
              await reader.cancel();
              controller.error(new Error("El PDF supera los 80 MB."));
              return;
            }
            controller.enqueue(value);
          }
        } catch (cause) {
          controller.error(cause);
        }
      };
      void pump();
    },
    cancel(reason) {
      void reader.cancel(reason);
    },
  });

  return new Response(stream, {
    headers: {
      "cache-control": "no-store",
      "content-disposition": 'inline; filename="documento.pdf"',
      "content-type": "application/pdf",
      "x-content-type-options": "nosniff",
    },
  });
}
