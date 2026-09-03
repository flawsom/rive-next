/**
 * Open Stream brand asset generator.
 *
 * Renders the Open Stream mark (round play badge + OPEN STREAM wordmark)
 * and writes every logo/icon asset the app references:
 *
 *   public/images/logo.svg            (transparent, accent mark)
 *   public/images/logoWhite.svg       (same mark)
 *   public/images/logoBlack.svg       (same mark)
 *   public/images/logo512.svg         (same mark)
 *   public/images/logo512.png         (512px, dark tile)
 *   public/images/logoSq.png          (1024px, dark tile)
 *   public/icons/icon-{192,256,384,512}.png (dark tile, PWA manifest)
 *
 * No external dependencies: PNG encoding is done by hand on top of Node's
 * built-in zlib (truecolor, non-interlaced). Run `node scripts/generate-logo.js`
 * to regenerate all assets after a brand change.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ACCENT = "#4f8cff"; // --ascent-color (dark theme)
const TILE = "#0a0e1a"; // manifest background_color

// ─── Vector mark ─────────────────────────────────────────────────────────────
// Round badge with a play glyph + "OPEN STREAM" wordmark below.
function markSvg({ fill = ACCENT, tile = null, size = 512 } = {}) {
  const bg = tile
    ? `<rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="${tile}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
${bg}
<g fill="${fill}">
  <path d="M ${size * 0.5} ${size * 0.42} m -${size * 0.3} 0 a ${size * 0.3} ${size * 0.3} 0 1 0 ${size * 0.6} 0 a ${size * 0.3} ${size * 0.3} 0 1 0 -${size * 0.6} 0 Z M ${size * 0.5} ${size * 0.42} m -${size * 0.225} 0 a ${size * 0.225} ${size * 0.225} 0 1 1 ${size * 0.45} 0 a ${size * 0.225} ${size * 0.225} 0 1 1 -${size * 0.45} 0 Z" fill-rule="evenodd"/>
  <path d="M ${size * 0.435} ${size * 0.29} L ${size * 0.635} ${size * 0.42} L ${size * 0.435} ${size * 0.55} Z"/>
  <rect x="${size * 0.1}" y="${size * 0.845}" width="${size * 0.8}" height="${size * 0.052}" rx="${size * 0.026}"/>
  <rect x="${size * 0.1}" y="${size * 0.71}" width="${size * 0.8}" height="${size * 0.052}" rx="${size * 0.026}"/>
  <rect x="${size * 0.655}" y="${size * 0.71}" width="${size * 0.245}" height="${size * 0.052}" rx="${size * 0.026}" fill="#ffffff" opacity="0.92"/>
  <rect x="${size * 0.1}" y="${size * 0.935}" width="${size * 0.8}" height="${size * 0.032}" rx="${size * 0.016}"/>
</g>
</svg>`;
}

// ─── Minimal PNG encoder (truecolor RGBA, non-interlaced) ────────────────────
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++)
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(
    crc32(Buffer.concat([Buffer.from(type, "ascii"), data])),
    8 + data.length,
  );
  return out;
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ─── Rasterization: supersampled coverage of the mark shapes ────────────────
// Rendered at 4x per pixel and averaged, so edges are smooth. Circle with an
// inner hole (ring), triangular play glyph, and rounded wordmark bars.
function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rasterize(size, { tile = null } = {}) {
  const S = 4; // supersampling factor
  const accent = hexToRgb(ACCENT);
  const white = [255, 255, 255];
  const tileRgb = tile ? hexToRgb(tile) : null;
  const rgba = Buffer.alloc(size * size * 4);

  const inRing = (x, y, rOuter, rInner, cx, cy) => {
    const dx = x - cx,
      dy = y - cy,
      d = Math.sqrt(dx * dx + dy * dy);
    return d <= rOuter && d >= rInner;
  };
  const inTriangle = (x, y) =>
    x >= size * 0.435 &&
    x <= size * 0.635 &&
    y >= size * 0.29 &&
    y <= size * 0.55 &&
    y - size * 0.29 <= (x - size * 0.435) * ((size * 0.26) / (size * 0.2)) &&
    y - size * 0.29 >= -(x - size * 0.435) * ((size * 0.26) / (size * 0.2));
  const inRounded = (x, y, rx, ry, rw, rh, rr) =>
    x >= rx &&
    x <= rx + rw &&
    y >= ry &&
    y <= ry + rh &&
    (x < rx + rr ||
      x > rx + rw - rr ||
      y < ry + rr ||
      y > ry + rh - rr ||
      (() => {
        const qx = x < rx + rr ? rx + rr : x > rx + rw - rr ? rx + rw - rr : x;
        const qy = y < ry + rr ? ry + rr : y > ry + rh - rr ? ry + rh - rr : y;
        return (x - qx) * (x - qx) + (y - qy) * (y - qy) <= rr * rr;
      })());

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hitAccent = 0,
        hitWhite = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = px + (sx + 0.5) / S;
          const y = py + (sy + 0.5) / S;
          if (
            inRing(x, y, size * 0.3, size * 0.225, size * 0.5, size * 0.42) ||
            inTriangle(x, y)
          )
            hitAccent++;
          if (
            inRounded(
              x,
              y,
              size * 0.1,
              size * 0.71,
              size * 0.555,
              size * 0.052,
              size * 0.026,
            ) ||
            inRounded(
              x,
              y,
              size * 0.1,
              size * 0.845,
              size * 0.8,
              size * 0.052,
              size * 0.026,
            ) ||
            inRounded(
              x,
              y,
              size * 0.1,
              size * 0.935,
              size * 0.8,
              size * 0.032,
              size * 0.016,
            )
          )
            hitAccent++;
          if (
            inRounded(
              x,
              y,
              size * 0.655,
              size * 0.71,
              size * 0.245,
              size * 0.052,
              size * 0.026,
            )
          )
            hitWhite++;
        }
      }
      const total = S * S;
      const aA = hitAccent / total,
        aW = hitWhite / total;
      const idx = (py * size + px) * 4;
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      if (tileRgb) {
        r = tileRgb[0];
        g = tileRgb[1];
        b = tileRgb[2];
        a = 255;
      }
      // White bar sits on top of the accent bars where they overlap.
      const wOver = aW;
      const baseA = aA * (1 - wOver);
      r = r * (1 - baseA - wOver) + accent[0] * baseA + white[0] * wOver;
      g = g * (1 - baseA - wOver) + accent[1] * baseA + white[1] * wOver;
      b = b * (1 - baseA - wOver) + accent[2] * baseA + white[2] * wOver;
      a = Math.min(
        255,
        Math.round((baseA + wOver) * 255 + a * (1 - baseA - wOver)),
      );
      if (!tileRgb) {
        rgba[idx] = Math.round(accent[0] * (1 - wOver) + white[0] * wOver);
        rgba[idx + 1] = Math.round(accent[1] * (1 - wOver) + white[1] * wOver);
        rgba[idx + 2] = Math.round(accent[2] * (1 - wOver) + white[2] * wOver);
        rgba[idx + 3] = a;
      } else {
        rgba[idx] = Math.round(r);
        rgba[idx + 1] = Math.round(g);
        rgba[idx + 2] = Math.round(b);
        rgba[idx + 3] = a;
      }
    }
  }
  return rgba;
}

function writeFileRel(rel, data) {
  const abs = path.join(process.cwd(), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, data);
  console.log(`  ✓ ${rel} (${(data.length / 1024).toFixed(1)} KB)`);
}

function main() {
  console.log("Open Stream — generating brand assets");

  // Vector marks. The app uses these as poster/placeholder and in headers;
  // transparent with accent fill works on both themes.
  const mark = markSvg({ size: 512 });
  writeFileRel("public/images/logo.svg", mark);
  writeFileRel(
    "public/images/logoWhite.svg",
    markSvg({ size: 512, fill: "#ffffff" }),
  );
  writeFileRel(
    "public/images/logoBlack.svg",
    markSvg({ size: 512, fill: "#0b1220" }),
  );
  writeFileRel("public/images/logo512.svg", mark);

  // Raster marks.
  console.log("  rasterizing (this is the slow part)…");
  writeFileRel(
    "public/images/logo512.png",
    encodePng(512, 512, rasterize(512, { tile: TILE })),
  );
  writeFileRel(
    "public/images/logoSq.png",
    encodePng(1024, 1024, rasterize(1024, { tile: TILE })),
  );
  for (const s of [192, 256, 384, 512]) {
    writeFileRel(
      `public/icons/icon-${s}x${s}.png`,
      encodePng(s, s, rasterize(s, { tile: TILE })),
    );
  }
  console.log("done.");
}

main();
