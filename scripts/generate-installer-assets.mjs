import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "src-tauri", "installer-assets");
const cssPath = path.join(root, "src", "styles.css");
const logoPath = path.join(root, "src", "assets", "multi-converter-icon-brand-orange.svg");

mkdirSync(outDir, { recursive: true });

const tokens = readCssTokens(readFileSync(cssPath, "utf8"));
const logo = readLogoTokens(readFileSync(logoPath, "utf8"));
const palette = {
  appBg: cssColor("--app-bg", "#f5f3ec"),
  paper: cssColor("--paper", "#fffdf7"),
  paperStrong: cssColor("--paper-strong", "#fffaf0"),
  surface: cssColor("--surface", "#fffdf7"),
  surfaceTint: cssColor("--surface-tint", "#e5f0eb"),
  ink: cssColor("--ink", "#1d241f"),
  inkSoft: cssColor("--ink-soft", "#34423b"),
  muted: cssColor("--muted", "#70766f"),
  quiet: cssColor("--quiet", "#92968f"),
  line: cssColor("--line", "#ded9cc"),
  lineStrong: cssColor("--line-strong", "#c6c0b4"),
  accent: cssColor("--accent", "#c86a34"),
  accentSoft: cssColor("--accent-soft", "#f5e4d8"),
  brandGreen: cssColor("--brand-green", "#3f7664"),
  logoFill: hexToRgb(logo.fill),
  logoStroke: hexToRgb(logo.stroke),
  logoDot: hexToRgb(logo.dot),
};

writeBmp(path.join(outDir, "nsis-header.bmp"), 150, 57, (canvas) => {
  drawAppBackground(canvas, 150, 57, 0.55);
  canvas.rect(0, 55, 150, 2, palette.line);
  drawBrandLogo(canvas, 9, 7, 43, palette.paper);
  canvas.roundRect(58, 11, 82, 14, 7, blend(palette.paper, palette.appBg, 0.82));
  canvas.roundRect(58, 11, 82, 14, 7, palette.line, 1);
  canvas.roundRect(63, 16, 30, 4, 2, palette.ink);
  canvas.roundRect(98, 16, 32, 4, 2, palette.accent);
  canvas.roundRect(58, 33, 66, 8, 4, palette.paper);
  canvas.roundRect(58, 33, 66, 8, 4, palette.line, 1);
  canvas.roundRect(63, 36, 42, 2, 1, palette.muted);
});

writeBmp(path.join(outDir, "nsis-sidebar.bmp"), 164, 314, (canvas) => {
  drawAppBackground(canvas, 164, 314, 1);
  canvas.rect(0, 0, 5, 314, palette.accent);
  canvas.rect(5, 0, 1, 314, blend(palette.ink, palette.appBg, 0.08));

  drawBrandLogo(canvas, 28, 32, 108, palette.appBg);

  canvas.roundRect(18, 161, 128, 48, 18, blend(palette.surface, palette.appBg, 0.86));
  canvas.roundRect(18, 161, 128, 48, 18, palette.line, 1);
  canvas.roundRect(30, 176, 76, 7, 4, palette.ink);
  canvas.roundRect(30, 190, 92, 4, 2, palette.accent);
  canvas.roundRect(30, 198, 56, 3, 2, palette.muted);

  canvas.roundRect(18, 224, 128, 38, 12, blend(palette.paper, palette.appBg, 0.78));
  canvas.roundRect(18, 224, 128, 38, 12, palette.line, 1);
  canvas.circle(35, 243, 8, palette.accentSoft);
  canvas.circle(35, 243, 4, palette.accent);
  canvas.roundRect(50, 236, 72, 5, 3, palette.inkSoft);
  canvas.roundRect(50, 248, 48, 3, 2, palette.muted);

  canvas.roundRect(18, 278, 128, 16, 8, blend(palette.paper, palette.appBg, 0.86));
  canvas.roundRect(18, 278, 128, 16, 8, palette.line, 1);
  canvas.roundRect(23, 283, 74, 6, 3, palette.accent);
});

function drawAppBackground(canvas, width, height, opacity) {
  canvas.clear(palette.appBg);
  const grid = blend(palette.ink, palette.appBg, 0.045 * opacity);
  for (let x = 0; x < width; x += 24) canvas.rect(x, 0, 1, height, grid);
  for (let y = 0; y < height; y += 24) canvas.rect(0, y, width, 1, grid);
}

function drawBrandLogo(canvas, x, y, size, backdrop) {
  const s = size / 512;
  const shadow = blend(logoColor("#23201c"), backdrop, 0.1);
  canvas.roundRect(x + (70 + 28) * s, y + (58 + 28) * s, 372 * s, 372 * s, 78 * s, shadow);
  canvas.roundRect(x + 70 * s, y + 58 * s, 372 * s, 372 * s, 78 * s, palette.logoFill);
  canvas.roundRect(x + 70 * s, y + 58 * s, 372 * s, 372 * s, 78 * s, palette.logoStroke, 15 * s);
  canvas.roundRect(x + (70 + 94) * s, y + (58 + 177) * s, 184 * s, 22 * s, 11 * s, palette.logoStroke);
  canvas.roundRect(x + (70 + 177) * s, y + (58 + 94) * s, 22 * s, 184 * s, 11 * s, palette.logoStroke);
  canvas.circle(x + (70 + 264) * s, y + (58 + 270) * s, 38 * s, palette.logoDot);
}

