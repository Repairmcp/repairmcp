/**
 * Copy linter for the public site.
 *
 * The writing rules for repairmcp.com are strict and easy to break by accident
 * six months from now, so they are enforced rather than remembered. Run as the
 * site's `test` task, which means `bun run test` at the repo root covers it.
 *
 *   bun scripts/check-copy.ts
 *
 * Exits 1 and names the file, line, and column of every violation.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PUBLIC_DIR = join(ROOT, "apps", "site", "public");

type Violation = { file: string; line: number; col: number; rule: string; detail: string };
const violations: Violation[] = [];

function add(file: string, src: string, index: number, rule: string, detail: string) {
  const before = src.slice(0, index);
  const line = before.split("\n").length;
  const col = index - before.lastIndexOf("\n");
  violations.push({ file, line, col, rule, detail });
}

/**
 * Phrases that legitimately contain an otherwise-banned word. Blanked out (not
 * deleted) before the word checks so every other offset stays put.
 */
const EXEMPT_PHRASES = [
  "Model Context Protocol", // the one expansion the brief allows
  // The brand mark splits "RepairMCP" across a tag so the last three letters
  // can carry the accent colour. That is the brand, not the acronym, but the
  // tag between them stops MCP_NOISE below from seeing one word.
  '<span class="brand-b">MCP</span>',
];

/**
 * Text quoted verbatim from someone else's interface is not our copy, so our
 * writing rules do not govern it. OpenAI's connector warning says "MCP" twice
 * and we quote it word for word on purpose: paraphrasing a security warning to
 * satisfy a house style rule would be worse writing and worse faith.
 *
 * Mark such text `<blockquote class="verbatim">`. Everything inside is blanked
 * before the word and acronym checks. This is the ONLY escape hatch, and it is
 * only honest if what is inside really is a quote.
 */
const VERBATIM_BLOCK = /<blockquote class="verbatim">[\s\S]*?<\/blockquote>/g;

/**
 * Tokens that contain "MCP" but are not the acronym being used as jargon: the
 * brand, the hostname, and the endpoint path.
 */
const MCP_NOISE = /repairmcp(?:\.com)?|\/mcp\b/gi;

/** Hype and AI-industry jargon. Word-boundary matched, case-insensitive. */
const BANNED_WORDS = [
  "seamless", "seamlessly", "revolutionary", "revolutionize", "game-changing",
  "game changer", "leverage", "leveraging", "supercharge", "supercharged",
  "unlock", "unlocks", "cutting-edge", "cutting edge", "state-of-the-art",
  "powerful", "effortless", "effortlessly", "delightful", "magical",
  "best-in-class", "world-class", "next-generation", "robust", "elevate",
  "empower", "empowers", "transformative", "harness", "unleash",
  "MCP client", "MCP server", "LLM", "LLMs", "large language model",
  "tool call", "tool calls", "tool-calling", "AI-powered", "AI-driven",
  "protocol", "endpoint", "JSON-RPC", "schema", "API",
];

