// npm run art: turns the owner's originals in assets/brand/ (kept out of git) into the files the
// app uses (committed). Each part runs only if its original is there; without them the app keeps
// its placeholders (next.config.ts checks what exists).
//
//   icon-simple.png -> favicon 16 and 32 px          icon.png -> 48 (in favicon.ico), 180, 192, 512 px
//   menu-bg.png     -> public/art/menu-<w>.webp (720 and 1152 px wide, never enlarged) + its darkest walnut colour
//   card.png        -> public/art/card.webp + data/card-layout.json (the grey window and the cream nameplate)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const BRAND = "assets/brand";

/** Flood fill from the seeds over pixels where `match(i)` holds; returns the filled pixel indexes as a mask. */
function fill(width, height, seeds, match, mask = new Uint8Array(width * height)) {
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const add = (i) => {
    if (mask[i] || !match(i)) return;
    mask[i] = 1;
    queue[tail++] = i;
  };
  seeds.forEach(add);
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    if (x > 0) add(i - 1);
    if (x < width - 1) add(i + 1);
    if (i >= width) add(i - width);
    if (i + width < width * height) add(i + width);
  }
  return { mask, count: tail, filled: queue.subarray(0, tail) };
}

/** Connected regions where `match` holds, each with its pixel count and bounding box. */
function regions(width, height, match) {
  const seen = new Uint8Array(width * height);
  const out = [];
  for (let i = 0; i < width * height; i++) {
    if (seen[i] || !match(i)) continue;
    const { filled, count } = fill(width, height, [i], match, seen);
    let [x0, y0, x1, y1] = [width, height, 0, 0];
    for (const p of filled) {
      const x = p % width;
      const y = (p / width) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    out.push({ count, x0, y0, x1, y1 });
  }
  return out.sort((a, b) => b.count - a.count);
}

const rgb = (data, channels, i) => [data[i * channels], data[i * channels + 1], data[i * channels + 2]];
const isWhite = ([r, g, b]) => Math.min(r, g, b) >= 236 && Math.max(r, g, b) - Math.min(r, g, b) <= 12;

/** The white outside a rounded corner becomes transparent (raw RGBA, in place). */
function clearCorners({ data, width, height }) {
  const corners = [0, width - 1, (height - 1) * width, height * width - 1];
  const { filled } = fill(width, height, corners, (i) => isWhite(rgb(data, 4, i)));
  for (const p of filled) data[p * 4 + 3] = 0;
}

const pct = (v, of) => Math.round((v / of) * 10000) / 100;

/**
 * Finds the flat grey window and the cream nameplate on a card (raw RGBA pixels), as percentages
 * of the card's width and height. The nameplate is the biggest cream region below the window
 * (the cream around the window reaches above it, so it never counts).
 */
export function measureCard({ data, width, height }) {
  const px = (i) => rgb(data, 4, i);
  const grey = (i) => {
    const [r, g, b] = px(i);
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    return data[i * 4 + 3] > 0 && spread <= 12 && r >= 150 && r <= 225;
  };
  const isCream = (i) => {
    const [r, g, b] = px(i);
    return data[i * 4 + 3] > 0 && r >= 212 && g >= 200 && b >= 165 && r - b >= 22 && r - b <= 80;
  };
  // Painted frame lines can have faint gaps; widening every non-cream pixel by `pad` closes
  // them, so the nameplate stays its own region (its box is widened back by `pad` below).
  const pad = Math.max(2, Math.round(width * 0.008));
  const cream = (() => {
    let mask = Uint8Array.from({ length: width * height }, (_, i) => (isCream(i) ? 0 : 1));
    for (const [step, len] of [[1, width], [width, height]]) {
      const out = new Uint8Array(mask);
      for (let i = 0; i < width * height; i++) {
        if (!mask[i]) continue;
        const pos = step === 1 ? i % width : (i / width) | 0;
        for (let d = -pad; d <= pad; d++) if (pos + d >= 0 && pos + d < len) out[i + d * step] = 1;
      }
      mask = out;
    }
    return (i) => !mask[i];
  })();
  const [win] = regions(width, height, grey);
  if (!win || win.count < width * height * 0.05) throw new Error("card.png: no flat grey window found");
  const found = regions(width, height, cream).find((r) => r.y0 > win.y1 && r.count > width * height * 0.01);
  if (!found) throw new Error("card.png: no cream nameplate found below the window");
  const plate = { x0: found.x0 - pad, y0: found.y0 - pad, x1: found.x1 + pad, y1: found.y1 + pad };
  const box = (r) => ({ x: pct(r.x0, width), y: pct(r.y0, height), w: pct(r.x1 + 1 - r.x0, width), h: pct(r.y1 + 1 - r.y0, height) });
  // The corner radius: where the card starts on its top row.
  let corner = 0;
  while (corner < width / 2 && data[corner * 4 + 3] === 0) corner++;
  return { aspect: Math.round((width / height) * 10000) / 10000, radius: pct(corner, width), window: box(win), nameplate: box(plate) };
}

/** The darkest brown of the table: the average of the darkest 2 to 8 % of its brown pixels. */
export function walnut({ data, width, height, channels }) {
  const browns = [];
  for (let i = 0; i < width * height; i++) {
    const [r, g, b] = rgb(data, channels, i);
    if (r > g && g >= b && r - b >= 12) browns.push([r + g + b, r, g, b]);
  }
  browns.sort((a, b) => a[0] - b[0]);
  const slice = browns.slice(Math.floor(browns.length * 0.02), Math.max(1, Math.floor(browns.length * 0.08)));
  const avg = [1, 2, 3].map((k) => Math.round(slice.reduce((s, p) => s + p[k], 0) / slice.length));
  return `#${avg.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** An .ico holding PNG images (supported everywhere favicons are). */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, png }, n) => {
    const e = 6 + 16 * n;
    header[e] = size % 256;
    header[e + 1] = size % 256;
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(png.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.png)]);
}

async function rgba(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: 4 };
}
const fromRaw = (img) => sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } });

async function icons() {
  const simple = await rgba(`${BRAND}/icon-simple.png`);
  const full = await rgba(`${BRAND}/icon.png`);
  clearCorners(simple);
  clearCorners(full);
  const png = (img, size) => fromRaw(img).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  mkdirSync("public/icons", { recursive: true });
  const sizes = { 16: simple, 32: simple, 48: full, 180: full, 192: full, 512: full };
  const out = {};
  for (const [size, img] of Object.entries(sizes)) out[size] = await png(img, Number(size));
  writeFileSync("public/favicon.ico", ico([16, 32, 48].map((size) => ({ size, png: out[size] }))));
  for (const size of [16, 32, 192, 512]) writeFileSync(`public/icons/icon-${size}.png`, out[size]);
  writeFileSync("public/icons/apple-touch-icon.png", out[180]);
  return true;
}

async function menu() {
  const file = `${BRAND}/menu-bg.png`;
  const { width } = await sharp(file).metadata();
  mkdirSync("public/art", { recursive: true });
  const widths = [];
  for (const w of [720, 1152]) {
    const actual = Math.min(w, width);
    // A small original gives one file, not two of the same size.
    if (widths.some(([, a]) => a === actual)) continue;
    await sharp(file).resize({ width: actual }).webp({ quality: 80 }).toFile(`public/art/menu-${w}.webp`);
    widths.push([w, actual]);
  }
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  return { color: walnut({ data, width: info.width, height: info.height, channels: info.channels }), files: widths.map(([w, actual]) => ({ src: `/art/menu-${w}.webp`, width: actual })) };
}

async function card() {
  const trimmed = await sharp(`${BRAND}/card.png`).trim({ threshold: 20 }).toBuffer();
  const img = await rgba(trimmed);
  clearCorners(img);
  const layout = measureCard(img);
  mkdirSync("public/art", { recursive: true });
  await fromRaw(img).resize({ width: Math.min(720, img.width) }).webp({ quality: 85, alphaQuality: 90 }).toFile("public/art/card.webp");
  return layout;
}

async function main() {
  const has = (f) => existsSync(`${BRAND}/${f}`);
  const missing = ["icon.png", "icon-simple.png", "menu-bg.png", "card.png"].filter((f) => !has(f));
  if (missing.length) console.log(`Not in ${BRAND}/ (placeholders stay): ${missing.join(", ")}`);
  const art = JSON.parse(existsSync("data/art.json") ? readFileSync("data/art.json", "utf8") : "{}");
  if (has("icon.png") && has("icon-simple.png")) art.icons = await icons();
  if (has("menu-bg.png")) art.menu = await menu();
  writeFileSync("data/art.json", `${JSON.stringify(art, null, 2)}\n`);
  if (has("card.png")) writeFileSync("data/card-layout.json", `${JSON.stringify(await card(), null, 2)}\n`);
  console.log("Art done:", JSON.stringify({ ...art, card: existsSync("data/card-layout.json") }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
