const MAX_INPUT_BYTES = 12 * 1024 * 1024;

/**
 * Convierte una imagen elegida por el usuario en una portada ligera
 * (JPEG en data URL) para poder guardarla en localStorage sin agotarlo.
 */
export async function resizeImageToDataUrl(
  file: File,
  maxSize = 640,
  quality = 0.82
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("La portada debe ser una imagen.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new Error("La imagen supera los 12 MB.");
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No pudimos preparar la portada.");

    context.fillStyle = "#fdfaf3";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No pudimos leer la imagen."));
    image.src = src;
  });
}