function readCssTokens(css) {
  const tokenMap = new Map();
  const rootBlock = css.match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  for (const match of rootBlock.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokenMap.set(match[1], match[2]);
  }
  return tokenMap;
}

function readLogoTokens(svg) {
  const fills = Array.from(svg.matchAll(/fill="(#[0-9a-fA-F]{6})"/g)).map((match) => match[1]);
  return {
    fill: fills[1] ?? "#fffdf8",
    stroke: svg.match(/stroke="(#[0-9a-fA-F]{6})"/)?.[1] ?? "#23201c",
    dot: fills.at(-1) ?? "#c86a34",
  };
}

function cssColor(name, fallback) {
  return hexToRgb(tokens.get(name) ?? fallback);
}

function logoColor(value) {
  return hexToRgb(value);
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => part + part)
          .join("")
      : normalized.slice(0, 6);
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function blend(fg, bg, alpha) {
  return [
    Math.round(fg[0] * alpha + bg[0] * (1 - alpha)),
    Math.round(fg[1] * alpha + bg[1] * (1 - alpha)),
    Math.round(fg[2] * alpha + bg[2] * (1 - alpha)),
  ];
}

function writeBmp(file, width, height, draw) {
  const scale = 4;
  const canvas = scaledCanvas(createCanvas(width * scale, height * scale), scale);
  draw(canvas);
  const source = downsample(canvas.raw, width, height, scale);
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixelSize = rowStride * height;
  const headerSize = 54;
  const buffer = Buffer.alloc(headerSize + pixelSize);
  buffer.write("BM", 0, "ascii");
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(headerSize, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(width, 18);
  buffer.writeInt32LE(height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixelSize, 34);
  buffer.writeInt32LE(2835, 38);
  buffer.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const src = ((height - 1 - y) * width + x) * 3;
      const dst = headerSize + y * rowStride + x * 3;
      buffer[dst] = source[src + 2];
      buffer[dst + 1] = source[src + 1];
      buffer[dst + 2] = source[src];
    }
  }
  writeFileSync(file, buffer);
}

function scaledCanvas(raw, scale) {
  return {
    raw,
    clear(color) {
      raw.clear(color);
    },
    rect(x, y, w, h, color) {
      raw.rect(Math.round(x * scale), Math.round(y * scale), Math.round(w * scale), Math.round(h * scale), color);
    },
    circle(cx, cy, r, color) {
      raw.circle(Math.round(cx * scale), Math.round(cy * scale), Math.round(r * scale), color);
    },
    roundRect(x, y, w, h, r, color, inset = 0) {
      raw.roundRect(x * scale, y * scale, w * scale, h * scale, r * scale, color, inset * scale);
    },
  };
}

function downsample(canvas, width, height, scale) {
  const output = Buffer.alloc(width * height * 3);
  const sourceWidth = width * scale;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const totals = [0, 0, 0];
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const src = ((y * scale + sy) * sourceWidth + (x * scale + sx)) * 3;
          totals[0] += canvas.pixels[src];
          totals[1] += canvas.pixels[src + 1];
          totals[2] += canvas.pixels[src + 2];
        }
      }
      const dst = (y * width + x) * 3;
      output[dst] = Math.round(totals[0] / (scale * scale));
      output[dst + 1] = Math.round(totals[1] / (scale * scale));
      output[dst + 2] = Math.round(totals[2] / (scale * scale));
    }
  }
  return output;
}

function createCanvas(width, height) {
  const pixels = Buffer.alloc(width * height * 3);
  const canvas = {
    pixels,
    clear(color) {
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) set(x, y, color);
      }
    },
    rect(x, y, w, h, color) {
      for (let yy = y; yy < y + h; yy += 1) {
        for (let xx = x; xx < x + w; xx += 1) set(xx, yy, color);
      }
    },
    circle(cx, cy, r, color) {
      const radius = Math.max(0, r);
      for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
        for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
          if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) set(x, y, color);
        }
      }
    },
    roundRect(x, y, w, h, r, color, inset = 0) {
      const border = Math.max(0, inset);
      for (let yy = Math.floor(y); yy <= Math.ceil(y + h); yy += 1) {
        for (let xx = Math.floor(x); xx <= Math.ceil(x + w); xx += 1) {
          if (!containsRoundRect(xx, yy, x, y, w, h, r)) continue;
          if (border > 0 && containsRoundRect(xx, yy, x + border, y + border, w - border * 2, h - border * 2, Math.max(0, r - border))) continue;
          set(xx, yy, color);
        }
      }
    },
  };

  function containsRoundRect(px, py, x, y, w, h, r) {
    if (w <= 0 || h <= 0) return false;
    const x0 = x;
    const y0 = y;
    const x1 = x + w;
    const y1 = y + h;
    const radius = Math.min(Math.max(0, r), w / 2, h / 2);
    if (px < x0 || py < y0 || px > x1 || py > y1) return false;
    const nx = px < x0 + radius ? x0 + radius : px > x1 - radius ? x1 - radius : px;
    const ny = py < y0 + radius ? y0 + radius : py > y1 - radius ? y1 - radius : py;
    return (px - nx) ** 2 + (py - ny) ** 2 <= radius ** 2;
  }

  function set(x, y, [r, g, b]) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = (Math.floor(y) * width + Math.floor(x)) * 3;
    pixels[index] = r;
    pixels[index + 1] = g;
    pixels[index + 2] = b;
  }

  return canvas;
}
