/**
 * Generates flat-colour placeholder PNGs at the exact dimensions the site
 * declares, so the layout is pixel-final before a single real screenshot
 * exists and nothing ever renders as a broken image.
 *
 * Every slot but og-image.png now holds a real capture, so this is a repair
 * tool rather than a scaffolding one: it fills a gap if an image is deleted or
 * a new step is added, and it never touches a file that is already there.
 *
 * Deliberately dependency-free: a flat image compresses to a couple of KB
 * through zlib, so hand-rolling the PNG chunks is cheaper than adding sharp
 * to the tree for a file we throw away.
 *
 *   bun scripts/make-placeholder-shots.ts            # fills only what is missing
 *   bun scripts/make-placeholder-shots.ts --force    # regenerate everything
 *
 * See apps/site/SCREENSHOT_MANIFEST.md for what each slot is.
 */

import { deflateSync } from "node:zlib";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const IMG_DIR = join(HERE, "..", "apps", "site", "public", "img");

/**
 * Never overwrite a file that already exists.
 *
 * This used to guess with a byte-size threshold, treating anything under 60 KB
 * as "still a placeholder". Then the real screenshots landed and most of them
 * came in under 60 KB, because tightly cropped flat UI compresses beautifully:
 * the account-menu capture is 13 KB. One run would have wiped nine real
 * captures and reported success. Existence is the only signal that cannot be
 * wrong. To deliberately regenerate one, delete it first.
 */
const FORCE = process.argv.includes("--force");

type Shot = { file: string; w: number; h: number };

/**
 * Must stay in step with the <img> width/height in index.html.
 *
 * These are now the real captured dimensions, not invented ones: every entry
 * except og-image.png has a real screenshot on disk and this script leaves
 * those alone. The list survives so that a deleted or corrupted image can be
 * replaced with a correctly sized grey box rather than a broken image, and so
 * a future shot has a documented target size.
 */
const SHOTS: Shot[] = [
  { file: "hero-claude-answer.png", w: 600, h: 554 },
  { file: "claude-01-settings.png", w: 320, h: 297 },
  { file: "claude-02-add-custom-connector.png", w: 782, h: 596 },
  { file: "claude-03-url-entered.png", w: 446, h: 430 },
  { file: "claude-04-connect.png", w: 617, h: 438 },
  { file: "claude-05-connected.png", w: 782, h: 596 },
  { file: "claude-06-always-allow.png", w: 782, h: 479 },
  { file: "chatgpt-01-developer-mode.png", w: 690, h: 610 },
  { file: "chatgpt-02-plugins-developer-mode.png", w: 690, h: 610 },
  { file: "chatgpt-03-new-plugin.png", w: 800, h: 345 },
  { file: "chatgpt-04-form-empty.png", w: 432, h: 724 },
  { file: "chatgpt-05-risk-warning.png", w: 420, h: 644 },
  { file: "chatgpt-06-connect.png", w: 584, h: 436 },
  { file: "chatgpt-07-connected.png", w: 496, h: 548 },
  { file: "og-image.png", w: 1200, h: 630 },
];

/** --paper-2 from styles.css, so a missing shot reads as a gap and not a bug. */
const FILL: [number, number, number] = [0xf4, 0xf2, 0xee];

function crcTable(): Uint32Array {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}
const CRC = crcTable();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function flatPng(w: number, h: number, [r, g, b]: [number, number, number]): Buffer {
  // One filter byte (0 = None) per scanline, then w RGB triples.
  const stride = 1 + w * 3;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const p = row + 1 + x * 3;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

if (!existsSync(IMG_DIR)) mkdirSync(IMG_DIR, { recursive: true });

let written = 0;
let kept = 0;

for (const shot of SHOTS) {
  const path = join(IMG_DIR, shot.file);

  if (existsSync(path) && !FORCE) {
    console.log(`  keep   ${shot.file}  (already on disk, left alone)`);
    kept++;
    continue;
  }

  writeFileSync(path, flatPng(shot.w, shot.h, FILL));
  console.log(`  write  ${shot.file}  ${shot.w}x${shot.h}`);
  written++;
}

console.log(`\n${written} placeholder(s) written, ${kept} existing file(s) left alone.`);
