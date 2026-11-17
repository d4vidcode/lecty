import fs from "node:fs";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";

const OUT = path.resolve("public/icons");
fs.mkdirSync(OUT, { recursive: true });

const PAPER = "#f3eee4";
const INK = "#1d1915";
const CREAM = "#f6f0e4";
const ACCENT = "#9b4a2e";
const GOLD = "#c7a46d";

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/**
 * An open book, drawn as two curved pages around a thin spine.
 * `scale` is relative to the icon size and keeps the glyph inside the
 * maskable safe zone.
 */
function drawBook(ctx, size, ink, paper, gold, scale = 1) {
  const cx = size / 2;
  const cy = size / 2 + size * 0.012;
  const w = size * 0.56 * scale;
  const h = size * 0.4 * scale;
  const gap = size * 0.028 * scale;

  const pagePath = (side) => {
    const dir = side === "left" ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + dir * gap, cy - h * 0.42);
    ctx.bezierCurveTo(
      cx + dir * w * 0.2,
      cy - h * 0.5,
      cx + dir * w * 0.38,
      cy - h * 0.47,
      cx + dir * w * 0.5,
      cy - h * 0.36
    );
    ctx.lineTo(cx + dir * w * 0.5, cy + h * 0.4);
    ctx.bezierCurveTo(
      cx + dir * w * 0.36,
      cy + h * 0.3,
      cx + dir * w * 0.18,
      cy + h * 0.34,
      cx + dir * gap,
      cy + h * 0.44
    );
    ctx.closePath();
  };

  // Soft page fill with a darker edge, then a crisp outline.
  ctx.fillStyle = paper;
  pagePath("left");
  ctx.fill();
  pagePath("right");
  ctx.fill();

  ctx.lineWidth = Math.max(1, size * 0.012 * scale);
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.28;
  pagePath("left");
  ctx.stroke();
  pagePath("right");
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Page rules.
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = Math.max(1, size * 0.009 * scale);
  for (const dir of [-1, 1]) {
    for (let i = 0; i < 3; i += 1) {
      const y = cy - h * 0.14 + i * h * 0.16;
      ctx.beginPath();
      ctx.moveTo(cx + dir * w * 0.15, y);
      ctx.quadraticCurveTo(
        cx + dir * w * 0.3,
        y - h * 0.02,
        cx + dir * w * 0.4,
        y
      );
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Gold bookmark ribbon.
  const ribbonW = size * 0.05 * scale;
  const ribbonTop = cy - h * 0.5;
  const ribbonBottom = cy + h * 0.2;
  ctx.fillStyle = gold;
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.16, ribbonTop);
  ctx.lineTo(cx + w * 0.16 + ribbonW, ribbonTop);
  ctx.lineTo(cx + w * 0.16 + ribbonW, ribbonBottom);
  ctx.lineTo(cx + w * 0.16 + ribbonW / 2, ribbonBottom - ribbonW * 0.9);
  ctx.lineTo(cx + w * 0.16, ribbonBottom);
  ctx.closePath();
  ctx.fill();

  // Spine shadow.
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.18;
  ctx.fillRect(cx - gap * 0.5, cy - h * 0.4, gap, h * 0.82);
  ctx.globalAlpha = 1;
}

function writeIcon(name, size, options = {}) {
  const { maskable = false } = options;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = maskable ? INK : PAPER;
  ctx.fillRect(0, 0, size, size);

  if (!maskable) {
    const inset = size * 0.075;
    roundedRect(ctx, inset, inset, size - inset * 2, size - inset * 2, size * 0.2);
    ctx.fillStyle = INK;
    ctx.fill();

    // A quiet paper edge, like the fore-edge of a closed book.
    roundedRect(
      ctx,
      size * 0.19,
      size * 0.19,
      size * 0.62,
      size * 0.62,
      size * 0.11
    );
    ctx.strokeStyle = PAPER;
    ctx.globalAlpha = 0.1;
    ctx.lineWidth = Math.max(1, size * 0.008);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = PAPER;
    ctx.globalAlpha = 0.06;
    ctx.beginPath();
    ctx.arc(size * 0.5, size * 0.5, size * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  drawBook(ctx, size, INK, CREAM, maskable ? GOLD : ACCENT, maskable ? 0.8 : 0.9);

  const file = path.join(OUT, name);
  fs.writeFileSync(file, canvas.toBuffer("image/png"));
  console.log(`icon ${name} (${size}px)`);
}

writeIcon("icon-192.png", 192);
writeIcon("icon-512.png", 512);
writeIcon("icon-maskable-512.png", 512, { maskable: true });
writeIcon("apple-touch-icon.png", 180);
