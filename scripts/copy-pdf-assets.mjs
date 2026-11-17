import fs from "node:fs";
import path from "node:path";

const src = path.resolve("node_modules/pdfjs-dist");
const dest = path.resolve("public/pdfjs");

fs.mkdirSync(dest, { recursive: true });

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

copyFile(path.join(src, "build/pdf.worker.min.mjs"), path.join(dest, "pdf.worker.min.mjs"));

for (const dir of ["standard_fonts", "cmaps", "wasm", "iccs"]) {
  const from = path.join(src, dir);
  if (!fs.existsSync(from)) continue;
  for (const file of fs.readdirSync(from)) {
    const stat = fs.statSync(path.join(from, file));
    if (stat.isFile()) copyFile(path.join(from, file), path.join(dest, dir, file));
  }
}

console.log("PDF.js assets copied to public/pdfjs");
