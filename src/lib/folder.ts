export type ImportedFile = {
  file: File;
  /** Ruta relativa dentro de la carpeta elegida, sin barra inicial. */
  path: string;
};

type FileWithPath = File & { webkitRelativePath?: string };

function pathOf(file: File): string {
  const relative = (file as FileWithPath).webkitRelativePath;
  return relative && relative.trim() ? relative : file.name;
}

export function collectFromFileList(list: FileList | null): ImportedFile[] {
  if (!list) return [];
  return Array.from(list).map((file) => ({ file, path: pathOf(file) }));
}

function readAllEntries(directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = directory.createReader();
    const entries: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(entries);
          return;
        }
        entries.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

function fileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walkEntry(entry: FileSystemEntry, basePath: string): Promise<ImportedFile[]> {
  if (entry.isFile) {
    const file = await fileFromEntry(entry as FileSystemFileEntry);
    return [{ file, path: basePath ? `${basePath}/${entry.name}` : entry.name }];
  }

  if (entry.isDirectory) {
    const directory = entry as FileSystemDirectoryEntry;
    const nextBase = basePath ? `${basePath}/${entry.name}` : entry.name;
    const children = await readAllEntries(directory);
    const nested = await Promise.all(
      children.map((child) => walkEntry(child, nextBase))
    );
    return nested.flat();
  }

  return [];
}

/**
 * Recorre carpetas soltadas en la ventana. `DataTransfer.files` solo incluye
 * los archivos de primer nivel, así que usamos las entradas del sistema de
 * archivos cuando el navegador las ofrece.
 */
export async function collectFromDataTransfer(
  transfer: DataTransfer | null
): Promise<ImportedFile[]> {
  if (!transfer) return [];

  const items = Array.from(transfer.items ?? []);
  const entries = items
    .filter((item) => item.kind === "file")
    .map((item) => {
      try {
        return item.webkitGetAsEntry?.() ?? null;
      } catch {
        return null;
      }
    });

  if (entries.some((entry) => entry?.isDirectory)) {
    const collected = await Promise.all(
      entries.map((entry) => (entry ? walkEntry(entry, "") : Promise.resolve([])))
    );
    const flat = collected.flat();
    if (flat.length > 0) return flat;
  }

  return Array.from(transfer.files ?? []).map((file) => ({
    file,
    path: pathOf(file),
  }));
}

export function isPdfPath(path: string): boolean {
  return /\.pdf$/i.test(path.split(/[\\/]/).pop() ?? "");
}