function esc(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function htmlFiles(): string[] {
  return readdirSync(PUBLIC_DIR).filter((f) => f.endsWith(".html")).map((f) => join(PUBLIC_DIR, f));
}

for (const path of htmlFiles()) {
  const rel = relative(ROOT, path).replace(/\\/g, "/");
  const src = readFileSync(path, "utf8");

  // --- rule 1: no em dashes, no en dashes, ever ---------------------------
  for (const m of src.matchAll(/[—–]/g)) {
    const ch = m[0] === "—" ? "em dash" : "en dash";
    add(rel, src, m.index!, "no-dashes", `${ch} found. Use a full stop, a comma, or rewrite.`);
  }
  // ...including the HTML entity spellings, which the check above cannot see.
  for (const m of src.matchAll(/&(mdash|ndash|#8212|#8211|#x201[34]);/gi)) {
    add(rel, src, m.index!, "no-dashes", `"${m[0]}" is a dash entity. Use a full stop, a comma, or rewrite.`);
  }

  // Blank out exempt phrases and quoted UI text so their offsets survive but
  // their words do not. Dashes are checked above, deliberately: a quote is no
  // excuse to smuggle an em dash into our own markup.
  let scrubbed = src.replace(VERBATIM_BLOCK, (m) => " ".repeat(m.length));
  for (const phrase of EXEMPT_PHRASES) {
    scrubbed = scrubbed.replace(new RegExp(esc(phrase), "g"), (m) => " ".repeat(m.length));
  }

  // --- rule 2: no hype, no AI-industry jargon ----------------------------
  // Attribute values and tag names are copy too (alt text, titles), but the
  // tag names themselves are not, so strip the angle-bracket syntax first.
  const prose = scrubbed.replace(/<[^>]*>/g, (m) => " ".repeat(m.length));
  for (const word of BANNED_WORDS) {
    const re = new RegExp(`\\b${esc(word)}\\b`, "gi");
    for (const m of prose.matchAll(re)) {
      add(rel, src, m.index!, "banned-word", `"${m[0]}" is hype or jargon. Say it in shop language.`);
    }
  }

  // --- rule 3: the acronym appears exactly once, and expanded ------------
  const deNoised = scrubbed.replace(MCP_NOISE, (m) => " ".repeat(m.length));
  const acronyms = [...deNoised.matchAll(/\bMCP\b/g)];
  if (acronyms.length > 1) {
    for (const m of acronyms.slice(1)) {
      add(rel, src, m.index!, "mcp-once", `"MCP" appears ${acronyms.length} times. It is allowed once, expanded.`);
    }
  }
  if (acronyms.length === 1 && !src.includes("Model Context Protocol")) {
    add(rel, src, acronyms[0]!.index!, "mcp-once", `"MCP" used without expanding it to "Model Context Protocol" first.`);
  }

  // --- rule 4: every image is described and reserves its space ----------
  for (const m of src.matchAll(/<img\b[^>]*>/g)) {
    for (const attr of ["alt", "width", "height"]) {
      if (!new RegExp(`\\b${attr}=`).test(m[0])) {
        add(rel, src, m.index!, "img-attrs", `<img> is missing ${attr}. Layout shifts or screen readers break.`);
      }
    }

    // ...and the space it reserves has to be the space it actually takes.
    // Re-cropping a screenshot without updating these two numbers makes the
    // page jump while it loads, which no test would otherwise catch.
    const file = /src="\/img\/([^"]+)"/.exec(m[0])?.[1];
    const dw = Number(/\bwidth="(\d+)"/.exec(m[0])?.[1]);
    const dh = Number(/\bheight="(\d+)"/.exec(m[0])?.[1]);
    if (!file || !dw || !dh) continue;

    const imgPath = join(PUBLIC_DIR, "img", file);
    if (!existsSync(imgPath)) {
      add(rel, src, m.index!, "img-missing", `<img> points at /img/${file}, which is not on disk.`);
      continue;
    }
    const png = readFileSync(imgPath);
    // PNG: 8-byte signature, 4-byte chunk length, "IHDR", then width and
    // height as big-endian uint32. No decoder needed for the header.
    if (png.length > 24 && png.toString("ascii", 12, 16) === "IHDR") {
      const [aw, ah] = [png.readUInt32BE(16), png.readUInt32BE(20)];
      if (aw !== dw || ah !== dh) {
        add(rel, src, m.index!, "img-dimensions",
          `/img/${file} declares ${dw}x${dh} but is really ${aw}x${ah}. Update the attributes or re-crop.`);
      }
    }
  }

  // --- rule 5: nothing the Content-Security-Policy would silently kill --
  for (const m of src.matchAll(/<(script|iframe|form)\b/gi)) {
    add(rel, src, m.index!, "csp", `<${m[1]}> is blocked by the Content-Security-Policy in public/_headers.`);
  }
  for (const m of src.matchAll(/\sstyle="/g)) {
    add(rel, src, m.index!, "csp", `inline style attribute is blocked by the Content-Security-Policy. Put it in styles.css.`);
  }
  for (const m of src.matchAll(/\bhttp:\/\//g)) {
    add(rel, src, m.index!, "https-only", `plain http link. Use https.`);
  }
}

if (violations.length === 0) {
  console.log(`copy check: clean (${htmlFiles().length} file(s))`);
  process.exit(0);
}

violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.col - b.col);
for (const v of violations) {
  console.error(`${v.file}:${v.line}:${v.col}  [${v.rule}]  ${v.detail}`);
}
console.error(`\ncopy check: ${violations.length} violation(s)`);
process.exit(1);
